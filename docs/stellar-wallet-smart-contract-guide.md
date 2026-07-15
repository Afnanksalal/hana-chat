# Stellar Wallet and Smart Contract Guide

This guide covers how to use Stellar wallets and interact with the Hana NFT smart contract on the Stellar network.

## Overview

Hana Chat uses Stellar blockchain for:

- **Collectible minting**: Creating creator-art and chat-image collectibles through the Hana NFT
  contract
- **Payments**: Processing subscription payments and character purchases
- **Wallet integration**: Connecting user wallets via Freighter extension

Memory snapshots are encrypted commitment records in Postgres/Stellar proof lanes. They are not
minted through the creator-art NFT marketplace in the current release.

## Network Configuration

### Testnet (Development)

- **Network**: Testnet
- **Horizon URL**: https://horizon-testnet.stellar.org
- **RPC URL**: https://soroban-testnet.stellar.org
- **Friendbot**: https://friendbot.stellar.org/?addr=<ADDRESS>

### Mainnet (Production)

- **Network**: Mainnet
- **Horizon URL**: https://horizon.stellar.org
- **RPC URL**: https://soroban-rpc.mainnet.stellar.org

## Wallet Setup

### Option 1: Freighter Extension (Recommended for Users)

1. **Install Freighter**
   - Chrome/Edge: https://www.freighter.app/
   - Firefox: Available from Firefox Add-ons

2. **Create or Import Wallet**
   - Open Freighter extension
   - Create new wallet or import existing secret key
   - Switch to Testnet for development

3. **Fund Testnet Account**
   - Copy your public address (starts with `G`)
   - Visit: https://friendbot.stellar.org/?addr=<YOUR_ADDRESS>
   - Receive 10,000 testnet XLM

### Option 2: Stellar CLI (For Server-Side Operations)

1. **Install Stellar CLI**

   ```bash
   cargo install --locked stellar-cli
   ```

2. **Generate Key Pair**

   ```bash
   stellar keys generate <alias> --network testnet
   ```

3. **Get Public Address**

   ```bash
   stellar keys public-key <alias>
   ```

4. **Get Secret Key** (NEVER share this)

   ```bash
   stellar keys secret <alias>
   ```

5. **Fund Testnet Account**
   ```bash
   curl https://friendbot.stellar.org/?addr=<PUBLIC_ADDRESS>
   ```

## Smart Contract Deployment

### Prerequisites

- Stellar CLI installed
- Rust and Cargo installed
- wasm32 target added: `rustup target add wasm32-unknown-unknown`
- Funded admin account

### Build Contract

```bash
cd /opt/hana-chat/current/contracts/hana-memory-nft
source ~/.cargo/env
cargo build --target wasm32-unknown-unknown --release
```

### Deploy Contract

```bash
stellar contract deploy \
  --wasm target/wasm32-unknown-unknown/release/hana_memory_nft.wasm \
  --source-account <admin-alias> \
  --network testnet \
  --alias hana_nft
```

**Output**: Contract ID (starts with `C`)

### Initialize Contract

```bash
stellar contract invoke \
  --id <CONTRACT_ID> \
  --source-account <admin-alias> \
  --network testnet \
  -- initialize \
  --admin <ADMIN_PUBLIC_ADDRESS> \
  --name "Hana NFT Collection" \
  --symbol HANA
```

## Environment Variables

Configure these in `/opt/hana-chat/shared/.env.vps`:

```bash
# Stellar Configuration
STELLAR_ENABLED=true
STELLAR_PAYMENTS_ENABLED=true
STELLAR_NFT_ENABLED=true
STELLAR_NETWORK=testnet
STELLAR_HORIZON_URL=https://horizon-testnet.stellar.org
STELLAR_RPC_URL=https://soroban-testnet.stellar.org

# Payment Configuration
STELLAR_PAYMENT_ASSET_CODE=XLM
STELLAR_PAYMENT_ASSET_ISSUER=
STELLAR_PAYMENT_TOKEN_USD_CENTS=10
STELLAR_PAYMENT_INTENT_TTL_MINUTES=30
STELLAR_REQUIRED_CONFIRMATIONS=1

# Treasury Configuration
STELLAR_TREASURY_ADDRESS=<ADMIN_PUBLIC_ADDRESS>
STELLAR_SERVER_KEY_REF=env:STELLAR_SERVER_SIGNING_SECRET

# NFT Configuration
STELLAR_NFT_CONTRACT_ID=<CONTRACT_ID>
STELLAR_STORAGE_SNAPSHOT_INTERVAL_TURNS=25
STELLAR_STORAGE_SNAPSHOT_MIN_IMPORTANCE=0.65
```

## Wallet Integration in Web App

### Connecting Freighter Wallet

```typescript
import { connectFreighterWallet, isStellarAddress } from "./stellar-wallet-client";

async function connectWallet() {
  try {
    const address = await connectFreighterWallet("testnet");
    console.log("Connected:", address);
  } catch (error) {
    console.error("Connection failed:", error);
  }
}
```

### Loading Wallet Assets

```typescript
import { loadStellarWallet } from "./stellar-wallet-client";

async function loadWalletAssets(address: string) {
  const wallet = await loadStellarWallet(address);
  console.log("Assets:", wallet.assets);
  console.log("Funded:", wallet.funded);
}
```

