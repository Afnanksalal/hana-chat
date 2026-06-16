# Hana Chat Memory

## Product Direction

- Hana Chat is a premium AI companion and roleplay product, not a pitch deck or demo.
- Visual identity is black background with hotpink/reddish pink primary. No gradients.
- Mascot/logo assets live in `apps/web/public/assets`.
- User-facing copy should feel like a consumer entertainment product and must not reveal internal infrastructure.
- Hana Chat is text-chat only for now; do not add secondary realtime media controls, entitlements, plan copy, or database fields.
- Landing hero should feel like a consumer product page and leave the next section visible on desktop and mobile.
- Form controls should use the shared premium dark surfaces; creator-facing screens should avoid technical trust cards and keep side rails focused on the consumer preview.
- Character/message limits should render as accessible compact meter counters with remaining-count context, not loose helper text.

## Architecture Decisions

- Public domain: `hanachat.site`.
- Authenticated app domain: `app.hanachat.site`.
- API gateway domain: `api.hanachat.site`.
- Production auth cookies use `.hanachat.site` so landing CTAs can detect sessions created on the app subdomain.
- Interactive web navigation uses root-relative current-origin paths; absolute app/site URL helpers are only for canonical metadata and crawler artifacts.
- Public SEO and AI-discovery routes are centralized in `apps/web/app/seo.ts`; sitemap, robots, public topic pages, legal metadata, and `llms.txt`/`llms-full.txt` must derive from that graph so public canonicals stay on `https://hanachat.site`.
- Auth, app, API, private chats, private memories, and creator drafts are not public SEO content; keep them disallowed/noindexed while public landing, topical product pages, legal pages, and crawler manifests remain crawlable.
- `pnpm seo:audit` crawls the public route graph with weighted technical, metadata, content, internal-link, and AI-discovery scoring and should be run before production SEO changes ship.
- Frontend deploy target: Next.js container on the Playground VPS behind Caddy.
- Android packaging uses `apps/android-twa` as a Bubblewrap Trusted Web Activity wrapper around the same PWA origin; APK binaries and signing keys stay out of git and are served from `/downloads/hana-chat-twa.apk` only when configured.
- TWA builds target `https://app.hanachat.site` only; raw-IP TWA packages are blocked by the build script and must not be distributed.
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
- AI cost accounting stores xAI `usage.cost_in_usd_ticks` for chat model calls and generated media whenever the provider returns it. Admin analytics prefer exact ticks, then stored USD decimals, then documented xAI token/image pricing only for legacy rows without exact cost.
- ClickHouse model-call projection must serialize timestamps as `DateTime64` strings, not raw ISO strings, so analytics outbox events do not dead-letter.
- Passwordless email is the live auth path: signup collects username and email, signin collects email, and the API sends short-lived email verification codes through SMTP/Nodemailer.
- VPS email delivery uses the lightweight `smtp-relay` Postfix container on the private Docker network. API config stays `SMTP_HOST=smtp-relay`, DKIM keys live outside git under `/opt/hana-chat/shared/opendkim-keys`, and the public sender is `no-reply@app.hanachat.site`.
- `ADMIN_EMAIL` is the owner/admin bootstrap email. `ADMIN_STATIC_OTP` is an optional live secret for that email, keeps the normal email/code workflow, and must stay in private env only.
- Admin bootstrap login must not overwrite an existing profile display name; profile identity is owned by settings/profile update flow after the account exists.
- Browser apps cannot reliably expose a client MAC address. One-account policy uses server-observed IP hash plus an app-generated device id hash, both enforced in the API gateway.
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
- Production AI harness runs against `*.hanachat.site` must not require public `modelRoute` fields unless `AI_HARNESS_EXPECTED_MODEL` is explicitly set; route/model verification belongs in server-side analytics and non-production harnesses.
- `WEB_ORIGINS` is production-validated as a comma-separated HTTPS-only origin list alongside `WEB_ORIGIN`.
- Email verification codes use cryptographic randomness; never reintroduce `Math.random` for auth secrets or verification codes.
- `postcss` is pinned through a pnpm override until the upstream Next.js dependency no longer pulls the vulnerable range.

## Guardrails

- Block prompt extraction, architecture disclosure, code execution, tool abuse, and credential leakage before model calls.
- Treat user input, creator persona, and memory context as untrusted data in the model prompt.
- Inspect model output before storage and replace unsafe internal-disclosure output with a neutral in-character refusal.

## Character System

