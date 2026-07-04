# Hana Chat Golden Audit

Date: 2026-05-25

## Verdict

This pass closed the highest-risk dead ends found across auth, billing, creator monetization, chat safety, memory isolation, queue processing, deployment config, and mobile product polish. The codebase now has a deployable NestJS/Next.js product spine with real Postgres durability, Qdrant projections, Neo4j projection workers, payment-provider verification paths, creator wallet ledger, admin payout operations, passwordless email auth, strict production config validation, PWA/SEO routes, and authenticated web flows.

Hana Chat still has dedicated product projects before it should be sold as a fully mature consumer
platform: refund/tax/KYC operations, reports/moderation ops UI, production embedding provider, and
load testing. Those are tracked as explicit hardening work rather than hidden dead ends.

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

- Creator monetization operations: paid unlocks, wallet ledger, payout profiles, payout requests, and admin payout processing exist. Refund handling, tax/KYC document collection, creator analytics dashboards, and Razorpay Route eligibility remain roadmap work.
- Reports and moderation ops: rating gates and safety checks exist, but report/block endpoints, reviewer queues, appeal flow, and creator enforcement UI still need to be built.
- Embedding quality: Qdrant projection is live and durable, but the current deterministic embedding is a pipeline-safe fallback. A production embedding provider and batch embedding workflow should replace it.
- Streaming depth: SSE product path exists, but provider-token streaming and user cancellation remain hardening work.
- Testing depth: typecheck, lint, build, unit tests, backend smoke, AI harness, and web smoke cover the main path. Dedicated load tests, webhook replay suites, red-team prompt corpora, and disaster recovery drills are still needed.

## 2026-06-05 Cleanup Pass

- Restored the voice-removal migration so production bootstrap continues dropping stale
  `voice_enabled` columns while the product remains text-chat only.
- Replaced off-palette teal character fallback assets with dedicated black/hotpink character avatar
  and cover SVGs. App, Discover, chat lists, and API character fallbacks now use character media
  defaults instead of the Hana mascot or landing hero.
- Tightened Creator Studio layout behavior: the preview rail is no longer a sticky overlay, owned
  character rows stay under the form column on desktop, mobile action buttons remain above the bottom
  nav, and listed-bot thumbnails are fixed-size tiles.
- Removed stale global custom scrollbar styling. Hidden-scrollbar rules remain the product default
  so scroll affordances do not fall back to native bars.
- Updated builder docs and synced agent memory to the current Identity, Look, Persona, Publish, and
  Review flow with capped profile/cover generation options.

## 2026-06-05 Deployment Verification

- Deployed release `20260605102348` to the Playground VPS through `pnpm deploy:playground`.
- Preserved the live VPS env secrets after an attempted full env copy exposed the expected Neo4j
  data-volume/password mismatch. Production env edits should patch intended keys only, because
  initialized database volumes do not adopt regenerated env passwords.
- Quoted shell-sensitive VPS env values (`SMTP_FROM`, `SMTP_RELAY_MYNETWORKS`) because the deploy
  script sources `/opt/hana-chat/shared/.env.vps` with bash before Compose.
- Verified public health after deploy: `https://api.hanachat.site/health`,
  `https://app.hanachat.site/`, and `https://hanachat.site/` returned HTTP 200.
- Ran production product smoke with a temporary server-side smoke OTP lane and a private SSH tunnel
  to the internal Qdrant container: 17 passed, 0 failed. The smoke OTP variables were removed from
  production env and `api-gateway` was restarted healthy afterward.
- Ran production AI harness: 12 passed, 0 warned, 0 failed.
- Ran production web smoke after updating the smoke script for the multi-step builder and empty-draft
  chat-send behavior: 18 passed, 0 failed.

## Current Critical Paths

- Email auth creates users, credentials, sessions, settings, risk sessions, and dev-owner admin
  entitlements when explicitly configured.
- Character create, publish, marketplace, and mine flows persist in Postgres and project to Qdrant/Neo4j.
- Chat validates session, character visibility, moderation status, per-character paid unlocks, usage limits, safety, memory scope, model route, output safety, analytics, and memory extraction.
- Memory is scoped by `user_id + character_id + conversation_id` and retrieved only for that bot/chat thread.
- Billing supports plans, crypto payment intents, transaction verification, creator-wallet ledgering, crypto payout settlement, and duplicate-plan prevention.
- Worker service drains projection outbox events through the batch-orchestrator boundary with direct
  Postgres fallback, retries, stale lock recovery, and dead letters.
- Web app has authenticated app routes, landing/legal pages, PWA metadata, crawler controls, and mobile sign-out.
- Local manual testing should use `http://localhost:3000` when free; if a desktop tool owns that port, run the web server on `3001` and set `WEB_BASE_URL=http://localhost:3001` for browser smoke.
