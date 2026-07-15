# Hana Chat Agent Memory

- 2026-07-16: Documentation source-of-truth is `README.md`, `docs/architecture.md`,
  `docs/character-marketplace-system.md`, `docs/memory-architecture.md`,
  `docs/monetization-payouts.md`, `docs/stellar-memory-and-monetization.md`,
  `docs/deployment-vps.md`, `docs/playground-vps-deployment.md`, `docs/vps-container-map.md`,
  `AGENTS.md`, and `docs/documentation-maintenance.md`. Historical audit docs should not override
  these canonical docs.
- 2026-07-16: Do not run the Hana Chat app stack or deploy/runtime services locally. Use GitHub
  Actions and the Playground VPS for runtime checks, deploy verification, and service-level testing;
  local work should stay limited to reading/editing files unless the user explicitly allows a local
  command.
- 2026-07-15: Chat-image collectibles use API-enforced media entitlements. Locked chat media must
  carry `lockedChatImage`, `characterId`, and `conversationId` metadata, direct NFT minting of locked
  media is forbidden, buyers only see files after a paid/minted/failed unlock row, and frontend
  placeholders must not fetch protected media before checkout.
- 2026-07-15: Chat-image unlock pricing is runtime configuration via
  `CHAT_IMAGE_UNLOCK_AMOUNT_CENTS`; the API converts it to the active Stellar payment asset and
  persists the calculated platform/creator split. Do not hardcode launch XLM amounts in schema,
  comments, UI, or checkout code.
- 2026-07-15: Creator-art and chat-image collectible mints must use exact Stellar payment
  verification, unique payment memos, verified payout-wallet signatures, and verified creator payout
  wallets for royalty creator addresses. Buyer wallets are owners, not creator royalty addresses,
  unless the buyer is minting their own creator-owned art.
- 2026-07-13: Paid subscriptions are two credit-based tiers: Hana Plus at $9.99/mo with 6,000
  monthly credits, deep memory, and creator tools; Hana Ultra at $19.99/mo with 20,000 monthly
  credits, deep memory, creator tools, and 18+ spaces after account eligibility checks.
- 2026-07-13: Stellar subscription checkout should prefer the in-app Freighter payment path:
  build the exact payment transaction from the server-issued intent, sign with Freighter on the
  intent network, submit to Horizon, then call the existing API verifier with the returned hash.
  Keep manual transfer details and transaction-hash verification as a fallback.
- 2026-07-13: The signed-in dashboard shows every live billing plan and price. Selecting a paid
  plan creates a server-issued Stellar intent, then opens the Freighter wallet on that intent's
  configured network; dashboard pricing must continue to respect the monetization gate.
- 2026-07-11: Wallet connection and checkout must show real Stellar account balances from the
  configured Horizon network. Mark only the server-issued payment intent asset as checkout-ready,
  show its locked fiat rate, and never generate mock wallet addresses or simulated payment hashes.
- 2026-07-11: Do not use Supermemory in the Hana memory path. Keep Postgres canonical, Qdrant for
  exact-scoped vector retrieval, Neo4j for graph projection, and Stellar for the existing memory
  snapshot commitment/proof lane.

- 2026-07-09: Text chat and memory-review routing should support AgentRouter as the configured
  primary provider via `TEXT_MODEL_PROVIDER=agentrouter`, `AGENT_ROUTER_API_KEY`, and explicit
  AgentRouter model env vars. Keep xAI available for image generation and as an explicit text
  fallback only; do not hardcode provider keys or model choices into product copy.
- 2026-07-09: AgentRouter's documented OpenAI-compatible route is
  `https://agentrouter.org/v1/chat/completions`, with `https://agentrouter.org/v1` as the base URL.
  Playground VPS probes to `/v1/models`, `/v1/chat/completions`, `/v1/responses`, and
  `/v1/messages` returned an Aliyun WAF HTML challenge instead of JSON. Do not route production text
  back to AgentRouter until the VPS receives JSON from the OpenAI-compatible route; the current
  production text route is the Groq decision below.
