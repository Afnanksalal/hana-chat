# Hana Chat Architecture

This document is the implementation map for the current Hana Chat codebase.

## Runtime Topology

```mermaid
flowchart LR
  User["Web / PWA user"] --> Caddy["Caddy public edge on VPS"]
  Caddy --> Web["Next.js web container"]
  Web --> Gateway["NestJS API Gateway"]
  Gateway --> Postgres["Postgres canonical data"]
  Gateway --> Qdrant["Qdrant vector retrieval"]
  Gateway --> Xai["xAI chat completions"]
  Gateway --> Redis["Redis cache / rate state"]
  Gateway --> Razorpay["Razorpay Orders"]
  Gateway --> RazorpayX["RazorpayX Payouts"]
  Gateway --> Redpanda["Redpanda event log"]
  Gateway --> Temporal["Temporal workflows"]
  Gateway --> ClickHouse["ClickHouse analytics"]
  Gateway --> Neo4j["Neo4j graph memory"]
  Redpanda --> Workers["Worker services"]
  Workers --> Qdrant
  Workers --> Neo4j
  Workers --> ClickHouse
```

## Request Flow

```mermaid
sequenceDiagram
  participant Web as Next.js app
  participant API as API Gateway
  participant DB as Postgres
  participant Vec as Qdrant
  participant Model as xAI

  Web->>API: POST /v1/chat/messages
  API->>DB: Validate session, entitlement, character, conversation
  API->>Vec: Search memory by user + character + conversation
  Vec-->>API: Relevant memory IDs
  API->>DB: Load active memory facts
  API->>DB: Upsert conversation evolution profile
  API->>Model: Persona + scoped memory + evolution + recent messages
  Model-->>API: Assistant reply
  API->>DB: Persist user/assistant messages
  API->>DB: Extract simple memory into same conversation
  API->>DB: Refresh conversation evolution profile
  API->>Vec: Upsert memory vector
  API-->>Web: Assistant message + usage + safety + trial + evolution state
```

## Monetization Flow

```mermaid
sequenceDiagram
  participant Web as Next.js app
  participant API as API Gateway
  participant DB as Postgres ledger
  participant Razorpay as Razorpay Orders
  participant Admin as Admin dashboard
  participant RazorpayX as RazorpayX Payouts

  Web->>API: POST /v1/monetization/character-purchases
  API->>DB: Check paid unlock and 30-message character trial
  API-->>Web: Open trial chat while trial remains
  Web->>API: POST /v1/monetization/character-purchases
  API->>DB: Create idempotent purchase row after trial exhaustion
  API->>Razorpay: Create checkout order when provider is live
  Razorpay-->>Web: Checkout completes
  Web->>API: POST /v1/monetization/character-purchases/verify
  API->>DB: Verify signature, mark paid, write creator ledger
  API->>DB: Hold net earnings until 7-day release window
  Web->>API: POST /v1/monetization/payouts
  API->>DB: Reserve available wallet balance
  Admin->>API: POST /v1/admin/monetization/payouts/:id/process
  API->>RazorpayX: Send idempotent payout when selected
  API->>DB: Mark paid, processing, or failed and reconcile wallet
```

## Source Boundaries

- `apps/web`: consumer web app, PWA, landing, auth, app shell, marketplace, chat, creator tools.
- `services/api-gateway`: product API and currently active orchestration path.
- `services/*`: deployable NestJS service shells for future extraction.
- `packages/contracts`: shared validation schemas and branded types.
- `packages/database`: typed Kysely database model.
- `packages/*-core`: reusable domain logic.
- `infra/database/migrations`: canonical schema migrations.
- `infra/docker`: production service image.

## Runtime Boundaries

The deployed VPS contains more containers than the immediate request path because Hana is organized
around production-grade bounded contexts.

- **Public edge:** `caddy` is the only public container. It owns `80/443`, TLS, ACME, redirects, and
  reverse proxying.
- **Frontend:** `web` serves the Next.js product UI and same-origin route handlers. It is private and
  reachable through Caddy only.
- **Active API:** `api-gateway` owns the current production API and active orchestration path.
- **Domain services:** `identity-service`, `risk-service`, `chat-orchestrator`, `memory-service`,
  `retrieval-service`, `graph-service`, `moderation-service`, `billing-service`, `creator-service`,
  and `notification-service` are private NestJS bounded-context runtimes. They are deployed from day
  one so logic can be extracted from the gateway without reworking Docker, health checks, networking,
  or env loading.
- **Workers:** `batch-orchestrator` and `worker-service` process private batch/projection work.
- **State:** Postgres, Redis, Qdrant, Neo4j, Redpanda, Temporal, and ClickHouse are split by storage
  workload rather than squeezed into one database.

For a Portainer-friendly explanation of every running container, see
[VPS Container Map](vps-container-map.md).

## Deployment

- Frontend: Next.js container on the VPS behind Caddy.
- VPS: Caddy, Next.js web, API gateway, worker services, Postgres, Qdrant, Neo4j, Redis, Redpanda, Temporal, ClickHouse.
- Secrets: `.env` locally, VPS environment or secret manager in production. Never commit live secrets.
- Current Playground access: `https://18.61.174.6` serves the full product through a Let's Encrypt IP-address certificate.
- Domains when ready: `hanachat.live` for public landing/legal/crawler routes, `app.hanachat.live` for authenticated app routes, and `api.hanachat.live` for the API gateway.
- Auth cookies use `AUTH_COOKIE_DOMAIN=.hanachat.live` on matching domain hosts, and fall back to host-only cookies on raw-IP access.
- Next.js and NestJS both emit defensive security headers; production API and SSE responses redact unexpected internal error messages.
- Production CORS origins are validated through `WEB_ORIGIN` and every entry in `WEB_ORIGINS`; localhost or non-HTTPS origins fail fast in production.
- Production chat responses do not expose internal model-routing data to clients.
