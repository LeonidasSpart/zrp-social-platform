-- Adds disputed-payout tracking to every launchpad model whose claim
-- flow executes a payout via executeVestingClaim/executeStakingPayout.
-- Set when a claim transaction was broadcast but its on-chain outcome
-- could not be confirmed (e.g. an RPC timeout) - the payout may have
-- genuinely succeeded. While set, no further claim-challenge can be
-- issued for that row, closing the double-payout window where a
-- second claim-challenge + claim could otherwise re-pay an already
-- (possibly) completed transfer.

ALTER TABLE "VestingContract" ADD COLUMN "disputedTransactionId" TEXT;
ALTER TABLE "VestingContract" ADD COLUMN "disputedAt" TIMESTAMP(3);

ALTER TABLE "StakingPosition" ADD COLUMN "disputedTransactionId" TEXT;
ALTER TABLE "StakingPosition" ADD COLUMN "disputedAt" TIMESTAMP(3);

ALTER TABLE "NftStakingPosition" ADD COLUMN "disputedTransactionId" TEXT;
ALTER TABLE "NftStakingPosition" ADD COLUMN "disputedAt" TIMESTAMP(3);

ALTER TABLE "FarmingPosition" ADD COLUMN "disputedTransactionId" TEXT;
ALTER TABLE "FarmingPosition" ADD COLUMN "disputedAt" TIMESTAMP(3);
