// ZRP Launchpad - a ZRP-native Solana bonding-curve launch protocol.
//
// This program, not any third-party protocol, owns the mint creation,
// bonding-curve state, buy/sell execution, fee enforcement and graduation
// lifecycle for every token created through ZRP's Launchpad. Pump.fun was
// used only as a UX/product reference (see CLAUDE.md) - no instruction here
// calls into Pump.fun's program, and no account here is owned by it.
//
// All authoritative state (reserves, fees, completion) lives on-chain in
// the accounts below. The off-chain Prisma `LaunchedToken`/indexer is a
// read cache of this state, never the other way around.

use anchor_lang::prelude::*;
use anchor_lang::system_program;
use anchor_spl::associated_token::AssociatedToken;
use anchor_spl::metadata::{
    create_metadata_accounts_v3, mpl_token_metadata::types::DataV2, CreateMetadataAccountsV3,
    Metadata,
};
use anchor_spl::token::{self, Mint, MintTo, SetAuthority, Token, TokenAccount, Transfer};

pub mod errors;
pub mod events;
pub mod math;
pub mod state;

use errors::ZrpLaunchpadError;
use events::{GraduateEvent, TokenCreatedEvent, TradeEvent};
use state::{BondingCurve, GlobalConfig};

declare_id!("3vr1SHa9LvEvELb23NBG1J6oFRCSDs8cj8wS55zuoRxK");

pub const MAX_NAME_LEN: usize = 32;
pub const MAX_SYMBOL_LEN: usize = 10;
pub const MAX_URI_LEN: usize = 200;
pub const MAX_FEE_BPS: u16 = 2_000; // 20% hard ceiling, enforced on-chain regardless of what any client/admin UI sends

#[program]
pub mod zrp_launchpad {
    use super::*;

    /// One-time protocol setup. The caller becomes the admin authority.
    /// There is no second call possible: `global_config`'s `init`
    /// constraint fails if it already exists, so authority can never be
    /// silently reassigned through this instruction.
    pub fn initialize(
        ctx: Context<Initialize>,
        creation_fee_lamports: u64,
        buy_fee_bps: u16,
        sell_fee_bps: u16,
        initial_virtual_sol_reserves: u64,
        initial_virtual_token_reserves: u64,
        token_total_supply: u64,
        graduation_sol_target: u64,
        token_decimals: u8,
    ) -> Result<()> {
        require!(buy_fee_bps <= MAX_FEE_BPS, ZrpLaunchpadError::InvalidFeeBps);
        require!(sell_fee_bps <= MAX_FEE_BPS, ZrpLaunchpadError::InvalidFeeBps);
        require!(
            initial_virtual_sol_reserves > 0 && initial_virtual_token_reserves > 0,
            ZrpLaunchpadError::InvalidAmount
        );
        require!(token_total_supply > 0, ZrpLaunchpadError::InvalidAmount);
        require!(graduation_sol_target > 0, ZrpLaunchpadError::InvalidAmount);

        let config = &mut ctx.accounts.global_config;
        config.authority = ctx.accounts.authority.key();
        config.fee_recipient = ctx.accounts.fee_recipient.key();
        config.migration_authority = ctx.accounts.migration_authority.key();
        config.creation_fee_lamports = creation_fee_lamports;
        config.buy_fee_bps = buy_fee_bps;
        config.sell_fee_bps = sell_fee_bps;
        config.initial_virtual_sol_reserves = initial_virtual_sol_reserves;
        config.initial_virtual_token_reserves = initial_virtual_token_reserves;
        config.token_total_supply = token_total_supply;
        config.graduation_sol_target = graduation_sol_target;
        config.token_decimals = token_decimals;
        config.bump = ctx.bumps.global_config;
        Ok(())
    }

