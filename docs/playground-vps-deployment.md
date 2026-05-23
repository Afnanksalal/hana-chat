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

The overlay only publishes `80` and `443` for Caddy. The API gateway still binds to
`127.0.0.1:4000` on the host and is also reachable inside the Docker network as
`api-gateway:4000`.

## Public Routing

- `api.hanachat.live` should point to the Playground VPS public IPv4 address.
- `hanachat.live`, `www.hanachat.live`, and `app.hanachat.live` should point to Vercel unless the
  frontend is intentionally moved to this VPS.
- Caddy terminates TLS for `api.hanachat.live` and proxies to the API gateway.

## Firewall

Open inbound:

- `22/tcp` from trusted admin IPs only.
- `80/tcp` from `0.0.0.0/0` and `::/0` for ACME HTTP-01 and HTTP redirects.
- `443/tcp` from `0.0.0.0/0` and `::/0` for public API traffic.

Do not expose Postgres, Redis, Qdrant, Neo4j, Redpanda, Temporal, ClickHouse, or service health
ports publicly.
