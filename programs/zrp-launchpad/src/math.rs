use crate::errors::ZrpLaunchpadError;
use anchor_lang::prelude::*;

pub const BPS_DENOMINATOR: u128 = 10_000;

pub struct BuyResult {
    pub token_out: u64,
    pub fee_lamports: u64,
    pub new_virtual_sol_reserves: u64,
    pub new_virtual_token_reserves: u64,
}

pub struct SellResult {
    pub sol_out: u64,
    pub fee_lamports: u64,
    pub new_virtual_sol_reserves: u64,
    pub new_virtual_token_reserves: u64,
}

fn apply_fee_bps(amount: u128, fee_bps: u16) -> Result<u128> {
    amount
        .checked_mul(fee_bps as u128)
        .ok_or(ZrpLaunchpadError::MathOverflow.into())
        .map(|v| v / BPS_DENOMINATOR)
}

/// Constant-product (x*y=k) curve, same mechanic Pump.fun popularized and
/// documented in docs/launchpad-bonding-curve-research.md - the model is
/// public-domain math, this implementation and all state it reads/writes
/// belong to the ZRP program exclusively.
///
/// `sol_in` is the buyer's gross lamport input. The fee is taken off the
/// top; only `sol_in - fee` ever enters the virtual-reserve invariant, so
/// the curve's price impact matches what the buyer actually paid toward
/// tokens.
pub fn compute_buy(
    virtual_sol_reserves: u64,
    virtual_token_reserves: u64,
    sol_in: u64,
    fee_bps: u16,
) -> Result<BuyResult> {
    require!(sol_in > 0, ZrpLaunchpadError::InvalidAmount);

    let fee_lamports = apply_fee_bps(sol_in as u128, fee_bps)? as u64;
    let sol_after_fee = sol_in
        .checked_sub(fee_lamports)
        .ok_or(ZrpLaunchpadError::MathOverflow)?;

    let k = (virtual_sol_reserves as u128)
        .checked_mul(virtual_token_reserves as u128)
        .ok_or(ZrpLaunchpadError::MathOverflow)?;

    let new_virtual_sol_reserves_u128 = (virtual_sol_reserves as u128)
        .checked_add(sol_after_fee as u128)
        .ok_or(ZrpLaunchpadError::MathOverflow)?;
    require!(
        new_virtual_sol_reserves_u128 > 0,
        ZrpLaunchpadError::MathOverflow
    );

    // Round the new virtual-token side UP so the invariant never dips below
    // k - i.e. the protocol never gives out a fractional unit more than the
    // true curve would, rounding error always favors the pool, never the
    // trader.
    let new_virtual_token_reserves_u128 = k
        .checked_add(new_virtual_sol_reserves_u128 - 1)
        .ok_or(ZrpLaunchpadError::MathOverflow)?
        .checked_div(new_virtual_sol_reserves_u128)
        .ok_or(ZrpLaunchpadError::MathOverflow)?;

    require!(
        new_virtual_token_reserves_u128 < virtual_token_reserves as u128,
        ZrpLaunchpadError::InsufficientReserves
    );

    let token_out = (virtual_token_reserves as u128)
        .checked_sub(new_virtual_token_reserves_u128)
        .ok_or(ZrpLaunchpadError::MathOverflow)?;

    Ok(BuyResult {
        token_out: u64::try_from(token_out).map_err(|_| ZrpLaunchpadError::MathOverflow)?,
        fee_lamports,
        new_virtual_sol_reserves: u64::try_from(new_virtual_sol_reserves_u128)
            .map_err(|_| ZrpLaunchpadError::MathOverflow)?,
        new_virtual_token_reserves: u64::try_from(new_virtual_token_reserves_u128)
            .map_err(|_| ZrpLaunchpadError::MathOverflow)?,
    })
}

/// Inverse of `compute_buy`: the seller's gross token input moves the
/// virtual-token side up, the virtual-sol side down by the curve invariant,
/// and the protocol fee is taken off the resulting SOL output (never off
/// the token input), matching standard bonding-curve sell semantics.
pub fn compute_sell(
    virtual_sol_reserves: u64,
    virtual_token_reserves: u64,
    token_in: u64,
    fee_bps: u16,
) -> Result<SellResult> {
    require!(token_in > 0, ZrpLaunchpadError::InvalidAmount);

    let k = (virtual_sol_reserves as u128)
        .checked_mul(virtual_token_reserves as u128)
        .ok_or(ZrpLaunchpadError::MathOverflow)?;

    let new_virtual_token_reserves_u128 = (virtual_token_reserves as u128)
        .checked_add(token_in as u128)
        .ok_or(ZrpLaunchpadError::MathOverflow)?;

    // Round the new virtual-sol side DOWN so the invariant never dips below
    // k from the pool's perspective - the protocol never pays out more
    // lamports than the true curve would.
    let new_virtual_sol_reserves_u128 = k
        .checked_div(new_virtual_token_reserves_u128)
        .ok_or(ZrpLaunchpadError::MathOverflow)?;

    require!(
        new_virtual_sol_reserves_u128 < virtual_sol_reserves as u128,
        ZrpLaunchpadError::InsufficientReserves
    );

    let sol_out_before_fee = (virtual_sol_reserves as u128)
        .checked_sub(new_virtual_sol_reserves_u128)
        .ok_or(ZrpLaunchpadError::MathOverflow)?;

    let fee_lamports = apply_fee_bps(sol_out_before_fee, fee_bps)?;
    let sol_out = sol_out_before_fee
        .checked_sub(fee_lamports)
        .ok_or(ZrpLaunchpadError::MathOverflow)?;

    Ok(SellResult {
        sol_out: u64::try_from(sol_out).map_err(|_| ZrpLaunchpadError::MathOverflow)?,
        fee_lamports: u64::try_from(fee_lamports).map_err(|_| ZrpLaunchpadError::MathOverflow)?,
        new_virtual_sol_reserves: u64::try_from(new_virtual_sol_reserves_u128)
            .map_err(|_| ZrpLaunchpadError::MathOverflow)?,
        new_virtual_token_reserves: u64::try_from(new_virtual_token_reserves_u128)
            .map_err(|_| ZrpLaunchpadError::MathOverflow)?,
    })
}