    /// Admin-only. Never trusted from a client-submitted value anywhere
    /// else in the program - every fee/threshold/reserve check always
    /// reads this account fresh.
    #[allow(clippy::too_many_arguments)]
    pub fn update_config(
        ctx: Context<UpdateConfig>,
        fee_recipient: Pubkey,
        migration_authority: Pubkey,
        creation_fee_lamports: u64,
        buy_fee_bps: u16,
        sell_fee_bps: u16,
        graduation_sol_target: u64,
    ) -> Result<()> {
        require!(buy_fee_bps <= MAX_FEE_BPS, ZrpLaunchpadError::InvalidFeeBps);
        require!(sell_fee_bps <= MAX_FEE_BPS, ZrpLaunchpadError::InvalidFeeBps);
        require!(graduation_sol_target > 0, ZrpLaunchpadError::InvalidAmount);

        let config = &mut ctx.accounts.global_config;
        config.fee_recipient = fee_recipient;
        config.migration_authority = migration_authority;
        config.creation_fee_lamports = creation_fee_lamports;
        config.buy_fee_bps = buy_fee_bps;
        config.sell_fee_bps = sell_fee_bps;
        config.graduation_sol_target = graduation_sol_target;
        Ok(())
    }

    /// Mint a ZRP-native token, initialize its bonding curve, and
    /// optionally execute the creator's first buy - all in this single
    /// instruction, so "create + initial buy" is atomic (spec: either both
    /// happen or the whole transaction fails, never a token with no curve
    /// or a curve the creator failed to buy into).
    pub fn create_and_buy(
        ctx: Context<CreateAndBuy>,
        name: String,
        symbol: String,
        uri: String,
        initial_buy_lamports: u64,
        min_tokens_out: u64,
    ) -> Result<()> {
        require!(name.len() <= MAX_NAME_LEN, ZrpLaunchpadError::NameTooLong);
        require!(
            symbol.len() <= MAX_SYMBOL_LEN,
            ZrpLaunchpadError::SymbolTooLong
        );
        require!(uri.len() <= MAX_URI_LEN, ZrpLaunchpadError::UriTooLong);

        let config = &ctx.accounts.global_config;
        let mint_key = ctx.accounts.mint.key();
        let bonding_curve_bump = ctx.bumps.bonding_curve;

        let curve = &mut ctx.accounts.bonding_curve;
        curve.mint = mint_key;
        curve.creator = ctx.accounts.creator.key();
        curve.virtual_sol_reserves = config.initial_virtual_sol_reserves;
        curve.virtual_token_reserves = config.initial_virtual_token_reserves;
        curve.real_sol_reserves = 0;
        curve.real_token_reserves = config.token_total_supply;
        curve.token_total_supply = config.token_total_supply;
        curve.complete = false;
        curve.migrated = false;
        curve.created_at = Clock::get()?.unix_timestamp;
        curve.bump = bonding_curve_bump;

        let curve_signer_seeds: &[&[u8]] = &[
            BondingCurve::SEED_PREFIX,
            mint_key.as_ref(),
            &[bonding_curve_bump],
        ];
        let signer_seeds = &[curve_signer_seeds];

        // Mint the full fixed supply into the curve's own vault, while the
        // curve PDA is still the mint authority.
        token::mint_to(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                MintTo {
                    mint: ctx.accounts.mint.to_account_info(),
                    to: ctx.accounts.curve_token_vault.to_account_info(),
                    authority: ctx.accounts.bonding_curve.to_account_info(),
                },
                signer_seeds,
            ),
            config.token_total_supply,
        )?;

        // Metaplex metadata, created while the curve PDA can still sign as
        // mint authority. update_authority is the curve PDA itself and the
        // account is immutable thereafter (no admin can rewrite a live
        // token's name/image after the fact).
        create_metadata_accounts_v3(
            CpiContext::new_with_signer(
                ctx.accounts.token_metadata_program.to_account_info(),
                CreateMetadataAccountsV3 {
                    metadata: ctx.accounts.metadata.to_account_info(),
                    mint: ctx.accounts.mint.to_account_info(),
                    mint_authority: ctx.accounts.bonding_curve.to_account_info(),
                    update_authority: ctx.accounts.bonding_curve.to_account_info(),
                    payer: ctx.accounts.creator.to_account_info(),
                    system_program: ctx.accounts.system_program.to_account_info(),
                    rent: ctx.accounts.rent.to_account_info(),
                },
                signer_seeds,
            ),
            DataV2 {
                name: name.clone(),
                symbol: symbol.clone(),
                uri: uri.clone(),
                seller_fee_basis_points: 0,
                creators: None,
                collection: None,
                uses: None,
            },
            false,
            true,
            None,
        )?;

