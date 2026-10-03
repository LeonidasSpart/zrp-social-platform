-- ZRP Launchpad: pump-style bonding curve, historical analytics snapshots,
-- and discovery ranking support. TokenTrade is extended (not duplicated)
-- so a mint's pump bonding-curve trades and Raydium pool swaps share one
-- volume log; GraduationEvent and AnalyticsSnapshot are new, additive
-- tables with no change to existing data.

-- CreateEnum
CREATE TYPE "TradeSource" AS ENUM ('POOL_SWAP', 'BONDING_CURVE');

-- DropForeignKey
ALTER TABLE "TokenTrade" DROP CONSTRAINT "TokenTrade_poolId_fkey";

-- AlterTable
ALTER TABLE "TokenTrade" ADD COLUMN     "source" "TradeSource" NOT NULL DEFAULT 'POOL_SWAP',
ALTER COLUMN "poolId" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "TokenTrade" ADD CONSTRAINT "TokenTrade_poolId_fkey" FOREIGN KEY ("poolId") REFERENCES "TokenPool"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateIndex
CREATE INDEX "TokenTrade_mintAddress_source_blockTime_idx" ON "TokenTrade"("mintAddress", "source", "blockTime");

-- CreateTable
CREATE TABLE "GraduationEvent" (
    "id" TEXT NOT NULL,
    "mintAddress" TEXT NOT NULL,
    "bondingCurveAddress" TEXT NOT NULL,
    "poolAddress" TEXT,
    "signature" TEXT,
    "slot" INTEGER,
    "blockTime" TIMESTAMP(3),
    "detectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GraduationEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "GraduationEvent_mintAddress_key" ON "GraduationEvent"("mintAddress");

-- CreateIndex
CREATE UNIQUE INDEX "GraduationEvent_signature_key" ON "GraduationEvent"("signature");

-- CreateIndex
CREATE INDEX "GraduationEvent_mintAddress_idx" ON "GraduationEvent"("mintAddress");

-- CreateTable
CREATE TABLE "AnalyticsSnapshot" (
    "id" TEXT NOT NULL,
    "mintAddress" TEXT NOT NULL,
    "takenAt" TIMESTAMP(3) NOT NULL,
    "priceQuoteLamports" DECIMAL(38,0),
    "priceTokenRaw" DECIMAL(38,0),
    "marketCapLamports" DECIMAL(38,0),
    "curveProgressBps" INTEGER,
    "liquidityTotalLamports" DECIMAL(38,0) NOT NULL DEFAULT 0,
    "poolCount" INTEGER NOT NULL DEFAULT 0,
    "holderCount" INTEGER,
    "buyVolumeLamports" DECIMAL(38,0) NOT NULL DEFAULT 0,
    "sellVolumeLamports" DECIMAL(38,0) NOT NULL DEFAULT 0,
    "tradeCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AnalyticsSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AnalyticsSnapshot_mintAddress_takenAt_idx" ON "AnalyticsSnapshot"("mintAddress", "takenAt");

-- CreateIndex
CREATE UNIQUE INDEX "AnalyticsSnapshot_mintAddress_takenAt_key" ON "AnalyticsSnapshot"("mintAddress", "takenAt");
