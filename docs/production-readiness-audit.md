# Hana Chat Golden Audit

Date: 2026-05-25

## Verdict

This pass closed the highest-risk dead ends found across auth, billing, creator monetization, chat safety, memory isolation, queue processing, deployment config, and mobile product polish. The codebase now has a deployable NestJS/Next.js product spine with real Postgres durability, Qdrant projections, Neo4j projection workers, payment-provider verification paths, creator wallet ledger, admin payout operations, passwordless email auth, strict production config validation, PWA/SEO routes, and authenticated web flows.

Hana Chat still has dedicated product projects before it should be sold as a fully mature consumer
platform: voice runtime, refund/tax/KYC operations, reports/moderation ops UI, production embedding
provider, and load testing. Those are tracked as explicit hardening work rather than hidden dead
ends.

## Fixed In This Pass

- Removed browser JSON exposure of raw session tokens from web auth proxy responses.
- Removed middleware HMAC-only session acceptance so revoked sessions require API validation.
- Blocked auth open redirects by allowing only safe relative `next` paths.
- Added production email verification wiring for auth start/check, plus email/device/IP code rate limits.
- Hardened production config so placeholder xAI, payment-provider, SMTP, Postgres, Neo4j, ClickHouse, identity, and session secrets fail fast.
- Made Razorpay webhooks fail closed without a secret, idempotent by event id, amount/currency/status checked, and no longer activates on `payment.authorized`.
- Added one-active-subscription data protection and transactional subscription activation.
- Prevented mature/adult pending-review characters from being public or directly chat-accessible without creator ownership.
- Hid mature/adult characters from unauthenticated public marketplace results.
- Added mature/adult chat gating through the safety core.
- Persisted chat input/output safety decisions into `safety.decisions`.
- Moved creator persona and memory context out of the system prompt into an explicitly untrusted context packet.
- Filtered `safety` and `system` memory kinds out of prompt retrieval and rejected manual writes of those kinds.
- Added safety checks for character builder content and manual memory writes.
- Added optimized `COUNT(*)` usage checks and short-window chat rate limits.
- Added `client_message_id` idempotency for chat sends.
- Added Qdrant timeouts and memory `last_used_at` updates.
- Hardened outbox leases with expired-lock recovery, worker-owned ack/fail, and `dead_letter` status.
- Turned `worker-service` from a health-only shell into a real projection worker for Qdrant and Neo4j outbox events.
- Added active private service calls in the auth/chat/worker hot paths: `identity-service` for identity
  checks, `risk-service` for verification abuse scoring, `chat-orchestrator` for model/prompt planning,
  `billing-service` for entitlements and paid-character access, `moderation-service` for
  input/output safety, `memory-service` for memory write policy, `retrieval-service` for hybrid
  memory ranking, `graph-service` for Neo4j-backed per-conversation personalization, and
  `batch-orchestrator` for worker outbox lease/ack/fail.
- Added `chat.turn.completed` projection into Neo4j with absolute counts, so graph personalization
  survives worker retries without double-counting.
- Removed readiness topology leakage from API readiness responses.
- Made VPS compose require `HANA_ENV_FILE` and required production secrets instead of silently defaulting to example passwords.
- Removed visible `Ready` status noise from app pages, added mobile-accessible sign out, disabled current-plan checkout, and made marketplace search hit the backend query path.
- Fixed creator publish messaging so pending review is not called published.
- Kept PWA, manifest, sitemap, robots, and LLM crawler routes aligned to `hanachat.site`, `app.hanachat.site`, and `api.hanachat.site`.
- Added shared `.hanachat.site` auth-cookie configuration so landing CTAs can route signed-in users directly to the dashboard across public/app subdomains.
- Added web CSP/security headers, API defensive headers, and production redaction for unexpected API errors.
- Redacted production SSE internal errors and production chat model-route fields, removed raw provider response bodies from app errors, and expanded logger secret redaction.
- Replaced local verification-code fallback generation with cryptographic randomness, validated every production `WEB_ORIGINS` entry, removed unused raw mascot assets, and removed unrestricted Neo4j APOC config from the VPS compose file.
- Cleared the dependency audit by overriding `postcss` to `8.5.15`.
- Reworked shared UI polish across landing, dashboard, marketplace, creator, chat, settings, auth, legal, and mobile while preserving pure black plus hotpink and avoiding gradients.
- Adjusted the landing hero so the next section remains visible on desktop and mobile instead of behaving like a sealed pitch slide.
- Added per-character paid unlocks, creator wallets, ledgered earnings, payout profiles, payout requests, admin profile verification, admin payout processing, and RazorpayX refresh/failure recovery.

## Remaining Product Projects

- Voice: plan/settings flags exist, but TTS/STT/realtime voice APIs, playback UI, credit metering, and storage policy still need implementation before selling voice as a finished feature.
- Creator monetization operations: paid unlocks, wallet ledger, payout profiles, payout requests, and admin payout processing exist. Refund handling, tax/KYC document collection, creator analytics dashboards, and Razorpay Route eligibility remain roadmap work.
- Reports and moderation ops: rating gates and safety checks exist, but report/block endpoints, reviewer queues, appeal flow, and creator enforcement UI still need to be built.
- Embedding quality: Qdrant projection is live and durable, but the current deterministic embedding is a pipeline-safe fallback. A production embedding provider and batch embedding workflow should replace it.
- Streaming depth: SSE product path exists, but provider-token streaming and user cancellation remain hardening work.
- Testing depth: typecheck, lint, build, unit tests, backend smoke, AI harness, and web smoke cover the main path. Dedicated load tests, webhook replay suites, red-team prompt corpora, and disaster recovery drills are still needed.

## Current Critical Paths

- Email auth creates users, credentials, sessions, settings, risk sessions, and dev-owner admin
  entitlements when explicitly configured.
- Character create, publish, marketplace, and mine flows persist in Postgres and project to Qdrant/Neo4j.
- Chat validates session, character visibility, moderation status, per-character paid unlocks, usage limits, safety, memory scope, model route, output safety, analytics, and memory extraction.
- Memory is scoped by `user_id + character_id + conversation_id` and retrieved only for that bot/chat thread.
- Billing supports plans, Razorpay orders, signature verification, signed webhook activation, mock checkout only outside production, and duplicate-plan prevention.
- Worker service drains projection outbox events through the batch-orchestrator boundary with direct
  Postgres fallback, retries, stale lock recovery, and dead letters.
- Web app has authenticated app routes, landing/legal pages, PWA metadata, crawler controls, and mobile sign-out.
- Local manual testing should use `http://localhost:3000` when free; if a desktop tool owns that port, run the web server on `3001` and set `WEB_BASE_URL=http://localhost:3001` for browser smoke.