        // Fixed supply, forever: revoke both authorities now that minting
        // and metadata creation are done. No one - not ZRP, not the
        // creator - can mint more or freeze holders' tokens after this.
        token::set_authority(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                SetAuthority {
                    current_authority: ctx.accounts.bonding_curve.to_account_info(),
                    account_or_mint: ctx.accounts.mint.to_account_info(),
                },
                signer_seeds,
            ),
            token::spl_token::instruction::AuthorityType::MintTokens,
            None,
        )?;
        token::set_authority(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                SetAuthority {
                    current_authority: ctx.accounts.bonding_curve.to_account_info(),
                    account_or_mint: ctx.accounts.mint.to_account_info(),
                },
                signer_seeds,
            ),
            token::spl_token::instruction::AuthorityType::FreezeAccount,
            None,
        )?;

        // Flat, one-time creation fee, charged in the same transaction the
        // mint is created in - there is no way to get a free mint by
        // failing the fee transfer, since the whole instruction reverts.
        if config.creation_fee_lamports > 0 {
            system_program::transfer(
                CpiContext::new(
                    ctx.accounts.system_program.to_account_info(),
                    system_program::Transfer {
                        from: ctx.accounts.creator.to_account_info(),
                        to: ctx.accounts.fee_recipient.to_account_info(),
                    },
                ),
                config.creation_fee_lamports,
            )?;
        }

        emit!(TokenCreatedEvent {
            mint: mint_key,
            creator: ctx.accounts.creator.key(),
            bonding_curve: ctx.accounts.bonding_curve.key(),
            name,
            symbol,
            uri,
            virtual_sol_reserves: ctx.accounts.bonding_curve.virtual_sol_reserves,
            virtual_token_reserves: ctx.accounts.bonding_curve.virtual_token_reserves,
            token_total_supply: config.token_total_supply,
            timestamp: ctx.accounts.bonding_curve.created_at,
        });

        if initial_buy_lamports > 0 {
            let buy_fee_bps = config.buy_fee_bps;
            let graduation_sol_target = config.graduation_sol_target;
            let result = math::compute_buy(
                ctx.accounts.bonding_curve.virtual_sol_reserves,
                ctx.accounts.bonding_curve.virtual_token_reserves,
                initial_buy_lamports,
                buy_fee_bps,
            )?;
            require!(
                result.token_out >= min_tokens_out,
                ZrpLaunchpadError::SlippageExceeded
            );
            require!(
                result.token_out <= ctx.accounts.bonding_curve.real_token_reserves,
                ZrpLaunchpadError::InsufficientReserves
            );

            let sol_after_fee = initial_buy_lamports
                .checked_sub(result.fee_lamports)
                .ok_or(ZrpLaunchpadError::MathOverflow)?;

            if result.fee_lamports > 0 {
                system_program::transfer(
                    CpiContext::new(
                        ctx.accounts.system_program.to_account_info(),
                        system_program::Transfer {
                            from: ctx.accounts.creator.to_account_info(),
                            to: ctx.accounts.fee_recipient.to_account_info(),
                        },
                    ),
                    result.fee_lamports,
                )?;
            }
            system_program::transfer(
                CpiContext::new(
                    ctx.accounts.system_program.to_account_info(),
                    system_program::Transfer {
                        from: ctx.accounts.creator.to_account_info(),
                        to: ctx.accounts.bonding_curve.to_account_info(),
                    },
                ),
                sol_after_fee,
            )?;

            token::transfer(
                CpiContext::new_with_signer(
                    ctx.accounts.token_program.to_account_info(),
                    Transfer {
                        from: ctx.accounts.curve_token_vault.to_account_info(),
                        to: ctx.accounts.creator_token_account.to_account_info(),
                        authority: ctx.accounts.bonding_curve.to_account_info(),
                    },
                    signer_seeds,
                ),
                result.token_out,
            )?;

            let curve = &mut ctx.accounts.bonding_curve;
            curve.virtual_sol_reserves = result.new_virtual_sol_reserves;
            curve.virtual_token_reserves = result.new_virtual_token_reserves;
            curve.real_sol_reserves = curve
                .real_sol_reserves
                .checked_add(sol_after_fee)
                .ok_or(ZrpLaunchpadError::MathOverflow)?;
            curve.real_token_reserves = curve
                .real_token_reserves
                .checked_sub(result.token_out)
                .ok_or(ZrpLaunchpadError::MathOverflow)?;
            if curve.real_sol_reserves >= graduation_sol_target {
                curve.complete = true;
            }

            emit!(TradeEvent {
                mint: mint_key,
                trader: ctx.accounts.creator.key(),
                is_buy: true,
                sol_amount: initial_buy_lamports,
                token_amount: result.token_out,
                fee_lamports: result.fee_lamports,
                virtual_sol_reserves: curve.virtual_sol_reserves,
                virtual_token_reserves: curve.virtual_token_reserves,
                real_sol_reserves: curve.real_sol_reserves,
                real_token_reserves: curve.real_token_reserves,
                timestamp: Clock::get()?.unix_timestamp,
            });
        }

        Ok(())
    }

    /// Buy ZRP-native tokens directly from the curve. The program computes
    /// the real curve result server-side-equivalent (on-chain); it never
    /// trusts a client-submitted price or token amount, only `min_tokens_out`
    /// as the caller's own slippage floor.
    pub fn buy(ctx: Context<Buy>, sol_in: u64, min_tokens_out: u64) -> Result<()> {
        let curve = &ctx.accounts.bonding_curve;
        require!(!curve.complete, ZrpLaunchpadError::CurveComplete);

        let config = &ctx.accounts.global_config;
        let result = math::compute_buy(
            curve.virtual_sol_reserves,
            curve.virtual_token_reserves,
            sol_in,
            config.buy_fee_bps,
        )?;
        require!(
            result.token_out >= min_tokens_out,
            ZrpLaunchpadError::SlippageExceeded
        );
        require!(
            result.token_out <= curve.real_token_reserves,
            ZrpLaunchpadError::InsufficientReserves
        );

        let sol_after_fee = sol_in
            .checked_sub(result.fee_lamports)
            .ok_or(ZrpLaunchpadError::MathOverflow)?;

        if result.fee_lamports > 0 {
            system_program::transfer(
                CpiContext::new(
                    ctx.accounts.system_program.to_account_info(),
                    system_program::Transfer {
                        from: ctx.accounts.buyer.to_account_info(),
                        to: ctx.accounts.fee_recipient.to_account_info(),
                    },
                ),
                result.fee_lamports,
            )?;
        }
        system_program::transfer(
            CpiContext::new(
                ctx.accounts.system_program.to_account_info(),
                system_program::Transfer {
                    from: ctx.accounts.buyer.to_account_info(),
                    to: ctx.accounts.bonding_curve.to_account_info(),
                },
            ),
            sol_after_fee,
        )?;

        let mint_key = ctx.accounts.mint.key();
        let bump = ctx.accounts.bonding_curve.bump;
        let curve_signer_seeds: &[&[u8]] =
            &[BondingCurve::SEED_PREFIX, mint_key.as_ref(), &[bump]];
        token::transfer(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.curve_token_vault.to_account_info(),
                    to: ctx.accounts.buyer_token_account.to_account_info(),
                    authority: ctx.accounts.bonding_curve.to_account_info(),
                },
                &[curve_signer_seeds],
            ),
            result.token_out,
        )?;

        let graduation_sol_target = config.graduation_sol_target;
        let curve = &mut ctx.accounts.bonding_curve;
        curve.virtual_sol_reserves = result.new_virtual_sol_reserves;
        curve.virtual_token_reserves = result.new_virtual_token_reserves;
        curve.real_sol_reserves = curve
            .real_sol_reserves
            .checked_add(sol_after_fee)
            .ok_or(ZrpLaunchpadError::MathOverflow)?;
        curve.real_token_reserves = curve
            .real_token_reserves
            .checked_sub(result.token_out)
            .ok_or(ZrpLaunchpadError::MathOverflow)?;
        if curve.real_sol_reserves >= graduation_sol_target {
            curve.complete = true;
        }

        emit!(TradeEvent {
            mint: mint_key,
            trader: ctx.accounts.buyer.key(),
            is_buy: true,
            sol_amount: sol_in,
            token_amount: result.token_out,
            fee_lamports: result.fee_lamports,
            virtual_sol_reserves: curve.virtual_sol_reserves,
            virtual_token_reserves: curve.virtual_token_reserves,
            real_sol_reserves: curve.real_sol_reserves,
            real_token_reserves: curve.real_token_reserves,
            timestamp: Clock::get()?.unix_timestamp,
        });

        Ok(())
    }

    /// Sell ZRP-native tokens back into the curve.
    pub fn sell(ctx: Context<Sell>, token_in: u64, min_sol_out: u64) -> Result<()> {
        let curve = &ctx.accounts.bonding_curve;
        require!(!curve.complete, ZrpLaunchpadError::CurveComplete);

        let config = &ctx.accounts.global_config;
        let result = math::compute_sell(
            curve.virtual_sol_reserves,
            curve.virtual_token_reserves,
            token_in,
            config.sell_fee_bps,
        )?;
        require!(
            result.sol_out >= min_sol_out,
            ZrpLaunchpadError::SlippageExceeded
        );
        let total_lamports_out = result
            .sol_out
            .checked_add(result.fee_lamports)
            .ok_or(ZrpLaunchpadError::MathOverflow)?;
        require!(
            total_lamports_out <= curve.real_sol_reserves,
            ZrpLaunchpadError::InsufficientReserves
        );

        token::transfer(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.seller_token_account.to_account_info(),
                    to: ctx.accounts.curve_token_vault.to_account_info(),
                    authority: ctx.accounts.seller.to_account_info(),
                },
            ),
            token_in,
        )?;

        transfer_lamports_from_pda(
            &ctx.accounts.bonding_curve.to_account_info(),
            &ctx.accounts.seller.to_account_info(),
            result.sol_out,
        )?;
        if result.fee_lamports > 0 {
            transfer_lamports_from_pda(
                &ctx.accounts.bonding_curve.to_account_info(),
                &ctx.accounts.fee_recipient.to_account_info(),
                result.fee_lamports,
            )?;
        }

        let mint_key = ctx.accounts.mint.key();
        let curve = &mut ctx.accounts.bonding_curve;
        curve.virtual_sol_reserves = result.new_virtual_sol_reserves;
        curve.virtual_token_reserves = result.new_virtual_token_reserves;
        curve.real_sol_reserves = curve
            .real_sol_reserves
            .checked_sub(total_lamports_out)
            .ok_or(ZrpLaunchpadError::MathOverflow)?;
        curve.real_token_reserves = curve
            .real_token_reserves
            .checked_add(token_in)
            .ok_or(ZrpLaunchpadError::MathOverflow)?;

        emit!(TradeEvent {
            mint: mint_key,
            trader: ctx.accounts.seller.key(),
            is_buy: false,
            sol_amount: result.sol_out,
            token_amount: token_in,
            fee_lamports: result.fee_lamports,
            virtual_sol_reserves: curve.virtual_sol_reserves,
            virtual_token_reserves: curve.virtual_token_reserves,
            real_sol_reserves: curve.real_sol_reserves,
            real_token_reserves: curve.real_token_reserves,
            timestamp: Clock::get()?.unix_timestamp,
        });

        Ok(())
    }

    /// Permissionless: anyone may call this once a curve has crossed its
    /// graduation threshold, sweeping its remaining SOL + tokens to the
    /// protocol's migration authority so the existing, separately-audited
    /// ZRP Raydium-CPMM pool service can seed post-graduation liquidity.
    /// This program's own responsibility ends at recording the completed
    /// state and handing the assets off - it does not itself integrate an
    /// AMM.
    pub fn graduate(ctx: Context<Graduate>) -> Result<()> {
        let curve = &ctx.accounts.bonding_curve;
        require!(curve.complete, ZrpLaunchpadError::GraduationThresholdNotMet);
        require!(!curve.migrated, ZrpLaunchpadError::AlreadyMigrated);

        let sol_amount = curve.real_sol_reserves;
        let token_amount = curve.real_token_reserves;
        let mint_key = ctx.accounts.mint.key();
        let bump = curve.bump;

        // The token transfer (a CPI) must run BEFORE the raw SOL credit
        // below, not after. Diagnostic logging across two prior attempts
        // showed the "sum of account balances before and after instruction
        // do not match" runtime check firing immediately after a raw
        // `AccountInfo` lamport manipulation (via `transfer_lamports_from_pda`
        // or an equivalent direct credit) is followed by ANY subsequent CPI
        // in the same instruction - first with a direct credit to
        // `migration_authority` followed by the token CPI, then with a raw
        // credit to `caller` followed by a `system_program::transfer` CPI;
        // both failed at the exact same point regardless of which accounts
        // the following CPI touched. `sell()`'s proven-working payouts never
        // hit this because its CPI (the incoming token transfer) always runs
        // *before* its raw lamport credits, with no further CPI after them.
        // Matching that order here - CPI first, raw credit last - avoids the
        // problem entirely.
        if token_amount > 0 {
            let curve_signer_seeds: &[&[u8]] =
                &[BondingCurve::SEED_PREFIX, mint_key.as_ref(), &[bump]];
            token::transfer(
                CpiContext::new_with_signer(
                    ctx.accounts.token_program.to_account_info(),
                    Transfer {
                        from: ctx.accounts.curve_token_vault.to_account_info(),
                        to: ctx.accounts.migration_token_account.to_account_info(),
                        authority: ctx.accounts.bonding_curve.to_account_info(),
                    },
                    &[curve_signer_seeds],
                ),
                token_amount,
            )?;
        }
        if sol_amount > 0 {
            transfer_lamports_from_pda(
                &ctx.accounts.bonding_curve.to_account_info(),
                &ctx.accounts.migration_authority.to_account_info(),
                sol_amount,
            )?;
        }

        let curve = &mut ctx.accounts.bonding_curve;
        curve.real_sol_reserves = 0;
        curve.real_token_reserves = 0;
        curve.migrated = true;

        emit!(GraduateEvent {
            mint: mint_key,
            bonding_curve: ctx.accounts.bonding_curve.key(),
            real_sol_reserves_migrated: sol_amount,
            real_token_reserves_migrated: token_amount,
            migration_authority: ctx.accounts.migration_authority.key(),
            timestamp: Clock::get()?.unix_timestamp,
        });

        Ok(())
    }
}

