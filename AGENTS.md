# Hana Chat Agent Guide

This is a production product repository. Keep changes production-oriented, typed, and connected end to end.

## First Read

1. `README.md`
2. `docs/architecture.md`
3. `docs/character-marketplace-system.md`
4. `docs/memory-architecture.md`
5. `.agents/memory/hana-chat.md`

## Product Rules

- Consumer UI must stay black with hotpink primary. Do not add gradients.
- Use Lucide icons, not emoji placeholders.
- Keep landing/auth copy consumer-facing. Do not expose internal stack, abuse controls, or security mechanisms in marketing copy.
- Character creation, marketplace, chat, memory, billing, settings, and legal pages should never end in dead screens.
- Memory used in chat is per user, per character, per conversation.

## Engineering Rules

- TypeScript must stay strict and shared contracts belong in `packages/contracts`.
- Database shape belongs in `infra/database/migrations` and `packages/database`.
- API gateway changes should use typed Kysely queries and Zod validation.
- Keep Qdrant as the vector retrieval layer and Neo4j as the graph projection target.
- Prefer focused, readable modules over giant utility files.
- Use `rg` for searches and keep generated `dist` artifacts in sync when package entrypoints depend on them.

## Verification

Run the relevant subset while iterating, then finish with:

```powershell
pnpm typecheck
pnpm lint
pnpm test
pnpm product:smoke
pnpm ai:harness
pnpm web:smoke
```

If infrastructure changed:

```powershell
pnpm infra:up
pnpm infra:bootstrap
docker compose -f docker-compose.vps.yml config
```

## Agent Memory Sync

Update `.agents/memory/hana-chat.md` whenever a durable product or architecture decision changes.
