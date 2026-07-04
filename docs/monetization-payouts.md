# Creator Monetization and Payouts

Hana monetization is now crypto-native. `MONETIZATION_ENABLED=true` opens the paid product surface,
and production monetization requires `OG_PAYMENTS_ENABLED=true` plus a configured
`OG_TREASURY_WALLET_ADDRESS`.

## Provider Model

- Paid plans and paid character unlocks create `billing.crypto_payments` intents.
- The browser asks the connected wallet to send native 0G to Hana's treasury wallet.
- The API verifies the submitted transaction hash against the 0G RPC before activating access.
- Creator payout destinations are 0G wallet addresses stored in `billing.crypto_payout_accounts`.
- Admin payout settlement is proof-based: the admin sends the 0G payout transaction, then submits
  the tx hash for server verification.
- Local development and production use the same crypto proof path for buyer payments and creator
  payout settlement.

## Data Model

- `billing.crypto_payments`: buyer payment intent, amount, chain, wallet, transaction hash, and finalization status.
- `web3.chain_transactions`: inbound and outbound transaction proof records.
- `billing.character_purchases`: idempotent buyer unlocks for paid characters.
- `billing.creator_wallets`: creator balance snapshot by currency.
- `billing.creator_ledger_entries`: accounting events for sales, fees, reserves, releases, reversals, and adjustments.
- `billing.creator_earnings`: per-sale earning rows with `available_at` set after the creator hold window.
- `billing.creator_payout_profiles`: creator-facing payout profile and review status.
- `billing.crypto_payout_accounts`: creator wallet address, chain, token preference, and verification status.
- `billing.creator_payouts`: payout requests and settlement status.

## Purchase Flow

```mermaid
flowchart TD
  Discover["Discover card"] --> CreatePurchase["POST /v1/monetization/character-purchases"]
  CreatePurchase --> AlreadyPaid{"Already unlocked?"}
  AlreadyPaid -- yes --> Chat["Open chat"]
  AlreadyPaid -- no --> Trial{"Trial messages left?"}
  Trial -- yes --> TrialChat["Open chat without payment"]
  TrialChat --> TrialDone["Trial messages count down"]
  TrialDone --> CreatePurchase
  Trial -- no --> Intent["Create 0G payment intent"]
  Intent --> Wallet["Wallet sends native 0G to treasury"]
  Wallet --> Verify["API verifies tx hash, amount, recipient, chain, and confirmations"]
  Verify --> Ledger["Ledger gross sale and platform fee"]
  Ledger --> CreatorWallet["Increase pending wallet balance with hold-window available_at"]
  CreatorWallet --> Access["Paid chat access granted"]
```

## Payout Flow

```mermaid
flowchart TD
  Wallet["Creator wallet"] --> Profile{"Verified crypto payout wallet?"}
  Profile -- no --> Setup["Creator submits 0G wallet address"]
  Setup --> AdminVerify["Admin verifies payout profile"]
  Profile -- yes --> Request["Creator requests payout"]
  AdminVerify --> Request
  Request --> Reserve["Reserve available balance"]
  Reserve --> AdminTransfer["Admin sends 0G payout from treasury"]
  AdminTransfer --> SubmitHash["Admin submits tx hash"]
  SubmitHash --> Verify["API verifies sender, recipient, amount, chain, and confirmations"]
  Verify --> Paid["Mark payout paid and ledger settled"]
  Verify --> Confirming["Keep payout processing until confirmations complete"]
```

## Security Rules

- The frontend never marks a paid character or plan active by itself.
- The API checks purchase/subscription rows before granting paid access.
- The trial is counted by persisted user messages for the exact buyer and character.
- Payment verification checks transaction hash, chain ID, receipt success, recipient, sender when provided, amount, duplicate use, expiry, and confirmations.
- Payout verification checks treasury sender, creator wallet recipient, amount, chain ID, receipt success, and confirmations.
- Admin payout/profile routes require `identity.user_roles.role = admin`.
- Failed payout handling returns reserved funds through ledger entries instead of silently mutating balances.

## Operations

- Creator wallet UI: `/app/wallet`.
- Admin monetization UI: `/app/admin`.
- While `MONETIZATION_ENABLED=false`, checkout, paid-character purchase, payout profile, and payout request endpoints return "coming soon" and the web UI disables paid controls.
- Required payment env: `OG_ENABLED=true`, `OG_PAYMENTS_ENABLED=true`, `OG_CHAIN_ID`, `OG_RPC_URL`, `OG_TREASURY_WALLET_ADDRESS`, and `OG_PAYMENT_TOKEN_USD_CENTS`.
- Mandatory paid-character trial length is configured by `CREATOR_PAID_CHARACTER_TRIAL_MESSAGES`.
- Minimum payout and hold window are configured by `CREATOR_MIN_PAYOUT_CENTS` and `CREATOR_EARNING_HOLD_DAYS`.
- Platform fee is configured by `CREATOR_PLATFORM_FEE_BPS`.