/// Moves lamports out of a PDA this program owns via direct balance
/// manipulation. The System Program's Transfer instruction requires its
/// `from` account be owned by the System Program itself, which a program
/// data account like `bonding_curve` never is - so sell payouts and
/// graduation sweeps settle this way instead of via a system CPI. The
/// Solana runtime enforces conservation of lamports across the
/// instruction, so this can never create or destroy value; it can only
/// fail closed via the checked arithmetic below.
fn transfer_lamports_from_pda<'info>(
    from: &AccountInfo<'info>,
    to: &AccountInfo<'info>,
    amount: u64,
) -> Result<()> {
    **from.try_borrow_mut_lamports()? = from
        .lamports()
        .checked_sub(amount)
        .ok_or(ZrpLaunchpadError::MathOverflow)?;
    **to.try_borrow_mut_lamports()? = to
        .lamports()
        .checked_add(amount)
        .ok_or(ZrpLaunchpadError::MathOverflow)?;
    Ok(())
}

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(
        init,
        payer = authority,
        space = GlobalConfig::SIZE,
        seeds = [GlobalConfig::SEED],
        bump
    )]
    pub global_config: Account<'info, GlobalConfig>,

    #[account(mut)]
    pub authority: Signer<'info>,

    /// CHECK: stored as a plain fee-destination pubkey; the program never
    /// reads data from this account, only credits lamports to it.
    pub fee_recipient: UncheckedAccount<'info>,

    /// CHECK: stored as a plain pubkey that later `graduate` calls hand
    /// assets to off-chain custody for the Raydium migration step.
    pub migration_authority: UncheckedAccount<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct UpdateConfig<'info> {
    #[account(
        mut,
        seeds = [GlobalConfig::SEED],
        bump = global_config.bump,
        has_one = authority @ ZrpLaunchpadError::Unauthorized
    )]
    pub global_config: Account<'info, GlobalConfig>,

    pub authority: Signer<'info>,
}

