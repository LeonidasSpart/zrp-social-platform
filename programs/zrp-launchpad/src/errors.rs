use anchor_lang::prelude::*;

#[error_code]
pub enum ZrpLaunchpadError {
    #[msg("Arithmetic overflow")]
    MathOverflow,
    #[msg("Amount must be greater than zero")]
    InvalidAmount,
    #[msg("This curve has already graduated and no longer trades")]
    CurveComplete,
    #[msg("This curve has not reached its graduation threshold yet")]
    GraduationThresholdNotMet,
    #[msg("Slippage tolerance exceeded")]
    SlippageExceeded,
    #[msg("Curve does not hold enough reserves for this trade")]
    InsufficientReserves,
    #[msg("Only the protocol authority may perform this action")]
    Unauthorized,
    #[msg("Fee basis points must be between 0 and 10000")]
    InvalidFeeBps,
    #[msg("Name exceeds the maximum length")]
    NameTooLong,
    #[msg("Symbol exceeds the maximum length")]
    SymbolTooLong,
    #[msg("URI exceeds the maximum length")]
    UriTooLong,
    #[msg("This curve's reserves have already been migrated")]
    AlreadyMigrated,
}
