#![no_std]

//! Hana Memory NFT Contract
//!
//! A Soroban smart contract for minting memory snapshot NFTs on Stellar.
//! Each NFT represents a unique memory snapshot with a deterministic token ID
//! derived from the snapshot's manifest root hash.

use soroban_sdk::{
    contract, contractimpl, contracttype, symbol_short, Address, Env, String, Symbol, Vec,
};

// Storage keys
const OWNER: Symbol = symbol_short!("OWNER");
const NAME: Symbol = symbol_short!("NAME");
const SYMBOL: Symbol = symbol_short!("SYMBOL");
const COUNTER: Symbol = symbol_short!("COUNTER");

#[derive(Clone)]
#[contracttype]
pub struct TokenMetadata {
    pub token_id: String,
    pub owner: Address,
    pub uri: String,
    pub minted_at: u64,
}

#[derive(Clone)]
#[contracttype]
pub enum TokenKey {
    Token(String),
    OwnerTokens(Address),
}

#[contract]
pub struct HanaMemoryNftContract;

#[contractimpl]
impl HanaMemoryNftContract {
    /// Initialize the contract with name and symbol
    pub fn initialize(env: Env, admin: Address, name: String, symbol: String) {
        if env.storage().instance().has(&OWNER) {
            panic!("Already initialized");
        }

        env.storage().instance().set(&OWNER, &admin);
        env.storage().instance().set(&NAME, &name);
        env.storage().instance().set(&SYMBOL, &symbol);
        env.storage().instance().set(&COUNTER, &0u64);
    }

    /// Mint a new memory NFT
    ///
    /// The token_id is deterministic and derived from the manifest root hash.
    /// This allows for idempotent minting - calling mint multiple times with
    /// the same token_id will not create duplicate tokens.
    ///
    /// Returns: The token_id that was minted (or already existed)
    pub fn mint(env: Env, owner: Address, token_id: String, uri: String) -> String {
        // Verify the caller is the contract admin
        let admin: Address = env.storage().instance().get(&OWNER).unwrap();
        admin.require_auth();

        // Check if token already exists (idempotent minting)
        let token_key = TokenKey::Token(token_id.clone());
        if env.storage().persistent().has(&token_key) {
            // Token already minted, return existing token_id
            return token_id;
        }

        // Create token metadata
        let metadata = TokenMetadata {
            token_id: token_id.clone(),
            owner: owner.clone(),
            uri,
            minted_at: env.ledger().timestamp(),
        };

        // Store token metadata
        env.storage().persistent().set(&token_key, &metadata);

        // Add token to owner's list
        let owner_key = TokenKey::OwnerTokens(owner.clone());
        let mut owner_tokens: Vec<String> = env
            .storage()
            .persistent()
            .get(&owner_key)
            .unwrap_or(Vec::new(&env));

        owner_tokens.push_back(token_id.clone());
        env.storage().persistent().set(&owner_key, &owner_tokens);

        // Increment counter
        let mut counter: u64 = env.storage().instance().get(&COUNTER).unwrap();
        counter += 1;
        env.storage().instance().set(&COUNTER, &counter);

        // Emit event
        env.events()
            .publish((symbol_short!("mint"), owner), (token_id.clone(), uri));

        token_id
    }

    /// Get token metadata
    pub fn get_token(env: Env, token_id: String) -> Option<TokenMetadata> {
        let token_key = TokenKey::Token(token_id);
        env.storage().persistent().get(&token_key)
    }

    /// Get all tokens owned by an address
    pub fn get_owner_tokens(env: Env, owner: Address) -> Vec<String> {
        let owner_key = TokenKey::OwnerTokens(owner);
        env.storage()
            .persistent()
            .get(&owner_key)
            .unwrap_or(Vec::new(&env))
    }

    /// Get the total number of minted tokens
    pub fn get_total_supply(env: Env) -> u64 {
        env.storage().instance().get(&COUNTER).unwrap_or(0)
    }

