# Security Hardening Pass

Date: 2026-05-24

This pass audited the current Hana Chat repo for security leaks, dead routes, unused assets,
production config drift, dependency advisories, and deployment foot-guns. It is a code-level cleanup
record, not a marketing or roadmap document.

## Scope Checked

- Auth start/verify routes, session cookie handling, API proxying, and production error behavior.
- Chat orchestration, SSE error payloads, model route disclosure, and guardrail failure handling.
- Billing, Stellar order creation, email verification delivery, creator payout surfaces, and proof-based settlement
  production guards.
- Production config validation, CORS origin parsing, security headers, Docker Compose defaults, and
  crawler/PWA asset references.
- Dead-end scans for unused mascot assets, stale memory routes, non-production markers, and raw
  settlement response leaks.
- Dependency audit using `pnpm audit --prod`.

## Findings Fixed

- Replaced verification-code fallback generation with `crypto.randomInt` so local/development codes are not based on
  `Math.random`.
- Added production redaction for `DomainError` instances with `INTERNAL` code in the shared NestJS
  exception filter.
- Added production redaction for SSE unexpected/internal errors.
- Stopped exposing `modelRoute` in production chat responses while keeping it visible in development
  and harness runs.
- Removed raw settlement and email-delivery response bodies from thrown app errors; only HTTP status is
  carried forward.
- Redacted more sensitive log fields including session tokens, cookies, payment credentials,
  payout account numbers, email encryption/hash secrets, and session secrets.
- Added production validation for every comma-separated `WEB_ORIGINS` entry, not only the primary
  `WEB_ORIGIN`.
- Escaped landing-page JSON-LD before `dangerouslySetInnerHTML` so future structured-data strings
  cannot close the script tag.
- Removed the unused raw mascot-head PNG export; the app now keeps only the assets referenced by the
  manifest, nav logo, creator defaults, smoke tests, and metadata.
- Removed unrestricted Neo4j APOC procedure configuration from the VPS compose file because the app
  does not require APOC.
- Added a `postcss` override to `8.5.15`; `pnpm audit --prod` now reports no known vulnerabilities.

## Intentional Non-Issues

- `apps/web/app/app/memory/page.tsx` remains as a compatibility redirect to `/app/chat`. Removing it
  would turn old app links into 404s, so keeping the redirect prevents a dead end.
- The web CSP still allows inline scripts/styles where Next.js and payment checkout integration need
  them today. A nonce or strict-dynamic CSP migration is a future hardening project, not a hidden
  defect.
- Buyer checkout and creator payout settlement use the same Stellar proof path in development and
  production; smoke tests exercise disabled monetization gates instead of alternate settlement paths.

## Verification Performed

```powershell
pnpm audit --prod
pnpm format:check
pnpm typecheck
pnpm lint
pnpm test
pnpm build
pnpm infra:bootstrap
docker compose -f docker-compose.vps.yml config --quiet
pnpm product:smoke
pnpm ai:harness
pnpm web:smoke
```

Results:

- `pnpm audit --prod`: passed, no known vulnerabilities.
- `pnpm format:check`: passed.
- `pnpm typecheck`: passed, 43/43 tasks successful.
- `pnpm lint`: passed.
- `pnpm test`: passed, 43/43 tasks successful.
- `pnpm build`: passed, 29/29 tasks successful.
- `pnpm infra:bootstrap`: passed.
- `docker compose -f docker-compose.vps.yml config --quiet`: passed with temporary non-secret interpolation values.
- `pnpm product:smoke`: passed, 17/17 checks.
- `pnpm ai:harness`: passed, 12/12 checks.
- `pnpm web:smoke`: passed on `http://localhost:3001`, 16/16 checks.

## Follow-Up Checks

- Continue finishing every release with `pnpm test`, `pnpm product:smoke`, `pnpm ai:harness`, and
  `pnpm web:smoke`.
- Run `docker compose -f docker-compose.vps.yml config` before VPS deploys.
- Add a CSP nonce/strict-dynamic migration when payment checkout and Next.js script paths are ready for
  it.
- Replace deterministic embeddings with a production embedding provider and batch replay once cost and
  latency targets are settled.
