# Playground VPS Deployment

Hana Chat is deployed side-by-side on the Playground EC2 host under `/opt/hana-chat`.

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

- `https://18.61.174.6` serves the full product while the domain is not ready.
- `http://18.61.174.6` redirects to the HTTPS IP route except for ACME challenge files.
- `api.hanachat.live` should point to the Playground VPS public IPv4 address when the domain is
  ready.
- `hanachat.live`, `www.hanachat.live`, and `app.hanachat.live` should also point to the VPS for the
  fully self-hosted deployment.
- Caddy terminates TLS for domain traffic, proxies domain web traffic to the Next.js web container,
  and proxies `api.hanachat.live` to the API gateway.

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