    /// Get the contract name
    pub fn get_name(env: Env) -> String {
        env.storage().instance().get(&NAME).unwrap()
    }

    /// Get the contract symbol
    pub fn get_symbol(env: Env) -> String {
        env.storage().instance().get(&SYMBOL).unwrap()
    }

    /// Get the contract admin
    pub fn get_admin(env: Env) -> Address {
        env.storage().instance().get(&OWNER).unwrap()
    }

    /// Transfer admin rights (optional, for future upgrades)
    pub fn transfer_admin(env: Env, new_admin: Address) {
        let admin: Address = env.storage().instance().get(&OWNER).unwrap();
        admin.require_auth();
        env.storage().instance().set(&OWNER, &new_admin);
    }
}

#[cfg(test)]
mod test {
    use super::*;
    use soroban_sdk::{testutils::Address as _, Env};

    #[test]
    fn test_initialize() {
        let env = Env::default();
        let contract_id = env.register_contract(None, HanaMemoryNftContract);
        let client = HanaMemoryNftContractClient::new(&env, &contract_id);

        let admin = Address::generate(&env);
        let name = String::from_str(&env, "Hana Memory NFT");
        let symbol = String::from_str(&env, "HANA-MEM");

        client.initialize(&admin, &name, &symbol);

        assert_eq!(client.get_name(), name);
        assert_eq!(client.get_symbol(), symbol);
        assert_eq!(client.get_total_supply(), 0);
    }

    #[test]
    fn test_mint() {
        let env = Env::default();
        let contract_id = env.register_contract(None, HanaMemoryNftContract);
        let client = HanaMemoryNftContractClient::new(&env, &contract_id);

        let admin = Address::generate(&env);
        let owner = Address::generate(&env);

        client.initialize(
            &admin,
            &String::from_str(&env, "Hana Memory NFT"),
            &String::from_str(&env, "HANA-MEM"),
        );

        env.mock_all_auths();

        let token_id = String::from_str(&env, "sha256:abc123");
        let uri = String::from_str(&env, "ipfs://QmTest");

        let minted_token_id = client.mint(&owner, &token_id, &uri);

        assert_eq!(minted_token_id, token_id);
        assert_eq!(client.get_total_supply(), 1);

        let token_metadata = client.get_token(&token_id).unwrap();
        assert_eq!(token_metadata.token_id, token_id);
        assert_eq!(token_metadata.owner, owner);
        assert_eq!(token_metadata.uri, uri);

        let owner_tokens = client.get_owner_tokens(&owner);
        assert_eq!(owner_tokens.len(), 1);
        assert_eq!(owner_tokens.get(0).unwrap(), token_id);
    }

    #[test]
    fn test_idempotent_mint() {
        let env = Env::default();
        let contract_id = env.register_contract(None, HanaMemoryNftContract);
        let client = HanaMemoryNftContractClient::new(&env, &contract_id);

        let admin = Address::generate(&env);
        let owner = Address::generate(&env);

        client.initialize(
            &admin,
            &String::from_str(&env, "Hana Memory NFT"),
            &String::from_str(&env, "HANA-MEM"),
        );

        env.mock_all_auths();

        let token_id = String::from_str(&env, "sha256:abc123");
        let uri = String::from_str(&env, "ipfs://QmTest");

        // First mint
        let first_mint = client.mint(&owner, &token_id, &uri);
        assert_eq!(first_mint, token_id);
        assert_eq!(client.get_total_supply(), 1);

        // Second mint with same token_id (idempotent)
        let second_mint = client.mint(&owner, &token_id, &uri);
        assert_eq!(second_mint, token_id);
        assert_eq!(client.get_total_supply(), 1); // Counter should not increment

        let owner_tokens = client.get_owner_tokens(&owner);
        assert_eq!(owner_tokens.len(), 1); // Should still have only 1 token
    }
}
