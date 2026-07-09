# Hana Chat Deployment: Fully VPS

Hana Chat runs as one self-hosted VPS deployment on the Playground host:

- `apps/web` builds into a Next.js container.
- Caddy publishes `80` and `443` and routes public traffic.
- The NestJS API/services plus Postgres, Redis, Qdrant, Neo4j, Redpanda, ClickHouse, and Temporal stay on the private Docker network.

## Public Access

- Current raw-IP product URL: `https://18.61.174.6`
- Temporary HTTP entry: `http://18.61.174.6`, which redirects to HTTPS after serving ACME challenge files.
- Public site: `https://hanachat.site`
- Authenticated app: `https://app.hanachat.site`
- API edge: `https://api.hanachat.site`

The raw-IP HTTPS route stays available for direct IP testing and uses a Let's Encrypt IP-address
certificate with the `shortlived` profile. Keep the renewal cron from
[Playground VPS Deployment](playground-vps-deployment.md) active.

For the full Portainer/runtime breakdown of every `hana-chat-vps-*` container, see
[VPS Container Map](vps-container-map.md).

## Environment

Use `/opt/hana-chat/shared/.env.vps` on the VPS. Required public-edge values:

```bash
VPS_PUBLIC_IP=18.61.174.6
PUBLIC_WEB_URL=https://hanachat.site
NEXT_PUBLIC_SITE_URL=https://hanachat.site
NEXT_PUBLIC_APP_URL=https://app.hanachat.site
WEB_PORT=3000
API_GATEWAY_PORT=4000
ACME_EMAIL=support@hanachat.site
CERTBOT_WEBROOT_PATH=/opt/hana-chat/shared/certbot-webroot
LETSENCRYPT_PATH=/opt/hana-chat/shared/letsencrypt
ANDROID_APK_DOWNLOAD_URL=/downloads/hana-chat-twa.apk
ANDROID_DOWNLOADS_PATH=/opt/hana-chat/shared/android-downloads
ANDROID_TWA_PACKAGE_ID=com.hanachat.app
ANDROID_TWA_SHA256_CERT_FINGERPRINTS=<release-signing-cert-sha256>
WEB_ORIGIN=https://app.hanachat.site
WEB_ORIGINS=https://app.hanachat.site,https://hanachat.site,https://www.hanachat.site
API_GATEWAY_URL=https://api.hanachat.site
AUTH_COOKIE_DOMAIN=.hanachat.site
MONETIZATION_ENABLED=false
SMTP_HOST=smtp-relay
SMTP_FROM=Hana Chat <no-reply@app.hanachat.site>
SMTP_RELAY_HOSTNAME=mail.app.hanachat.site
SMTP_RELAY_ALLOWED_SENDER_DOMAINS=app.hanachat.site
MAIL_DKIM_KEYS_DIR=/opt/hana-chat/shared/opendkim-keys
```

The web container overrides `API_GATEWAY_URL` to `http://api-gateway:4000` so web route handlers
call the API over the private Docker network. Domain traffic uses `.hanachat.site` cookies; direct IP
testing remains available but is not the canonical SEO/auth host.

The Playground VPS env supports `TEXT_MODEL_PROVIDER=agentrouter` for text routing, with xAI kept
for image generation and optional `TEXT_MODEL_FALLBACK_PROVIDER=xai` resilience. Monetization uses
Stellar payments when `MONETIZATION_ENABLED=true` and `STELLAR_PAYMENTS_ENABLED=true`; set
`STELLAR_TREASURY_ADDRESS` before enabling paid checkout. SMTP is handled by the
lightweight `smtp-relay` Postfix container on the private Docker network; keep DKIM keys under
`/opt/hana-chat/shared/opendkim-keys` and do not commit private keys.

AgentRouter's OpenAI-compatible base URL is `https://agentrouter.org/v1`, so chat completions route
to `https://agentrouter.org/v1/chat/completions`. If VPS probes return `text/html` with an Aliyun WAF
challenge instead of JSON, keep `TEXT_MODEL_FALLBACK_PROVIDER=xai` enabled and contact AgentRouter for
backend traffic allowlisting before removing fallback.

Generate the DKIM key before first production mail send:

```bash
cd /opt/hana-chat/current
set -a; . /opt/hana-chat/shared/.env.vps; set +a
pnpm mail:dkim app.hanachat.site mail /opt/hana-chat/shared/opendkim-keys
```

## Start

Preferred deploy from the workstation:

```powershell
$env:PLAYGROUND_SSH_TARGET = "ubuntu@18.61.174.6"
# Optional when ssh-agent is not already holding the key:
# $env:PLAYGROUND_SSH_KEY = "C:\path\to\playground.pem"
pnpm deploy:playground
```

The deploy helper packages tracked plus untracked repo files, uploads a tarball, writes the remote
deploy script with LF-only line endings, then runs compose config/build/up/ps on the VPS. This is the
safe path from Windows because it avoids CRLF/BOM shell-script failures during the final compose
steps.

Manual start on the VPS:

```bash
cd /opt/hana-chat/current
set -a; . /opt/hana-chat/shared/.env.vps; set +a
export HANA_ENV_FILE=/opt/hana-chat/shared/.env.vps
docker compose \
  -f docker-compose.vps.yml \
  -f infra/deploy/playground/docker-compose.playground.yml \
  --project-name hana-chat-vps \
  up -d --build
```

## Ops Consoles

Temporal UI and Redpanda Console are behind the `ops` profile and bind to localhost only:

```bash
cd /opt/hana-chat/current
set -a; . /opt/hana-chat/shared/.env.vps; set +a
export HANA_ENV_FILE=/opt/hana-chat/shared/.env.vps
docker compose -f docker-compose.vps.yml --profile ops up -d temporal-ui redpanda-console
```

Use an SSH tunnel for access instead of opening these ports publicly.

## Verification

```bash
cd /opt/hana-chat/current
set -a; . /opt/hana-chat/shared/.env.vps; set +a
export HANA_ENV_FILE=/opt/hana-chat/shared/.env.vps
docker compose \
  -f docker-compose.vps.yml \
  -f infra/deploy/playground/docker-compose.playground.yml \
  --project-name hana-chat-vps \
  ps
curl -fsS http://127.0.0.1:3000/
curl -fsS http://127.0.0.1:4000/health
curl -fsS -I https://hanachat.site/
curl -fsS -I https://app.hanachat.site/app
curl -fsS https://api.hanachat.site/health
curl -fsS https://hanachat.site/manifest.webmanifest
curl -fsS https://hanachat.site/robots.txt
curl -fsS https://hanachat.site/sitemap.xml
curl -fsS https://hanachat.site/llms.txt
curl -fsS https://app.hanachat.site/.well-known/assetlinks.json
curl -fsS -I https://app.hanachat.site/downloads/hana-chat-twa.apk
curl -fsS -I https://18.61.174.6/
curl -fsS https://18.61.174.6/manifest.webmanifest
curl -fsS https://18.61.174.6/robots.txt
curl -fsS https://18.61.174.6/sitemap.xml
curl -fsS https://18.61.174.6/llms.txt
```

## Android APK Download

The landing page shows the Android APK button only when `ANDROID_APK_DOWNLOAD_URL` is set. The
Playground overlay mounts `ANDROID_DOWNLOADS_PATH` into the web container at
`/app/apps/web/public/downloads`, so keep the signed TWA APK in:

```bash
/opt/hana-chat/shared/android-downloads/hana-chat-twa.apk
```

See [Android TWA Packaging](android-twa.md) for signing, Digital Asset Links, and domain cutover
details.
