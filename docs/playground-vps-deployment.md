# Playground VPS Deployment

Hana Chat is deployed side-by-side on the Playground EC2 host under `/opt/hana-chat`.

For a Portainer-friendly explanation of every running `hana-chat-vps-*` container, see
[VPS Container Map](vps-container-map.md).

## Release From Windows

Deploy from the repo root with the LF-safe helper:

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
