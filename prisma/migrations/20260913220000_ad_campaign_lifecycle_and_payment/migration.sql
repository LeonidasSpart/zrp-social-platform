-- AdCampaign lifecycle completion + real payment verification.
--
-- Today an admin's "approve" action jumps a campaign straight from
-- PENDING_REVIEW to ACTIVE, and budgetTotal is a client-typed number with
-- no funding step behind it at all - nothing ever actually collects the
-- advertiser's money. This migration is additive only: no existing value
-- is renamed or removed, no column type changes, and no existing
-- AdCampaign row is touched.
--
-- New enum values (IF NOT EXISTS makes this safe to re-run):
--   PAYMENT_PENDING - staff approved the content, awaiting a verified
--     on-chain USDC payment for budgetTotal before the campaign can serve.
--   PAYMENT_FAILED  - a submitted transaction failed verification; the
--     advertiser can retry payment from here.
--   SUSPENDED       - staff-forced stop on an otherwise-active campaign,
--     distinct from the advertiser's own PAUSED (only staff can resume).
--   CANCELLED       - advertiser- or staff-initiated permanent stop,
--     distinct from COMPLETED (ran its course / exhausted budget).

-- AlterEnum
ALTER TYPE "AdCampaignStatus" ADD VALUE IF NOT EXISTS 'PAYMENT_PENDING';
ALTER TYPE "AdCampaignStatus" ADD VALUE IF NOT EXISTS 'PAYMENT_FAILED';
ALTER TYPE "AdCampaignStatus" ADD VALUE IF NOT EXISTS 'SUSPENDED';
ALTER TYPE "AdCampaignStatus" ADD VALUE IF NOT EXISTS 'CANCELLED';

-- AlterTable
ALTER TABLE "AdCampaign" ADD COLUMN "paymentTransactionId" TEXT;
ALTER TABLE "AdCampaign" ADD COLUMN "paidAt" TIMESTAMP(3);
ALTER TABLE "AdCampaign" ADD COLUMN "paymentFailureReason" TEXT;
ALTER TABLE "AdCampaign" ADD COLUMN "adminNote" TEXT;
ALTER TABLE "AdCampaign" ADD COLUMN "targetCountries" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

-- CreateIndex
CREATE UNIQUE INDEX "AdCampaign_paymentTransactionId_key" ON "AdCampaign"("paymentTransactionId");
