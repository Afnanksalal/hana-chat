# Hana Chat Deployment: Vercel Web, VPS Stack

Hana Chat is split deliberately:

- `apps/web` deploys to Vercel.
- The NestJS API/services plus Postgres, Redis, Qdrant, Neo4j, Redpanda, ClickHouse, and Temporal run on the VPS behind a reverse proxy.

## Vercel

Deploy `apps/web` as the Vercel project root, then set:

- `NEXT_PUBLIC_SITE_URL=https://hanachat.live`
- `NEXT_PUBLIC_APP_URL=https://app.hanachat.live`
- `WEB_ORIGIN=https://app.hanachat.live`
- `WEB_ORIGINS=https://app.hanachat.live,https://hanachat.live,https://www.hanachat.live`
- `API_GATEWAY_URL=https://api.hanachat.live`
- `SESSION_SECRET=<same signing secret used by the API>`
- `AUTH_COOKIE_NAME=hana_session`
- `AUTH_COOKIE_DOMAIN=.hanachat.live`

The web app uses Next App Router metadata routes for `/manifest.webmanifest`, `/robots.txt`, `/sitemap.xml`, `/llms.txt`, and `/llms-full.txt`.
Use `hanachat.live` for the public site and `app.hanachat.live` for authenticated pages.
The shared cookie domain lets the public landing page switch signed-in users from "Sign in" to "Dashboard" even when the session was created on `app.hanachat.live`.
Interactive buttons and links inside the web app should stay root-relative (`/auth`, `/app`,
`/legal/terms`) so local, preview, and production environments use the current origin. Keep absolute
domain helpers for canonical SEO, sitemap, robots, and LLM crawler output only.

`apps/web/next.config.ts` emits the production Content Security Policy, HSTS, referrer policy, frame-denial, MIME-sniffing, and permissions headers. Keep Razorpay checkout origins in the CSP while billing uses Razorpay.

## VPS

Create a production env file from `.env.vps.example`:

```bash
cp .env.vps.example .env.vps
```

Replace every placeholder secret. In production, `DEV_ADMIN_PHONE_NUMBER` must stay unset.
Keep `MEDIA_STORAGE_DIR=/var/lib/hana/media`; the API gateway mounts this as a persistent Docker
volume so creator-uploaded avatars and cover images survive container rebuilds.

Start the stack:

```bash
export HANA_ENV_FILE=.env.vps
docker compose --env-file .env.vps -f docker-compose.vps.yml up -d --build
```

Expose only the API through your reverse proxy. The compose file binds the API gateway to `127.0.0.1:4000`; databases and queues stay inside the Docker network.
Nest services also emit defensive headers and redact unexpected error messages in production, but the reverse proxy should still terminate TLS and set HSTS.

Example Caddy route:

```caddy
api.hanachat.live {
  header Strict-Transport-Security "max-age=31536000; includeSubDomains; preload"
  reverse_proxy 127.0.0.1:4000 {
    flush_interval -1
  }
}
```

## Ops Consoles

Temporal UI and Redpanda Console are behind the `ops` profile and bind to localhost only:

```bash
export HANA_ENV_FILE=.env.vps
docker compose --env-file .env.vps -f docker-compose.vps.yml --profile ops up -d temporal-ui redpanda-console
```

Use an SSH tunnel for access instead of opening these ports publicly.

## Verification

Run these before pointing real traffic at the VPS:

```bash
export HANA_ENV_FILE=.env.vps
docker compose --env-file .env.vps -f docker-compose.vps.yml ps
curl -fsS http://127.0.0.1:4000/health
curl -fsS https://api.hanachat.live/health
```

Then verify Vercel has the correct crawl/PWA endpoints:

```bash
curl -fsS https://hanachat.live/manifest.webmanifest
curl -fsS https://hanachat.live/robots.txt
curl -fsS https://hanachat.live/sitemap.xml
curl -fsS https://hanachat.live/llms.txt
```
