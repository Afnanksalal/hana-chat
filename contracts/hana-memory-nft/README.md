# Hana NFT Collection Contract

A Soroban smart contract for Hana creator-art and memory-proof NFTs on Stellar.

## Features

- **Deterministic Token IDs**: Creator-art token IDs are derived from creator id, character id, and
  media hash; memory-proof IDs remain derived from the committed manifest root.
- **Strict Idempotent Minting**: Calling `mint()` again with the same token id succeeds only when
  owner, creator, URI, and royalty match the existing token.
- **On-chain Ownership**: Each token stores owner, creator, metadata URI, royalty basis points, mint
  timestamp, and update timestamp.
- **Backend-Controlled Settlement**: Only the contract admin signer can mint and marketplace-transfer
  tokens after the API has verified payment and ownership state.
- **Owner Indexes**: `get_owner_tokens()` supports reconciliation and wallet-facing inventory views.

## Contract Interface

### Initialize

```rust
fn initialize(env: Env, admin: Address, name: String, symbol: String)
```

Sets up the contract with a name, symbol, and admin address. Can only be called once.

### Mint

```rust
fn mint(
  env: Env,
  owner: Address,
  creator: Address,
  token_id: String,
  uri: String,
  royalty_bps: u32,
) -> String
```

Mints a new Hana NFT. The backend computes deterministic token ids and stores metadata at the URI
before invoking this method. Returns the minted token id.

### Marketplace Transfer

```rust
fn marketplace_transfer(
  env: Env,
  token_id: String,
  from: Address,
  to: Address,
  sale_ref: String,
) -> String
```

Transfers a token after the API verifies the matching sale or offer payment. The contract checks
that `from` is the current owner and emits a sale event with the sale reference.

### Read Methods

- `get_token(token_id: String) -> Option<TokenMetadata>`
- `get_owner_tokens(owner: Address) -> Vec<String>`
- `get_total_supply() -> u64`
- `get_name() -> String`
- `get_symbol() -> String`
- `get_admin() -> Address`

## Building & Deploying

### Prerequisites

- Rust toolchain
- Soroban CLI (`cargo install --locked soroban-cli`)

### Build

```bash
make build
```

### Test

```bash
make test
```

### Deploy to Testnet

```bash
# Install the WASM
soroban contract install --wasm target/wasm32-unknown-unknown/release/hana_memory_nft.wasm --network testnet

# Deploy the contract
soroban contract deploy \
  --wasm target/wasm32-unknown-unknown/release/hana_memory_nft.wasm \
  --network testnet

# Initialize the contract
soroban contract invoke \
  --id <CONTRACT_ID> \
  --network testnet \
  -- initialize \
  --admin <ADMIN_ADDRESS> \
  --name "Hana NFT Collection" \
  --symbol "HANA"
```

### Mint an NFT

```bash
soroban contract invoke \
  --id <CONTRACT_ID> \
  --network testnet \
  -- mint \
  --owner <OWNER_ADDRESS> \
  --creator <CREATOR_ADDRESS> \
  --token_id "hana-art:abc123..." \
  --uri "https://app.hanachat.site/api/v1/nft/assets/<ASSET_ID>/metadata" \
  --royalty_bps 500
```

## Integration with Hana Backend

The Hana backend uses the `@hana/stellar-bridge` package to interact with this contract:

1. **Deterministic Token ID**: Creator-art token IDs are computed from creator, character, and media
   hash.
2. **Idempotent Minting**: The backend can safely retry mints without creating duplicates.
3. **Verified Settlement**: The API verifies the exact sale or offer payment before calling
   `marketplace_transfer`.
4. **Server Signing**: The backend resolves `STELLAR_SERVER_KEY_REF` to sign mint and transfer
   transactions.
5. **Network Support**: Works on both mainnet and testnet via `STELLAR_NETWORK` config.

## License

MIT
