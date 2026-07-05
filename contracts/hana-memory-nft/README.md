# Hana Memory NFT Contract

A Soroban smart contract for minting memory snapshot NFTs on Stellar.

## Features

- **Deterministic Token IDs**: Token IDs are derived from the SHA-256 hash of the memory snapshot's manifest root hash, ensuring uniqueness and verifiability
- **Idempotent Minting**: Calling `mint()` multiple times with the same token_id will not create duplicates
- **On-chain Metadata**: Each NFT stores the owner address, URI (pointing to snapshot manifest), and mint timestamp
- **Admin-controlled Minting**: Only the contract admin (Hana backend) can mint new tokens

## Contract Interface

### Initialize

```rust
fn initialize(env: Env, admin: Address, name: String, symbol: String)
```

Sets up the contract with a name, symbol, and admin address. Can only be called once.

### Mint

```rust
fn mint(env: Env, owner: Address, token_id: String, uri: String) -> String
```

Mints a new memory NFT. The `token_id` should be deterministically derived from the snapshot's manifest root hash (e.g., `sha256:abc123...`). Returns the minted token_id.

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
  --name "Hana Memory NFT" \
  --symbol "HANA-MEM"
```

### Mint an NFT

```bash
soroban contract invoke \
  --id <CONTRACT_ID> \
  --network testnet \
  -- mint \
  --owner <OWNER_ADDRESS> \
  --token_id "sha256:abc123..." \
  --uri "stellar://manifest/<HASH>"
```

## Integration with Hana Backend

The Hana backend uses the `@hana/stellar-bridge` package to interact with this contract:

1. **Deterministic Token ID**: The token ID is computed as `sha256(manifestRootHash)`
2. **Idempotent Minting**: The backend can safely retry mints without creating duplicates
3. **Server Signing**: The backend uses `STELLAR_SERVER_KEY_REF` to sign mint transactions
4. **Network Support**: Works on both mainnet and testnet via `STELLAR_NETWORK` config

## License

MIT
