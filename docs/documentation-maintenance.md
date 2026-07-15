# Documentation Maintenance

This repo has historical audits, launch notes, and implementation docs. Treat the files below as the
current source of truth before editing older audit material.

## Source Of Truth

- Product and runtime architecture: `README.md`, `docs/architecture.md`
- Agent workflow and repo rules: `AGENTS.md`, `.agents/memory/hana-chat.md`
- Character creation and marketplace: `docs/character-marketplace-system.md`,
  `docs/hana-chat-user-flows.md`
- Memory and group chat: `docs/memory-architecture.md`
- Monetization, payouts, and collectibles: `docs/monetization-payouts.md`,
  `docs/stellar-memory-and-monetization.md`
- VPS deployment and operations: `docs/deployment-vps.md`, `docs/playground-vps-deployment.md`,
  `docs/vps-container-map.md`
- UI direction: `docs/hana-chat-ui-ux-direction.md`
- Identity and abuse prevention: `docs/hana-chat-identity-and-abuse-prevention.md`,
  `docs/auth-email-setup.md`

## Maintenance Rules

- Keep consumer-facing docs in Hana product language. Do not put provider, signer, contract,
  anti-abuse, or internal stack details into marketing copy.
- Keep technical docs explicit about server-side gates: payment verification, media entitlements,
  payout-wallet verification, memory scope, and deployment checks must not rely on frontend state.
- Update `AGENTS.md` and `.agents/memory/hana-chat.md` whenever a durable workflow or architecture
  decision changes.
- For Codex work, do not run the local app stack or Docker runtime. Use PR CI and the Playground VPS
  deployment workflow for runtime verification unless the user explicitly grants an exception.
- Older audit files are historical evidence. If they conflict with the canonical docs above, update
  the canonical docs first and only edit the audit file when the stale wording would mislead an
  operator.

## Release Checklist

Before merging a documentation-affecting production change:

1. Update the canonical doc for the changed product area.
2. Search for stale provider names, fixed prices, placeholders, and local-runtime assumptions.
3. Open a branch and PR.
4. Let CI run formatting, typecheck, tests, build, and VPS compose validation.
5. Merge only after the checks pass, then confirm the Playground deploy workflow if runtime behavior
   changed.