- Characters support profile image, cover image, templates, persona, scenario, speaking style, traits, examples, category, model profile, rating, tags, pricing, and publish state.
- Marketplace discovery must use real persisted fields and Qdrant projection.
- Discover shows public approved general/teen characters by default. Signed-in users with 18+ enabled can also see mature/adult public approved characters, and creators can see their own private/draft adult characters so seed/test adult bots are reachable without publishing them.
- Chat "Your rooms" is only for existing conversations; marketplace/new-character discovery belongs in Discover. Start Chat from Discover opens a fresh room by character id instead of resuming an old same-bot room.
- A user can keep multiple rooms with the same character. The chat list distinguishes duplicate bot rooms with last-active timestamps, and exact rooms can be resumed through `conversationId` links.
- Users can delete a room from chat settings. Deletion is a server-side soft delete on `chat.conversations`, deactivates that room's scoped memories, removes its evolution row, and hides the room from chat lists.
- Creator image uploads are stored as owned `creator.media_assets` records and served through the API media file route; creator UI should not rely on raw image URL fields.
- Creator Studio has an image-only `/v1/media/generate` path backed by xAI image generation. Generated profile/cover images are downloaded into Hana-owned `creator.media_assets`; do not add secondary media generation paths. The create UI offers art-direction, mood, backdrop, and detail presets, so media generation should not collapse back to anime-only defaults.
- Creator media generation must not force Hana brand colors into generated character art. Prompts should follow the character, outfit, setting, mood, and backdrop; pink/magenta/neon accents are only for explicit creator choices or persona text.
- Creator cover generation uses the currently selected uploaded/generated profile image as the xAI image-edit identity reference. Newly generated profile/cover options should not override the selected option after the first generated choice; creators must click a thumbnail to change the source of truth.
- Creator Studio uses a multi-step builder for identity, appearance, persona, marketplace packaging, and review. Starter profile/cover art should be Hana-colored character placeholders, not mascot/hero brand art or off-palette teal defaults, and the UI caps each profile/cover generation session at three selectable options before upload/save.
- User profile avatars are also uploaded through `creator.media_assets` with purpose `user_avatar`, then saved on `identity.users.avatar_url`.
- Marketplace engagement uses real counters and event rows for views, profile opens, chat starts, messages, likes, saves, interactions, and trending score.
- Admin marketplace analytics use admin inventory scope, not consumer Discover scope: non-rejected private, draft, pending-review, mature, and adult characters must appear with visibility/review labels while consumer discovery remains gated.
- Admin character reviews have a dedicated dashboard queue and API; approving a character sets it `public`/`approved`, rejecting sets it `private`/`rejected`, and both paths audit/project the new state.
- Marketplace ratings are persisted in `creator.character_ratings` as one score per user per character; `ratingAverage` and `ratingCount` live in `marketplace_stats_json` and affect trending rank.
- Paid plans and creator monetization are preserved but disabled by default with `MONETIZATION_ENABLED=false`; public surfaces show "coming soon" and server endpoints block checkout, paid character purchase, payout profile, and payout request flows while the flag is off.
- When monetization is re-enabled, paid character access is per-character purchase based: buyers get a mandatory 30 completed-user-turn trial, then chat requires a paid `billing.character_purchases` unlock or creator ownership, not just a subscription entitlement.
- Monthly message usage, dashboard usage, and paid-character trial usage count completed user turns only: a user row must be matched to an assistant reply in the same conversation. Assistant greetings, assistant-only rows, blocked inputs, and failed/pending sends are not billable, while short-window rate limits still count raw accepted user attempts.
- Creator monetization uses wallet snapshots plus signed ledger entries for gross sale, platform fee, hold release, payout reserve, settlement, and failed-payout release.
- Creator earnings from paid-character purchases stay pending for the configured 7-day hold before becoming available for payout.
- Creator payout profiles encrypt UPI IDs with `PAYOUT_ENCRYPTION_KEY_BASE64`, can link provider contact/fund-account IDs, and require admin verification before creators can request payouts.
- `/app/wallet` is the creator wallet surface; `/app/admin` is the admin monetization surface for profile review, payout processing, provider refresh, and manual/mock settlement.
- Mature/adult publishing requires review/gating; general/teen can publish directly in current development flow.
- Chat adult-mode turns are opt-in per request: the web client requests adult mode only when the user setting is enabled and the selected character is mature/adult or has explicit spicy/NSFW signals.
- Chat prompts treat character rating, tags, public description, marketplace preview, persona, and creator notes as style and heat-level signals while preserving the safety contract.
- Marketplace fallback seeding must only create the flagship character when no approved public character exists, so local seeded casts do not get extra default bots.
- Chat messages, room lists, marketplace cards, creator previews, and admin character reviews render single-asterisk roleplay action beats as italics, and room avatars must remain fixed circular profile images instead of stretched cover-style cards.
- Seeded adult characters use explicit `adult` rating plus `nsfw`/`spicy`/`18+` tags so chat adult mode, persona, description, and tags can drive consensual 18+ roleplay behavior without making every bot sexual by default.

## Memory System

