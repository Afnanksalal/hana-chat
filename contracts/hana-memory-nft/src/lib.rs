#![no_std]

//! Hana NFT Collection Contract
//!
//! A Soroban contract for Hana creator-art and memory-proof NFTs. The API
//! gateway owns mint and marketplace-transfer authorization; the chain stores
//! token ownership, metadata URI, creator royalty basis points, and provenance
//! events so marketplace rows can be reconciled against on-chain state.

use soroban_sdk::{
    contract, contractimpl, contracttype, symbol_short, Address, Env, String, Symbol, Vec,
};

const ADMIN: Symbol = symbol_short!("ADMIN");
const NAME: Symbol = symbol_short!("NAME");
const SYMBOL: Symbol = symbol_short!("SYMBOL");
const SUPPLY: Symbol = symbol_short!("SUPPLY");
const MAX_ROYALTY_BPS: u32 = 1_000;
const TTL_THRESHOLD_LEDGERS: u32 = 120_960; // About 7 days at 5s ledgers.
const TTL_EXTEND_TO_LEDGERS: u32 = 518_400; // About 30 days at 5s ledgers.

#[derive(Clone)]
#[contracttype]
pub struct TokenMetadata {
    pub token_id: String,
    pub owner: Address,
    pub creator: Address,
    pub uri: String,
    pub royalty_bps: u32,
    pub minted_at: u64,
    pub updated_at: u64,
}

#[derive(Clone)]
#[contracttype]
pub enum StorageKey {
    Token(String),
    OwnerTokens(Address),
}

#[contract]
pub struct HanaNftCollectionContract;

#[contractimpl]
impl HanaNftCollectionContract {
    pub fn initialize(env: Env, admin: Address, name: String, symbol: String) {
        if env.storage().instance().has(&ADMIN) {
            panic!("already initialized");
        }

        admin.require_auth();
        env.storage().instance().set(&ADMIN, &admin);
        env.storage().instance().set(&NAME, &name);
        env.storage().instance().set(&SYMBOL, &symbol);
        env.storage().instance().set(&SUPPLY, &0u64);
        bump_instance_ttl(&env);
    }

    pub fn mint(
        env: Env,
        owner: Address,
        creator: Address,
        token_id: String,
        uri: String,
        royalty_bps: u32,
    ) -> String {
        let admin: Address = env.storage().instance().get(&ADMIN).unwrap();
        bump_instance_ttl(&env);
        admin.require_auth();

        if royalty_bps > MAX_ROYALTY_BPS {
            panic!("royalty too high");
        }

        let token_key = StorageKey::Token(token_id.clone());
        if let Some(existing) = env
            .storage()
            .persistent()
            .get::<StorageKey, TokenMetadata>(&token_key)
        {
            if existing.owner == owner
                && existing.creator == creator
                && existing.uri == uri
                && existing.royalty_bps == royalty_bps
            {
                bump_persistent_ttl(&env, &token_key);
                return token_id;
            }

            panic!("token id conflict");
        }

        let now = env.ledger().timestamp();
        let metadata = TokenMetadata {
            token_id: token_id.clone(),
            owner: owner.clone(),
            creator: creator.clone(),
            uri: uri.clone(),
            royalty_bps,
            minted_at: now,
            updated_at: now,
        };

        env.storage().persistent().set(&token_key, &metadata);
        bump_persistent_ttl(&env, &token_key);
        add_owner_token(&env, owner.clone(), token_id.clone());

        let mut supply: u64 = env.storage().instance().get(&SUPPLY).unwrap();
        supply += 1;
        env.storage().instance().set(&SUPPLY, &supply);
        bump_instance_ttl(&env);

        env.events().publish(
            (symbol_short!("mint"), owner, creator),
            (token_id.clone(), uri, royalty_bps),
        );

        token_id
    }

    pub fn marketplace_transfer(
        env: Env,
        token_id: String,
        from: Address,
        to: Address,
        sale_ref: String,
    ) -> String {
        let admin: Address = env.storage().instance().get(&ADMIN).unwrap();
        bump_instance_ttl(&env);
        admin.require_auth();

        let token_key = StorageKey::Token(token_id.clone());
        let mut metadata: TokenMetadata = env.storage().persistent().get(&token_key).unwrap();
        bump_persistent_ttl(&env, &token_key);

        if metadata.owner != from {
            panic!("seller is not owner");
        }

        remove_owner_token(&env, from.clone(), token_id.clone());
        add_owner_token(&env, to.clone(), token_id.clone());

        metadata.owner = to.clone();
        metadata.updated_at = env.ledger().timestamp();
        env.storage().persistent().set(&token_key, &metadata);
        bump_persistent_ttl(&env, &token_key);

        env.events().publish(
            (symbol_short!("sale"), from, to),
            (token_id.clone(), sale_ref),
        );

        token_id
    }

    pub fn owner_of(env: Env, token_id: String) -> Address {
        let token_key = StorageKey::Token(token_id);
        let metadata: TokenMetadata = env
            .storage()
            .persistent()
            .get(&token_key)
            .unwrap();

        bump_persistent_ttl(&env, &token_key);
        metadata.owner
    }

    pub fn get_token(env: Env, token_id: String) -> Option<TokenMetadata> {
        let token_key = StorageKey::Token(token_id);
        let token = env.storage().persistent().get(&token_key);

        if token.is_some() {
            bump_persistent_ttl(&env, &token_key);
        }

        token
    }

    pub fn get_owner_tokens(env: Env, owner: Address) -> Vec<String> {
        let owner_key = StorageKey::OwnerTokens(owner);
        let tokens = env
            .storage()
            .persistent()
            .get(&owner_key)
            .unwrap_or(Vec::new(&env));

        bump_persistent_ttl(&env, &owner_key);
        tokens
    }