#[derive(Accounts)]
#[instruction(name: String, symbol: String, uri: String)]
pub struct CreateAndBuy<'info> {
    #[account(seeds = [GlobalConfig::SEED], bump = global_config.bump)]
    pub global_config: Account<'info, GlobalConfig>,

    #[account(
        init,
        payer = creator,
        space = BondingCurve::SIZE,
        seeds = [BondingCurve::SEED_PREFIX, mint.key().as_ref()],
        bump
    )]
    pub bonding_curve: Account<'info, BondingCurve>,

    #[account(
        init,
        payer = creator,
        mint::decimals = global_config.token_decimals,
        mint::authority = bonding_curve,
        mint::freeze_authority = bonding_curve
    )]
    pub mint: Account<'info, Mint>,

    #[account(
        init,
        payer = creator,
        associated_token::mint = mint,
        associated_token::authority = bonding_curve
    )]
    pub curve_token_vault: Account<'info, TokenAccount>,

    #[account(
        init_if_needed,
        payer = creator,
        associated_token::mint = mint,
        associated_token::authority = creator
    )]
    pub creator_token_account: Account<'info, TokenAccount>,

    /// CHECK: this is the Metaplex metadata PDA for `mint`; its address is
    /// independently derived and validated by the `create_metadata_accounts_v3`
    /// CPI itself, which fails the whole transaction if it doesn't match.
    #[account(mut)]
    pub metadata: UncheckedAccount<'info>,

    #[account(mut)]
    pub creator: Signer<'info>,

    /// CHECK: plain fee-destination pubkey, must match the protocol config
    /// (never a client-supplied address).
    #[account(mut, address = global_config.fee_recipient)]
    pub fee_recipient: UncheckedAccount<'info>,

    pub token_metadata_program: Program<'info, Metadata>,
    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}

