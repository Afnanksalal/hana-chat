# Hana Chat

Hana Chat is a private, production-oriented AI companion platform: Next.js web app, NestJS API gateway, typed TypeScript packages, Postgres, Qdrant, Neo4j, Redis, Redpanda, Temporal, and ClickHouse.

The product centers on creator-owned characters, a premium marketplace, passwordless email identity, safety gates, and per-character/per-chat memory. Paid plans and creator monetization remain in the codebase but are server-gated as "coming soon" until a payment gateway is approved for the product category.

## Quick Start

```powershell
pnpm install
pnpm infra:up
pnpm infra:bootstrap
pnpm dev
```

Web defaults to `http://localhost:3000`. If another desktop tool owns `3000`, run the web app on
another port and pass that URL to the smoke test:

```powershell
pnpm --filter @hana/web exec next start --port 3001
$env:WEB_BASE_URL='http://localhost:3001'; pnpm web:smoke
```

The API gateway defaults to `http://localhost:4000`.

## Local Test Cast

For manual end-to-end testing with a clean database, bring the stack up, bootstrap infra, then seed
the admin account and fourteen generated characters:

```powershell
pnpm infra:up
pnpm infra:bootstrap
pnpm seed:local
```

The seed uses `ADMIN_EMAIL` from `.env`, updates that account to `Afnan K Salal`, creates fourteen
creator-owned characters, uploads generated media through the real media API, opens one conversation
per character, and writes per-conversation memories for multi-persona testing.

## Verification

```powershell
pnpm typecheck
pnpm lint
pnpm test
pnpm product:smoke
pnpm seo:audit
pnpm ai:harness
pnpm web:smoke
```

## Current Product Surface

- Character builder with profile image, cover image, templates, persona, scenario, speaking style, model profile, tags, rating, pricing, and publish controls.
- Marketplace with category filters, search, image-led cards, stats, tags, monetization-ready character records, and fresh-room starts into chat.
- Chat orchestration through xAI with private identity, risk, chat-planning, billing, moderation, memory-policy, retrieval, graph, and batch boundaries, strict input/output guardrails, entitlement checks, usage limits, SSE streaming, durable memory injection, and an evolving per-chat relationship profile.
- Memory scoped by `user_id + character_id + conversation_id`; no global user memories are injected into chat context.
- Billing plans, crypto checkout flow, creator wallet ledger, 7-day creator earning hold, crypto payout profiles, and admin payout operations are preserved behind `MONETIZATION_ENABLED`; current public billing and creator monetization copy shows "coming soon."
- Batch-orchestrator outbox leasing, Qdrant replay, and Neo4j chat-turn plus memory projection.
- Admin command center with real analytics for growth, marketplace momentum, model latency, safety pressure, memory depth, queue health, service-boundary backlogs, payout ops, and audit events.
- PWA, Android TWA packaging, SEO metadata routes, crawler files, secure headers, raw-IP VPS access, shared `.hanachat.site` auth cookies, and fully self-hosted VPS deployment docs.

## Core Docs

- [Architecture](docs/architecture.md)
- [Character Marketplace System](docs/character-marketplace-system.md)
- [Creator Monetization and Payouts](docs/monetization-payouts.md)
- [0G Memory and Crypto Monetization Strategy](docs/0g-memory-and-crypto-monetization.md)
- [Admin Analytics and Observability](docs/admin-analytics-observability.md)
- [Memory Architecture](docs/memory-architecture.md)
- [Technical Blueprint](docs/hana-chat-technical-blueprint.md)
- [User Flows](docs/hana-chat-user-flows.md)
- [UI/UX Direction](docs/hana-chat-ui-ux-direction.md)
- [Identity and Abuse Prevention](docs/hana-chat-identity-and-abuse-prevention.md)
- [Email Auth and Admin Access](docs/auth-email-setup.md)
- [Development Guide](docs/development.md)
- [VPS Deployment](docs/deployment-vps.md)
- [Playground VPS Deployment](docs/playground-vps-deployment.md)
- [VPS Container Map](docs/vps-container-map.md)
- [Domain Integration](docs/domain-integration.md)
- [Android TWA Packaging](docs/android-twa.md)
- [SEO and AI Discovery](docs/seo-ai-discovery.md)
- [Guardrails and SSE](docs/guardrails-and-sse.md)
- [AI Harness](docs/ai-harness.md)
- [Product and Market Audit](docs/product-market-audit-2026.md)
- [Production VPS Status Audit](docs/production-vps-status-audit-2026-06-18.md)
- [Security Hardening Pass](docs/security-hardening-pass-2026-05-24.md)

## Agent Context

Future coding agents should start with [AGENTS.md](AGENTS.md) and the synced memory folder in [.agents/memory](.agents/memory/README.md).
