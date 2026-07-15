# Hana Chat Agent Guide

This is a production product repository. Keep changes production-oriented, typed, and connected end to end.

## First Read

1. `README.md`
2. `docs/architecture.md`
3. `docs/character-marketplace-system.md`
4. `docs/memory-architecture.md`
5. `docs/documentation-maintenance.md`
6. `.agents/memory/hana-chat.md`

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

For Codex and other automation agents, do not run the Hana Chat app stack, Docker Compose stack, or
deploy/runtime services locally. Use GitHub Actions and the Playground VPS for runtime checks,
deployment verification, service smoke tests, and infrastructure validation unless the user
explicitly grants a one-off local runtime exception.

When dependency artifacts are already installed and the user allows local non-runtime checks, the
safe local subset is:

```powershell
pnpm format:check
pnpm typecheck
pnpm lint
pnpm test
```

Runtime smoke and harness checks should run through GitHub Actions or the Playground VPS:

```powershell
pnpm product:smoke
pnpm ai:harness
pnpm web:smoke
gh pr checks <pr-number>
gh run watch <deploy-run-id> --exit-status
```

Human developers may still use the local workflow in `docs/development.md`, but agent verification
must prefer PR CI and Playground deployment workflows so local disk usage stays low and the deployed
stack remains the source of truth.

## Agent Memory Sync

Update `.agents/memory/hana-chat.md` whenever a durable product or architecture decision changes.
