.PHONY: build test clean deploy-testnet deploy-mainnet

build:
	cargo build --target wasm32-unknown-unknown --release
	@echo "Built WASM at target/wasm32-unknown-unknown/release/hana_memory_nft.wasm"

test:
	cargo test

clean:
	cargo clean

# Install the WASM to Stellar (generates a WASM hash)
install-testnet:
	soroban contract install \
		--wasm target/wasm32-unknown-unknown/release/hana_memory_nft.wasm \
		--network testnet

install-mainnet:
	soroban contract install \
		--wasm target/wasm32-unknown-unknown/release/hana_memory_nft.wasm \
		--network mainnet

# Deploy the contract (creates a contract ID)
deploy-testnet:
	@echo "Deploying to Stellar Testnet..."
	soroban contract deploy \
		--wasm target/wasm32-unknown-unknown/release/hana_memory_nft.wasm \
		--network testnet

deploy-mainnet:
	@echo "Deploying to Stellar Mainnet..."
	soroban contract deploy \
		--wasm target/wasm32-unknown-unknown/release/hana_memory_nft.wasm \
		--network mainnet

# Example: Initialize the contract
# Usage: make initialize-testnet CONTRACT_ID=<contract_id> ADMIN_ADDRESS=<address>
initialize-testnet:
	soroban contract invoke \
		--id $(CONTRACT_ID) \
		--network testnet \
		-- initialize \
		--admin $(ADMIN_ADDRESS) \
		--name "Hana Memory NFT" \
		--symbol "HANA-MEM"

initialize-mainnet:
	soroban contract invoke \
		--id $(CONTRACT_ID) \
		--network mainnet \
		-- initialize \
		--admin $(ADMIN_ADDRESS) \
		--name "Hana Memory NFT" \
		--symbol "HANA-MEM"

# Example: Mint an NFT
# Usage: make mint-testnet CONTRACT_ID=<contract_id> OWNER=<address> TOKEN_ID=<token_id> URI=<uri>
mint-testnet:
	soroban contract invoke \
		--id $(CONTRACT_ID) \
		--network testnet \
		-- mint \
		--owner $(OWNER) \
		--token_id $(TOKEN_ID) \
		--uri $(URI)

mint-mainnet:
	soroban contract invoke \
		--id $(CONTRACT_ID) \
		--network mainnet \
		-- mint \
		--owner $(OWNER) \
		--token_id $(TOKEN_ID) \
		--uri $(URI)

# Check contract info
info-testnet:
	soroban contract invoke \
		--id $(CONTRACT_ID) \
		--network testnet \
		-- get_name && \
	soroban contract invoke \
		--id $(CONTRACT_ID) \
		--network testnet \
		-- get_symbol && \
	soroban contract invoke \
		--id $(CONTRACT_ID) \
		--network testnet \
		-- get_total_supply

info-mainnet:
	soroban contract invoke \
		--id $(CONTRACT_ID) \
		--network mainnet \
		-- get_name && \
	soroban contract invoke \
		--id $(CONTRACT_ID) \
		--network mainnet \
		-- get_symbol && \
	soroban contract invoke \
		--id $(CONTRACT_ID) \
		--network mainnet \
		-- get_total_supply
