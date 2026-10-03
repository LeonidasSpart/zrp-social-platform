use anchor_lang::prelude::*;

/// Singleton protocol configuration. Seeds: [b"global"].
/// Authoritative for every fee/threshold the program enforces - never
/// trusted from a client-submitted value.
#[account]
pub struct GlobalConfig {
    /// Can call `update_config`. Set to the first caller of `initialize`.
    pub authority: Pubkey,
    /// Receives creation/buy/sell fees.
    pub fee_recipient: Pubkey,
    /// Receives the curve's remaining SOL + tokens on graduation, for the
    /// off-chain step that seeds the ZRP-managed Raydium CPMM pool
    /// (src/lib/launchpad/pool-service.ts). A separate, audited AMM
    /// integration is deliberately not reimplemented inside this program -
    /// see CLAUDE.md "Post-graduation liquidity".
    pub migration_authority: Pubkey,
    /// Lamports charged once per token creation.
    pub creation_fee_lamports: u64,
    /// Basis points (1/100 of 1%) taken from every buy's SOL input.
    pub buy_fee_bps: u16,
    /// Basis points taken from every sell's SOL output.
    pub sell_fee_bps: u16,
    /// Starting virtual SOL reserves for every new curve (lamports).
    pub initial_virtual_sol_reserves: u64,
    /// Starting virtual token reserves for every new curve (base units).
    pub initial_virtual_token_reserves: u64,
    /// Total supply minted at creation (base units, all credited to the
    /// curve vault; mint authority is revoked immediately after).
    pub token_total_supply: u64,
    /// Real SOL reserves (lamports, excluding rent) a curve must reach for
    /// `complete` to flip true and graduation to become callable.
    pub graduation_sol_target: u64,
    /// Token decimals used for every ZRP-launched mint.
    pub token_decimals: u8,
    pub bump: u8,
}

impl GlobalConfig {
    pub const SEED: &'static [u8] = b"global";
    pub const SIZE: usize = 8 // discriminator
        + 32 // authority
        + 32 // fee_recipient
        + 32 // migration_authority
        + 8 // creation_fee_lamports
        + 2 // buy_fee_bps
        + 2 // sell_fee_bps
        + 8 // initial_virtual_sol_reserves
        + 8 // initial_virtual_token_reserves
        + 8 // token_total_supply
        + 8 // graduation_sol_target
        + 1 // token_decimals
        + 1; // bump
}

/// Per-mint bonding curve state. Seeds: [b"bonding-curve", mint]. This
/// account is the curve's own SOL vault: its lamport balance above its
/// rent-exempt minimum always equals `real_sol_reserves` exactly, so buy/
/// sell settle by direct lamport debit/credit on this account rather than a
/// separate vault PDA. Its associated token account (owned by this PDA)
/// holds `real_token_reserves` of the mint.
#[account]
pub struct BondingCurve {
    pub mint: Pubkey,
    pub creator: Pubkey,
    pub virtual_sol_reserves: u64,
    pub virtual_token_reserves: u64,
    pub real_sol_reserves: u64,
    pub real_token_reserves: u64,
    pub token_total_supply: u64,
    /// True once real_sol_reserves has ever crossed the graduation
    /// threshold - trading stops immediately (set inside `buy`).
    pub complete: bool,
    /// True once `graduate` has swept reserves to the migration authority.
    /// Separate from `complete` because crossing the threshold and the
    /// actual asset sweep are two distinct, independently-callable steps.
    pub migrated: bool,
    pub created_at: i64,
    pub bump: u8,
}

impl BondingCurve {
    pub const SEED_PREFIX: &'static [u8] = b"bonding-curve";
    pub const SIZE: usize = 8 // discriminator
        + 32 // mint
        + 32 // creator
        + 8 // virtual_sol_reserves
        + 8 // virtual_token_reserves
        + 8 // real_sol_reserves
        + 8 // real_token_reserves
        + 8 // token_total_supply
        + 1 // complete
        + 1 // migrated
        + 8 // created_at
        + 1; // bump
}
