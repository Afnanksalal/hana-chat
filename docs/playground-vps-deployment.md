# Playground VPS Deployment

Hana Chat is deployed side-by-side on the Playground EC2 host under `/opt/hana-chat`.

For a Portainer-friendly explanation of every running `hana-chat-vps-*` container, see
[VPS Container Map](vps-container-map.md).

## Release From Windows

The normal production path is PR CI followed by the `Deploy Playground` GitHub Actions workflow on
`master`. Codex agents should use that path and should not run the app stack or deploy helper
locally unless the user explicitly grants a local runtime/deploy exception.

Manual operator fallback from the repo root uses the LF-safe helper:

```powershell
$env:PLAYGROUND_SSH_TARGET = "ubuntu@18.61.174.6"
# Optional when ssh-agent is not already holding the Playground key:
# $env:PLAYGROUND_SSH_KEY = "C:\path\to\playground.pem"
pnpm deploy:playground
```

The helper uploads `tmp/deploy/hana-chat-<release>.tar`, extracts it into
`/opt/hana-chat/releases/<release>`, flips `/opt/hana-chat/current`, sources
`/opt/hana-chat/shared/.env.vps`, and runs compose config/build/up/ps. The generated remote shell
script is written with LF endings only so PowerShell cannot add CRLF or a BOM.

## Environment File

`/opt/hana-chat/shared/.env.vps` is the production source of truth. The deploy script shell-sources
this file before running Docker Compose, so values containing spaces or shell metacharacters must be
quoted, for example:

```bash
SMTP_FROM="Hana Chat <no-reply@app.hanachat.site>"
SMTP_RELAY_MYNETWORKS="127.0.0.0/8 10.0.0.0/8 172.16.0.0/12 192.168.0.0/16"
```

Do not replace the live VPS env with a freshly generated local env file. Existing Postgres, Neo4j,
ClickHouse, and Temporal volumes keep their original credentials; changing only environment
passwords can make health checks and application connections fail against already-initialized data.
When editing production env, back up `/opt/hana-chat/shared/.env.vps`, patch only the intended keys,
then run compose config and targeted service restarts.

## Compose Files

Use the base VPS stack plus the Playground Caddy overlay:

```bash
export HANA_ENV_FILE=/opt/hana-chat/shared/.env.vps
docker compose \
  -f /opt/hana-chat/current/docker-compose.vps.yml \
  -f /opt/hana-chat/current/infra/deploy/playground/docker-compose.playground.yml \
  --project-name hana-chat-vps \
  up -d --build
```

The overlay publishes only `80` and `443` publicly through Caddy. The web app binds to
`127.0.0.1:3000` on the host, the API gateway binds to `127.0.0.1:4000`, and both are reachable
inside the Docker network as `web:3000` and `api-gateway:4000`.

## Public Routing

- `https://hanachat.site` serves the public landing, legal, SEO, sitemap, robots, and crawler routes.
- `https://app.hanachat.site` serves the authenticated app/PWA surface.
- `https://api.hanachat.site` proxies to the API gateway.
- `https://18.61.174.6` remains available for direct-IP smoke testing.
- `http://18.61.174.6` redirects to the HTTPS IP route except for ACME challenge files.
- `hanachat.site`, `www.hanachat.site`, `app.hanachat.site`, and `api.hanachat.site` should all
  point to the Playground VPS public IPv4 address.
- The active Playground Caddyfile serves both domain traffic and the raw-IP fallback.

The web container overrides `API_GATEWAY_URL` to `http://api-gateway:4000`, so browser traffic stays
same-origin through Next.js route handlers while server-to-server API calls stay inside the Docker
network.

## IP Certificate

The raw-IP HTTPS route uses a Let's Encrypt IP-address certificate. These certificates are
short-lived, so renewal must run daily.

Initial issue if Caddy is not yet serving the challenge path:

```bash
docker stop hana-chat-vps-caddy-1
/opt/hana-chat/current/infra/deploy/playground/issue-ip-cert.sh /opt/hana-chat/shared/.env.vps standalone
docker compose \
  -f /opt/hana-chat/current/docker-compose.vps.yml \
  -f /opt/hana-chat/current/infra/deploy/playground/docker-compose.playground.yml \
  --project-name hana-chat-vps \
  up -d caddy
```

Renewal after Caddy is running:

```bash
/opt/hana-chat/current/infra/deploy/playground/issue-ip-cert.sh /opt/hana-chat/shared/.env.vps
```

Recommended cron:

```cron
17 3 * * * /opt/hana-chat/current/infra/deploy/playground/issue-ip-cert.sh /opt/hana-chat/shared/.env.vps >> /opt/hana-chat/shared/ip-cert-renew.log 2>&1
```

## Firewall

Open inbound:

- `22/tcp` from trusted admin IPs only.
- `80/tcp` from `0.0.0.0/0` and `::/0` for ACME HTTP-01 and HTTP redirects.
- `443/tcp` from `0.0.0.0/0` and `::/0` for public web and API traffic.

Do not expose Postgres, Redis, Qdrant, Neo4j, Redpanda, Temporal, ClickHouse, or service health
ports publicly.
