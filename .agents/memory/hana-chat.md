# Hana Chat Memory

## Product Direction

- Hana Chat is a premium AI companion and roleplay product, not a pitch deck or demo.
- Visual identity is black background with hotpink/reddish pink primary. No gradients.
- Mascot/logo assets live in `apps/web/public/assets`.
- User-facing copy should feel like a consumer entertainment product and must not reveal internal infrastructure.
- Landing hero should feel like a consumer product page and leave the next section visible on desktop and mobile.
- Form controls should use the shared premium dark surfaces; creator-facing screens should avoid technical trust cards and keep side rails focused on the consumer preview.

## Architecture Decisions

- Public domain: `hanachat.site`.
- Authenticated app domain: `app.hanachat.site`.
- API gateway domain: `api.hanachat.site`.
- Production auth cookies use `.hanachat.site` so landing CTAs can detect sessions created on the app subdomain.
- Interactive web navigation uses root-relative current-origin paths; absolute app/site URL helpers are only for canonical metadata and crawler artifacts.
- Frontend deploy target: Next.js container on the Playground VPS behind Caddy.
- Android packaging uses `apps/android-twa` as a Bubblewrap Trusted Web Activity wrapper around the same PWA origin; APK binaries and signing keys stay out of git and are served from `/downloads/hana-chat-twa.apk` only when configured.
- Production TWA builds target `https://app.hanachat.site`; raw-IP TWA builds are internal testing only.
- TWA verification uses the dynamic `/.well-known/assetlinks.json` route with `ANDROID_TWA_PACKAGE_ID` and `ANDROID_TWA_SHA256_CERT_FINGERPRINTS`.
- VPS stack: Caddy, Next.js web, NestJS services, Postgres, Qdrant, Neo4j, Redis, Redpanda, Temporal, ClickHouse.
- Playground raw-IP access is a supported path at `https://18.61.174.6`; auth cookies fall back to host-only cookies on IP access and use `.hanachat.site` only on matching domain hosts.
- Raw-IP auth cookies must omit the `Domain` attribute entirely; `.hanachat.site` is only applied for matching domain hosts.
- Raw-IP HTTPS uses Let's Encrypt IP-address certificates through Certbot with the `shortlived` profile; renewal must run daily.
- Playground VPS deploys should use `pnpm deploy:playground`; the helper packages the repo and writes LF-only remote shell scripts to avoid Windows CRLF/BOM compose-step failures.
- Portainer should be interpreted through `docs/vps-container-map.md`: `caddy`, `web`, and `api-gateway` are the public request path; Nest domain containers are private bounded-context runtimes.
- Admin observability lives at `/app/admin` with `/v1/admin/analytics`; it aggregates real Postgres operational data plus outbox topic pressure for growth, marketplace, model, safety, memory, queue, boundary, payout, and audit visibility.
- Admin users get a dedicated `Admin` item in the app sidebar/mobile bottom nav, gated from `/v1/dashboard` roles.
- Chat model-call rows are mirrored to ClickHouse through an `analytics.event.created` outbox event processed by `worker-service`; Postgres remains the canonical operational source for the admin dashboard.
- ClickHouse model-call projection must serialize timestamps as `DateTime64` strings, not raw ISO strings, so analytics outbox events do not dead-letter.
- Temporary production owner access uses `ADMIN_OTP_BYPASS_PHONE_NUMBER` in the VPS env only; do not hardcode or commit the phone number, and remove the bypass when real Twilio/domain auth is ready.
- Admin bypass login must not overwrite an existing profile display name; profile identity is owned by settings/profile update flow after the account exists.
- Backend preference: NestJS with heavily typed TypeScript.
- Vector memory/search uses Qdrant from the start, not pgvector.
- Graph projection target is Neo4j.
- The API gateway is the public product coordinator. Auth uses private identity and risk boundaries; chat uses private chat-orchestrator, billing, moderation, memory-service, retrieval, and graph boundaries; workers lease outbox work through batch-orchestrator. Each boundary has a conservative local/Postgres fallback.
- Graph-based personalization is active through `graph-service` `/internal/graph/conversation-context`, backed by Neo4j conversation projections and exact-scope Postgres fallback.
- `worker-service` projects `chat.turn.completed` outbox events into Neo4j using absolute counts so graph projection retries stay idempotent.
- Chat supports JSON and SSE paths; SSE events are `ready`, `blocked`, `meta`, `token`, `done`, and `error`.
- SSE chat metadata includes paid-character trial state and conversation evolution state when available.
- Outbox batching leases, acks, and fails pending events through the batch-orchestrator internal endpoints before falling back to direct Postgres leasing.
- Next.js and NestJS emit security headers; production API errors should redact unexpected internals.
- Production SSE internal errors are redacted, and production chat payloads must not expose internal model-routing details.
- `WEB_ORIGINS` is production-validated as a comma-separated HTTPS-only origin list alongside `WEB_ORIGIN`.
- OTP fallback codes use cryptographic randomness; never reintroduce `Math.random` for auth secrets or verification codes.
- `postcss` is pinned through a pnpm override until the upstream Next.js dependency no longer pulls the vulnerable range.