- Chat prompt memory is scoped by user, character, and conversation.
- The Memory toggle gates both prompt-memory retrieval/evolution injection and new automatic memory extraction for chat turns.
- Multiple rooms for one bot must never share prompt memory or evolution state unless an explicit user-controlled import/copy feature is added.
- Automatic memory extraction runs after accepted chat turns and writes bounded, deduplicated exact-scope facts for aliases, preferences, boundaries, relationship states/events, canon, and style signals.
- Automatic turn memory is a two-stage pipeline: deterministic extraction proposes bounded candidates, then an xAI LLM feedback reviewer decides whether each candidate should be remembered, revised, or dropped before `memory.facts` writes. This keeps personal/boundary memory from storing one-off hypotheticals, tests, or overly granular non-personal facts.
- Automatic turn memory is deliberately rate-limited per turn: the current relationship state updates one canonical fact, noisy one-turn memory bursts are capped, and romance is only established from explicit same-turn user intent plus assistant acceptance rather than pet names or loose recent-window pairing.
- Automatic memory extraction also reads the assistant side of the turn for reciprocal relationship decisions, character self-continuity/soul cues, and rare commitments, so memory can be bot-authored from actual chat behavior rather than only manual/user notes.
- Automatic memory extraction also writes relationship ledger, scene state, scene thread, and roleplay anti-repeat facts. The current scene state is canonical per room and is used to continue the visible scene instead of resetting to the opening pose.
- Conversation evolution is stored in `chat.conversation_evolution` per user, character, and conversation, derived from scoped memories, recent messages, user turn count, and relationship signals, then shown in chat settings.
- Conversation evolution is a compacted live profile, not fixed content: underlying exact-scoped facts can grow over many turns, while prompt-facing user profile, character soul, relationship ledger, scene state, milestones, habits, and open loops stay bounded and are recomputed from current evidence.
- Evolution prompts must keep relationship progression evidence-based: enemies/rivals/strangers cannot become girlfriend/boyfriend/lover behavior after a few kind messages unless the chat explicitly earns and establishes that bond, and evolution stages require minimum user-turn history instead of memory-count-only promotion.
- Prompt memory retrieval always reserves anchor slots for relationship state, current scene state, user boundary/preference, early canon/event, and recent style/soul cues before semantic vector/graph hits fill the rest.
- New chat rooms persist the character greeting as the first assistant message so the opening beat remains durable, prompt-visible, and reload-safe.
- Web chat keeps a short-lived local pending-send outbox keyed by `clientMessageId` so quick back/navigation does not visually drop the last user turn and stale in-flight sends can retry idempotently.
- Web chat treats idempotent duplicate SSE responses as reconciliation/replace events, not as a second animated token stream.
- Deleting a room must also deactivate exact-scope Qdrant/Neo4j memory projections so the deleted room cannot influence future prompt personalization.
- No global user memory should be injected into chat.
- Manual memories create or use a conversation thread for the selected character.
- Qdrant memory search must filter exact `userId`, `characterId`, `conversationId`, `scope = conversation`, and `isActive = true`.

## Local Workflow

- Use `pnpm infra:up` and `pnpm infra:bootstrap` after schema or collection changes.
- Run API and web typechecks after contract/database updates.
- If `localhost:3000` is owned by the desktop environment, run manual web testing on `http://localhost:3001` and set `WEB_BASE_URL=http://localhost:3001` for `pnpm web:smoke`.
- Use `pnpm seed:local` after `pnpm infra:bootstrap` to create the clean Afnan K Salal admin account through `ADMIN_EMAIL`, fourteen generated character media records, fourteen conversations, and per-conversation memories for manual multi-persona testing.
- `pnpm seed:local` should reuse/reassign the known fourteen-character local cast by exact name instead of creating duplicate marketplace bots on repeat runs.
- Local smoke and AI harness runs must reuse the seeded cast instead of leaving `Smoke`, `Web Smoke`, or `Harness` characters in Discover.
- Product smoke uses the server-configured `SMOKE_EMAIL_DOMAIN` plus `SMOKE_STATIC_OTP` lane for disposable test accounts. Those addresses bypass SMTP delivery, email OTP rate limits, and one-account-per-IP/device claims while keeping normal production users on strict account-signal policies.
- Production smoke may enable the smoke OTP lane temporarily, but it must be removed from
  `/opt/hana-chat/shared/.env.vps` and `api-gateway` restarted afterward.
- The Playground VPS env file is shell-sourced during deploy. Quote values with spaces, and patch
  only intended keys because initialized database volumes keep their original passwords even if env
  values are regenerated.
- Web smoke now follows the multi-step Create flow and waits for an assistant reply after send; do
  not wait for the send button to re-enable because an empty draft correctly keeps it disabled.
- Keep `.env` private and never repeat live keys in docs or final responses.