- 2026-07-10: Because xAI text credits are unavailable and AgentRouter is WAF-blocked from the VPS,
  production text routing should use Groq via `TEXT_MODEL_PROVIDER=groq`, `GROQ_API_KEY`, and
  `https://api.groq.com/openai/v1`. Use `llama-3.1-8b-instant` for default/memory turns and
  `llama-3.3-70b-versatile` only for complex turns; keep xAI limited to image generation until a
  separate image provider is integrated.
- 2026-07-05: Stellar is the only blockchain settlement and memory-proof lane. Active checkout,
  paid character unlocks, creator payout profiles, payout settlement, and memory snapshot proof
  settings must use Stellar env/config/contracts; removed providers must not be reintroduced as
  runtime fallbacks or docs references.
- 2026-07-07: Creator-art NFTs use real Stellar/Soroban mint and marketplace transfer flows. Keep
  `STELLAR_NFT_ENABLED` fail-closed unless `STELLAR_NFT_CONTRACT_ID` and `STELLAR_SERVER_KEY_REF`
  resolve to live runtime configuration; do not add fake mint hashes, synthetic token ownership, or
  UI-only marketplace actions.
- 2026-07-07: Consumer collectible and memory pages must use Hana-facing product language. Keep
  provider, chain, contract, signer, and proof mechanics out of user-facing hero/card copy unless the
  user is explicitly in a wallet handoff, admin, or technical settings surface.
- 2026-07-07: Creator collectible listings require a seller-defined minimum offer floor, visible Hana
  fee/royalty disclosure, seller-net estimates, and API-side rejection of under-floor offers.
- 2026-07-07: Memory snapshot commitments are not creator-art marketplace NFTs. Keep memory snapshot
  `mintNft` payloads false until a separate production memory-proof mint path exists end to end.
- 2026-06-18: Production VPS audit found the app stack healthy but normal email auth was not
  launch-clean because SMTP failed on API-to-Postfix STARTTLS and VPS outbound port 25 timed out.
  Admin sign-in must use the normal email OTP path, not a static bypass.
- 2026-07-04: Commit workflow rule from Afnan: whenever making a commit, create a dedicated branch,
  write clear production-grade commit messages, open a PR, run and verify the required workflows,
  merge the branch properly into `master`/main only after checks pass, and keep service/version
  management explicit and consistent.
- 2026-07-04: Creator payout settlement is proof-native: open payout requests use the active chain
  provider, admin processing requires a verified transaction hash, and mock/manual payout settlement
  paths must not be exposed.
- 2026-07-04: VPS cleanup must preserve Portainer and other named management services; inspect and
  target zombie parent processes instead of broad deletion/pruning.
- 2026-07-04: VPS Redpanda and Temporal services should run with Docker `init: true` so orphaned
  healthcheck/setup children are reaped after container recreation.
- 2026-07-05: Group chat is mention-gated with bounded bot handoffs: rooms support 2-10 bot members,
  user mentions start the turn, bots may invite another active bot by canonical `@mention_slug`,
  the server enforces membership/dedupe/depth/turn caps, and memory/evolution remains per
  `user_id + character_id + conversation_id` inside the shared group conversation.
- 2026-07-10: Unmentioned group user messages are public room speech. Persist them in the shared
  transcript, render them as quieter room bubbles, do not queue bot responses, and do not write them
  as bot memory. Mentioned lightweight greetings can get concise bot replies but should not generate
  durable memory facts or scene resets.
- 2026-07-04: Active checkout/unlock flows must be real provider flows. Do not add or expose mock
  checkout, mock character purchase, or mock payout activation paths in runtime API/UI/contracts;
  historical database values may remain readable only for compatibility.
- 2026-07-04: Do not add server-side static smoke OTPs. Production smoke automation must use the
  normal email OTP path with a mailbox-backed OTP fetcher or a non-production API that returns dev
  codes; the API must not accept configured static smoke codes.
- 2026-07-04: Billing provider constraints should be validated, not just added as `NOT VALID`; stale
  unpaid legacy provider rows can be pruned during migration, but any paid legacy history must force
  an explicit data decision.
- 2026-07-04: Playground VPS deploys must apply `infra/database/migrations/*.sql` against the
  existing `hana-chat-vps` Postgres service before rebuilding/restarting the full stack, so release
  code and schema move together.