## Guardrails

- Block prompt extraction, architecture disclosure, code execution, tool abuse, and credential leakage before model calls.
- Treat user input, creator persona, and memory context as untrusted data in the model prompt.
- Inspect model output before storage and replace unsafe internal-disclosure output with a neutral in-character refusal.

## Character System

- Characters support profile image, cover image, templates, persona, scenario, speaking style, traits, examples, category, model profile, rating, tags, pricing, and publish state.
- Marketplace discovery must use real persisted fields and Qdrant projection.
- Chat "Your rooms" is only for existing conversations; marketplace/new-character discovery belongs in Discover. Start Chat from Discover opens a fresh room by character id instead of resuming an old same-bot room.
- A user can keep multiple rooms with the same character. The chat list distinguishes duplicate bot rooms with last-active timestamps, and exact rooms can be resumed through `conversationId` links.
- Users can delete a room from chat settings. Deletion is a server-side soft delete on `chat.conversations`, deactivates that room's scoped memories, removes its evolution row, and hides the room from chat lists.
- Creator image uploads are stored as owned `creator.media_assets` records and served through the API media file route; creator UI should not rely on raw image URL fields.
- User profile avatars are also uploaded through `creator.media_assets` with purpose `user_avatar`, then saved on `identity.users.avatar_url`.
- Marketplace engagement uses real counters and event rows for views, profile opens, chat starts, messages, likes, saves, interactions, and trending score.
- Marketplace ratings are persisted in `creator.character_ratings` as one score per user per character; `ratingAverage` and `ratingCount` live in `marketplace_stats_json` and affect trending rank.
- Paid character access is per-character purchase based: buyers get a mandatory 30 user-message trial, then chat requires a paid `billing.character_purchases` unlock or creator ownership, not just a subscription entitlement.
- Creator monetization uses wallet snapshots plus signed ledger entries for gross sale, platform fee, hold release, payout reserve, settlement, and failed-payout release.
- Creator earnings from paid-character purchases stay pending for the configured 7-day hold before becoming available for payout.
- Creator payout profiles encrypt UPI IDs, can link RazorpayX contact/fund-account IDs, and require admin verification before creators can request payouts.
- `/app/wallet` is the creator wallet surface; `/app/admin` is the admin monetization surface for profile review, payout processing, RazorpayX refresh, and manual/mock settlement.
- Mature/adult publishing requires review/gating; general/teen can publish directly in current development flow.
- Marketplace fallback seeding must only create the flagship character when no approved public character exists, so local seeded casts do not get extra default bots.

## Memory System

- Chat prompt memory is scoped by user, character, and conversation.
- Multiple rooms for one bot must never share prompt memory or evolution state unless an explicit user-controlled import/copy feature is added.
- Conversation evolution is stored in `chat.conversation_evolution` per user, character, and conversation, derived from scoped memories plus user turn count, and shown in chat settings.
- Deleting a room must also deactivate exact-scope Qdrant/Neo4j memory projections so the deleted room cannot influence future prompt personalization.
- No global user memory should be injected into chat.
- Manual memories create or use a conversation thread for the selected character.
- Qdrant memory search must filter exact `userId`, `characterId`, `conversationId`, `scope = conversation`, and `isActive = true`.

## Local Workflow

- Use `pnpm infra:up` and `pnpm infra:bootstrap` after schema or collection changes.
- Run API and web typechecks after contract/database updates.
- If `localhost:3000` is owned by the desktop environment, run manual web testing on `http://localhost:3001` and set `WEB_BASE_URL=http://localhost:3001` for `pnpm web:smoke`.
- Use `pnpm seed:local` after `pnpm infra:bootstrap` to create the clean Afnan K Salal admin account, ten generated character media records, ten conversations, and per-conversation memories for manual multi-persona testing.
- `pnpm seed:local` should reuse/reassign the known ten-character local cast by exact name instead of creating duplicate marketplace bots on repeat runs.
- Local smoke and AI harness runs must reuse the seeded cast instead of leaving `Smoke`, `Web Smoke`, or `Harness` characters in Discover.
- Keep `.env` private and never repeat live keys in docs or final responses.
