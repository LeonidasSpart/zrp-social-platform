use anchor_lang::prelude::*;

/// Emitted once per ZRP-native mint. The ZRP backend indexer
/// (src/lib/launchpad/zrp-launch-service.ts) parses this from the
/// transaction logs as its source of truth - never a client's claimed
/// result - matching the existing pump-event-service.ts pattern this
/// replaces.
#[event]
pub struct TokenCreatedEvent {
    pub mint: Pubkey,
    pub creator: Pubkey,
    pub bonding_curve: Pubkey,
    pub name: String,
    pub symbol: String,
    pub uri: String,
    pub virtual_sol_reserves: u64,
    pub virtual_token_reserves: u64,
    pub token_total_supply: u64,
    pub timestamp: i64,
}

#[event]
pub struct TradeEvent {
    pub mint: Pubkey,
    pub trader: Pubkey,
    pub is_buy: bool,
    pub sol_amount: u64,
    pub token_amount: u64,
    pub fee_lamports: u64,
    pub virtual_sol_reserves: u64,
    pub virtual_token_reserves: u64,
    pub real_sol_reserves: u64,
    pub real_token_reserves: u64,
    pub timestamp: i64,
}

#[event]
pub struct GraduateEvent {
    pub mint: Pubkey,
    pub bonding_curve: Pubkey,
    pub real_sol_reserves_migrated: u64,
    pub real_token_reserves_migrated: u64,
    pub migration_authority: Pubkey,
    pub timestamp: i64,
}