### Memory Leak Prevention

The wallet modal includes proper cleanup to prevent memory leaks:

```typescript
useEffect(() => {
  if (!isOpen) {
    // Cancel pending requests
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    // Cleanup Freighter connection
    cleanupFreighterConnection();
    // Reset state
    setAddress("");
    setConnecting(false);
    setLoadingAssets(false);
    setWallet(null);
  } else {
    // Create new abort controller
    abortControllerRef.current = new AbortController();
  }

  return () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    cleanupFreighterConnection();
  };
}, [isOpen]);
```

## Contract Operations

### Minting NFTs

```typescript
import { mintHanaNft, buildHanaNftMetadata } from "@hana/stellar-bridge";

const metadata = buildHanaNftMetadata({
  id: "asset-123",
  title: "Character Key Art",
  description: "Creator-owned Hana collectible artwork",
  imageUrl: "https://...",
  mediaSha256Hex: "abc123...",
  creatorUserId: "user-123",
  characterId: "char-456",
  characterName: "Character Name",
  network: "testnet",
  contractId: "<CONTRACT_ID>",
  tokenId: "hana-art:...",
  royaltyBps: 500,
});

const result = await mintHanaNft({
  rpcUrl: "https://soroban-testnet.stellar.org",
  network: "testnet",
  contractId: "<CONTRACT_ID>",
  serverSecret: "<ADMIN_SECRET>",
  ownerAddress: "<OWNER_ADDRESS>",
  creatorAddress: "<CREATOR_ADDRESS>",
  tokenId: "hana-art:...",
  metadataUri: "https://app.hanachat.site/api/v1/nft/assets/asset-123/metadata",
  royaltyBps: 500,
});
```

### Transferring NFTs

```typescript
import { transferHanaNft } from "@hana/stellar-bridge";

const result = await transferHanaNft({
  rpcUrl: "https://soroban-testnet.stellar.org",
  network: "testnet",
  contractId: "<CONTRACT_ID>",
  serverSecret: "<ADMIN_SECRET>",
  tokenId: "hana-art:...",
  fromAddress: "<FROM_ADDRESS>",
  toAddress: "<TO_ADDRESS>",
  saleReference: "sale-123",
});
```

### Payment Verification

```typescript
import { verifyStellarPayment } from "@hana/stellar-bridge";

const verification = await verifyStellarPayment({
  horizonUrl: "https://horizon-testnet.stellar.org",
  network: "testnet",
  txHash: "<TRANSACTION_HASH>",
  expectedTo: "<TREASURY_ADDRESS>",
  expectedFrom: "<BUYER_ADDRESS>",
  expectedMemo: "<MEMO>",
  assetCode: "XLM",
  assetIssuer: null,
  exactAmountDisplay: "1.0000000",
});
```

## Troubleshooting

### Common Errors

**"Freighter is not installed"**

- Install Freighter extension from https://www.freighter.app/
- Refresh the page after installation

**"Invalid Stellar address"**

- Ensure address starts with `G` and is 56 characters long
- Check network (testnet vs mainnet)

**"Transaction simulation failed"**

- Check account has sufficient XLM for fees
- Verify contract is deployed and initialized
- Ensure admin address matches contract configuration

**"Memory leak detected"**

- This is from the @stellar/freighter-api library
- The wallet modal includes cleanup to minimize issues
- Disable wallet extensions if problems persist

### Network Issues

**Cannot connect to Stellar RPC**

- Check network configuration matches environment
- Verify RPC URL is accessible
- Try switching between testnet and mainnet

**Transaction stuck pending**

- Check network status on Stellar.expert
- Verify sufficient confirmations (default: 1)
- Transaction may take 5-10 seconds to finalize

## Security Best Practices

### Secret Key Management

- **NEVER** commit secret keys to git
- **NEVER** log secret keys
- **NEVER** share secret keys in chat
- Store secret keys in environment variables only
- Use separate keys for testnet and mainnet

### Treasury Security

- Keep minimum XLM in treasury (just enough for fees)
- Monitor treasury address regularly
- Use hardware wallets for mainnet treasury
- Implement withdrawal limits and approvals

### Contract Security

- Verify contract code before deployment
- Test thoroughly on testnet first
- Use proper access controls
- Audit contract functions regularly

## Current Deployment

Use `/opt/hana-chat/shared/.env.vps` as the deployment source of truth for `STELLAR_NETWORK`,
`STELLAR_NFT_CONTRACT_ID`, treasury address, and server signer secret reference. Do not hardcode live
contract ids, admin addresses, or signer secrets in docs.

For explorer checks, open the active network in Stellar Expert or Stellar Lab and paste the contract
id from the VPS environment.

## Additional Resources

- **Stellar Documentation**: https://developers.stellar.org/
- **Soroban Documentation**: https://developers.stellar.org/docs/build/smart-contracts/
- **Freighter Documentation**: https://www.freighter.app/docs
- **Stellar CLI**: https://developers.stellar.org/docs/tools/cli/stellar-cli

## Support

For issues related to:

- **Wallet connection**: Check Freighter extension status
- **Contract deployment**: Review Stellar CLI output
- **Payment processing**: Check environment variables
- **General issues**: Review logs in `/opt/hana-chat/current/logs/`
