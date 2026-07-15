# Hana Chat Development

This page documents the human local-development workflow. Codex and other automation agents should
not run the app stack, Docker Compose stack, or deploy/runtime services locally on this workstation.
Agent verification should use pull-request CI and the Playground VPS deploy workflow unless the user
explicitly grants a local runtime exception.

## Prerequisites

- Node.js 20.19+
- pnpm 10+
- Docker Desktop

## Install

```bash
pnpm install
```

## Human Local Infrastructure

Skip this section for agent work. It is only for human developers with enough local disk and Docker
capacity.

```bash
pnpm infra:up
```

Services:

- API gateway: http://localhost:4000/health
- Identity service: http://localhost:4010/health
- Risk service: http://localhost:4020/health
- Chat orchestrator: http://localhost:4030/health
- Memory service: http://localhost:4040/health
- Retrieval service: http://localhost:4050/health
- Graph service: http://localhost:4060/health
- Moderation service: http://localhost:4070/health
- Web app: http://localhost:3000
- Qdrant: http://localhost:6333/dashboard
- Neo4j browser: http://localhost:7474
- Redpanda console: http://localhost:8080
- Temporal UI: http://localhost:8233
- ClickHouse HTTP: http://localhost:8123

## Human Local Run

Skip this section for agent work. Runtime behavior should be checked through GitHub Actions and the
Playground VPS.

```bash
pnpm dev
```

For a production-mode local manual test, build the changed packages and run the two active product
processes directly:

```powershell
pnpm --filter @hana/api-gateway build
pnpm --filter @hana/web build
node services/api-gateway/dist/main.js
pnpm --filter @hana/web exec next start --port 3000
```

If `localhost:3000` is already held by another desktop tool, keep the API on `4000` and start the
web server on `3001`:

```powershell
pnpm --filter @hana/web exec next start --port 3001
$env:WEB_BASE_URL='http://localhost:3001'; pnpm web:smoke
```

Manual test URL in that case is `http://localhost:3001`.

## Human Local Test Cast

Skip this section for agent work unless the user explicitly asks for local database seeding.

Use the local seed when you want a clean manual-testing account with enough variety to exercise
marketplace, private characters, chat rooms, image media, and per-conversation memory:

```powershell
pnpm infra:up
pnpm infra:bootstrap
pnpm seed:local
```

The seed resets local media generated for the test run, signs in with `ADMIN_EMAIL`,
updates the account to `Afnan K Salal`, uploads generated character images through `/v1/media`, and
creates fourteen creator-owned conversations with scoped memories and conversation evolution rows.
Mature/adult personas remain private creator-owned rooms, while general/teen personas appear in
Discover. Product smoke expects monetization to be gated by default and verifies paid plans,
paid-character unlocks, and creator payout setup return "coming soon."

Product smoke, web smoke, and the AI harness use the seeded cast. They should not create persistent
`Smoke`, `Web Smoke`, or `Harness` marketplace characters.

## Quality Gates

For agents, PR CI is the authoritative gate. If dependencies are already installed and the user
allows local non-runtime checks, the relevant static/unit subset is:

```bash
pnpm format:check
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

## Database

Initial PostgreSQL schema is in:

```text
infra/database/migrations/001_initial.sql
```

Human developers can apply it locally after `pnpm infra:up`:

```bash
docker exec -i hana-postgres psql -U hana -d hana < infra/database/migrations/001_initial.sql
```

## Architecture Notes

- PostgreSQL is the canonical relational source of truth.
- Qdrant is the semantic retrieval projection.
- Neo4j is the relationship, identity-abuse, character, and story graph projection.
- Redpanda/Kafka carries durable events.
- Temporal owns durable workflows and retries.
- Redis is hot state and rate-limit infrastructure, not the durable queue backbone.
- Local web/API responses include security headers so browser testing stays close to production behavior.