    pub fn get_total_supply(env: Env) -> u64 {
        bump_instance_ttl(&env);
        env.storage()
            .instance()
            .get(&SUPPLY)
            .unwrap_or(0)
    }

    pub fn get_name(env: Env) -> String {
        bump_instance_ttl(&env);
        env.storage().instance().get(&NAME).unwrap()
    }

    pub fn get_symbol(env: Env) -> String {
        bump_instance_ttl(&env);
        env.storage().instance().get(&SYMBOL).unwrap()
    }

    pub fn get_admin(env: Env) -> Address {
        bump_instance_ttl(&env);
        env.storage().instance().get(&ADMIN).unwrap()
    }

    pub fn transfer_admin(env: Env, new_admin: Address) {
        let admin: Address = env.storage().instance().get(&ADMIN).unwrap();
        bump_instance_ttl(&env);
        admin.require_auth();
        env.storage().instance().set(&ADMIN, &new_admin);
        bump_instance_ttl(&env);
    }
}

fn add_owner_token(env: &Env, owner: Address, token_id: String) {
    let owner_key = StorageKey::OwnerTokens(owner);
    let mut tokens: Vec<String> = env
        .storage()
        .persistent()
        .get(&owner_key)
        .unwrap_or(Vec::new(env));

    tokens.push_back(token_id);
    env.storage().persistent().set(&owner_key, &tokens);
    bump_persistent_ttl(env, &owner_key);
}

fn remove_owner_token(env: &Env, owner: Address, token_id: String) {
    let owner_key = StorageKey::OwnerTokens(owner);
    let tokens: Vec<String> = env
        .storage()
        .persistent()
        .get(&owner_key)
        .unwrap_or(Vec::new(env));
    let mut retained = Vec::new(env);

    for existing in tokens.iter() {
        if existing != token_id {
            retained.push_back(existing);
        }
    }

    env.storage().persistent().set(&owner_key, &retained);
    bump_persistent_ttl(env, &owner_key);
}

fn bump_instance_ttl(env: &Env) {
    env.storage()
        .instance()
        .extend_ttl(TTL_THRESHOLD_LEDGERS, TTL_EXTEND_TO_LEDGERS);
}

fn bump_persistent_ttl(env: &Env, key: &StorageKey) {
    env.storage()
        .persistent()
        .extend_ttl(key, TTL_THRESHOLD_LEDGERS, TTL_EXTEND_TO_LEDGERS);
}

#[cfg(test)]
mod test {
    use super::*;
    use soroban_sdk::{testutils::Address as _, Env};

    fn setup(env: &Env) -> (HanaNftCollectionContractClient, Address, Address, Address) {
        let contract_id = env.register_contract(None, HanaNftCollectionContract);
        let client = HanaNftCollectionContractClient::new(env, &contract_id);
        let admin = Address::generate(env);
        let creator = Address::generate(env);
        let owner = Address::generate(env);

        env.mock_all_auths();
        client.initialize(
            &admin,
            &String::from_str(env, "Hana NFT Collection"),
            &String::from_str(env, "HANA"),
        );

        (client, admin, creator, owner)
    }

    #[test]
    fn mints_and_reads_metadata() {
        let env = Env::default();
        let (client, _admin, creator, owner) = setup(&env);
        let token_id = String::from_str(&env, "hana-art:abc123");
        let uri = String::from_str(
            &env,
            "https://app.hanachat.site/api/v1/nft/assets/abc/metadata",
        );

        client.mint(&owner, &creator, &token_id, &uri, &500);

        let token = client.get_token(&token_id).unwrap();
        assert_eq!(token.owner, owner);
        assert_eq!(token.creator, creator);
        assert_eq!(token.uri, uri);
        assert_eq!(token.royalty_bps, 500);
        assert_eq!(client.get_total_supply(), 1);
    }

    #[test]
    fn mint_is_idempotent_for_same_token_id() {
        let env = Env::default();
        let (client, _admin, creator, owner) = setup(&env);
        let token_id = String::from_str(&env, "hana-art:abc123");
        let uri = String::from_str(&env, "stellar://metadata/abc");

        client.mint(&owner, &creator, &token_id, &uri, &250);
        client.mint(&owner, &creator, &token_id, &uri, &250);

        assert_eq!(client.get_total_supply(), 1);
        assert_eq!(client.get_owner_tokens(&owner).len(), 1);
    }

    #[test]
    #[should_panic(expected = "token id conflict")]
    fn mint_rejects_conflicting_duplicate_token_id() {
        let env = Env::default();
        let (client, _admin, creator, owner) = setup(&env);
        let other_owner = Address::generate(&env);
        let token_id = String::from_str(&env, "hana-art:abc123");
        let uri = String::from_str(&env, "stellar://metadata/abc");

        client.mint(&owner, &creator, &token_id, &uri, &250);
        client.mint(&other_owner, &creator, &token_id, &uri, &250);
    }

    #[test]
    fn marketplace_transfer_updates_owner_lists() {
        let env = Env::default();
        let (client, _admin, creator, owner) = setup(&env);
        let buyer = Address::generate(&env);
        let token_id = String::from_str(&env, "hana-art:abc123");

        client.mint(
            &owner,
            &creator,
            &token_id,
            &String::from_str(&env, "stellar://metadata/abc"),
            &500,
        );
        client.marketplace_transfer(&token_id, &owner, &buyer, &String::from_str(&env, "sale-1"));

        assert_eq!(client.owner_of(&token_id), buyer);
        assert_eq!(client.get_owner_tokens(&owner).len(), 0);
        assert_eq!(client.get_owner_tokens(&buyer).len(), 1);
    }
}
