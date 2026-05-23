# Hana Chat Deployment: Fully VPS

Hana Chat runs as one self-hosted VPS deployment on the Playground host:

- `apps/web` builds into a Next.js container.
- Caddy publishes `80` and `443` and routes public traffic.
- The NestJS API/services plus Postgres, Redis, Qdrant, Neo4j, Redpanda, ClickHouse, and Temporal stay on the private Docker network.

## Public Access

- Current raw-IP product URL: `https://18.61.174.6`
- Temporary HTTP entry: `http://18.61.174.6`, which redirects to HTTPS after serving ACME challenge files.
- Future public site: `https://hanachat.live`
- Future authenticated app: `https://app.hanachat.live`
- Future API edge: `https://api.hanachat.live`

The raw-IP HTTPS route uses a Let's Encrypt IP-address certificate with the `shortlived` profile.
Keep the renewal cron from [Playground VPS Deployment](playground-vps-deployment.md) active.

For the full Portainer/runtime breakdown of every `hana-chat-vps-*` container, see
[VPS Container Map](vps-container-map.md).

## Environment

Use `/opt/hana-chat/shared/.env.vps` on the VPS. Required public-edge values:

```bash
VPS_PUBLIC_IP=18.61.174.6
PUBLIC_WEB_URL=https://18.61.174.6
WEB_PORT=3000
API_GATEWAY_PORT=4000
ACME_EMAIL=support@hanachat.site
CERTBOT_WEBROOT_PATH=/opt/hana-chat/shared/certbot-webroot
LETSENCRYPT_PATH=/opt/hana-chat/shared/letsencrypt
```

Keep domain values ready for the later switch:

```bash
WEB_ORIGIN=https://app.hanachat.live
WEB_ORIGINS=https://app.hanachat.live,https://hanachat.live,https://www.hanachat.live
API_GATEWAY_URL=https://api.hanachat.live
AUTH_COOKIE_DOMAIN=.hanachat.live
```

The web container overrides `API_GATEWAY_URL` to `http://api-gateway:4000` so web route handlers
call the API over the private Docker network. Raw-IP auth uses host-only cookies; domain traffic uses
`.hanachat.live`.

The Playground VPS env has xAI configured. Razorpay and Twilio values are expected to remain
placeholder/missing until the live provider accounts are added. Do not commit or paste provider
secrets.

## Start

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
curl -fsS -I https://18.61.174.6/
curl -fsS https://18.61.174.6/manifest.webmanifest
curl -fsS https://18.61.174.6/robots.txt
curl -fsS https://18.61.174.6/sitemap.xml
curl -fsS https://18.61.174.6/llms.txt
```