#[derive(Accounts)]
pub struct Buy<'info> {
    #[account(seeds = [GlobalConfig::SEED], bump = global_config.bump)]
    pub global_config: Account<'info, GlobalConfig>,

    #[account(
        mut,
        seeds = [BondingCurve::SEED_PREFIX, mint.key().as_ref()],
        bump = bonding_curve.bump,
        has_one = mint
    )]
    pub bonding_curve: Account<'info, BondingCurve>,

    pub mint: Account<'info, Mint>,

    #[account(
        mut,
        associated_token::mint = mint,
        associated_token::authority = bonding_curve
    )]
    pub curve_token_vault: Account<'info, TokenAccount>,

    #[account(
        init_if_needed,
        payer = buyer,
        associated_token::mint = mint,
        associated_token::authority = buyer
    )]
    pub buyer_token_account: Account<'info, TokenAccount>,

    #[account(mut)]
    pub buyer: Signer<'info>,

    /// CHECK: plain fee-destination pubkey, must match the protocol config.
    #[account(mut, address = global_config.fee_recipient)]
    pub fee_recipient: UncheckedAccount<'info>,

    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct Sell<'info> {
    #[account(seeds = [GlobalConfig::SEED], bump = global_config.bump)]
    pub global_config: Account<'info, GlobalConfig>,

    #[account(
        mut,
        seeds = [BondingCurve::SEED_PREFIX, mint.key().as_ref()],
        bump = bonding_curve.bump,
        has_one = mint
    )]
    pub bonding_curve: Account<'info, BondingCurve>,

    pub mint: Account<'info, Mint>,

    #[account(
        mut,
        associated_token::mint = mint,
        associated_token::authority = bonding_curve
    )]
    pub curve_token_vault: Account<'info, TokenAccount>,

    #[account(
        mut,
        associated_token::mint = mint,
        associated_token::authority = seller
    )]
    pub seller_token_account: Account<'info, TokenAccount>,

    #[account(mut)]
    pub seller: Signer<'info>,

    /// CHECK: plain fee-destination pubkey, must match the protocol config.
    #[account(mut, address = global_config.fee_recipient)]
    pub fee_recipient: UncheckedAccount<'info>,

    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct Graduate<'info> {
    #[account(seeds = [GlobalConfig::SEED], bump = global_config.bump)]
    pub global_config: Account<'info, GlobalConfig>,

    #[account(
        mut,
        seeds = [BondingCurve::SEED_PREFIX, mint.key().as_ref()],
        bump = bonding_curve.bump,
        has_one = mint
    )]
    pub bonding_curve: Account<'info, BondingCurve>,

    pub mint: Account<'info, Mint>,

    #[account(
        mut,
        associated_token::mint = mint,
        associated_token::authority = bonding_curve
    )]
    pub curve_token_vault: Account<'info, TokenAccount>,

    #[account(
        init_if_needed,
        payer = caller,
        associated_token::mint = mint,
        associated_token::authority = migration_authority
    )]
    pub migration_token_account: Account<'info, TokenAccount>,

    /// CHECK: plain pubkey, must match the protocol config; receives the
    /// migrated SOL directly and is the authority on `migration_token_account`.
    #[account(mut, address = global_config.migration_authority)]
    pub migration_authority: UncheckedAccount<'info>,

    /// Graduation is permissionless - anyone may trigger it once the
    /// threshold is met, and pays any rent this call needs.
    #[account(mut)]
    pub caller: Signer<'info>,

    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}
