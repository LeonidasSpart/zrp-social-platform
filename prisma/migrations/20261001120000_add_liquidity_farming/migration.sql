-- CreateTable
CREATE TABLE "FarmingPool" (
    "id" TEXT NOT NULL,
    "lpMintAddress" TEXT NOT NULL,
    "lpTokenName" TEXT NOT NULL,
    "lpTokenSymbol" TEXT NOT NULL,
    "lpDecimals" INTEGER NOT NULL,
    "creatorId" TEXT,
    "rewardTokenId" TEXT NOT NULL,
    "apyBasisPoints" INTEGER NOT NULL,
    "lockSeconds" INTEGER NOT NULL,
    "minStakeRaw" DECIMAL(38,0) NOT NULL,
    "maxStakeRaw" DECIMAL(38,0),
    "totalStakedRaw" DECIMAL(38,0) NOT NULL DEFAULT 0,
    "rewardReserveRaw" DECIMAL(38,0) NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FarmingPool_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FarmingPosition" (
    "id" TEXT NOT NULL,
    "poolId" TEXT NOT NULL,
    "userWalletAddress" TEXT NOT NULL,
    "amountRaw" DECIMAL(38,0) NOT NULL,
    "rewardClaimedRaw" DECIMAL(38,0) NOT NULL DEFAULT 0,
    "depositTransactionId" TEXT NOT NULL,
    "stakedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "unlocksAt" TIMESTAMP(3) NOT NULL,
    "status" "StakingPositionStatus" NOT NULL DEFAULT 'ACTIVE',
    "claimNonce" TEXT,
    "claimNonceExpiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FarmingPosition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FarmingRewardDeposit" (
    "id" TEXT NOT NULL,
    "poolId" TEXT NOT NULL,
    "amountRaw" DECIMAL(38,0) NOT NULL,
    "transactionId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FarmingRewardDeposit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FarmingPool_creatorId_idx" ON "FarmingPool"("creatorId");

-- CreateIndex
CREATE INDEX "FarmingPool_lpMintAddress_idx" ON "FarmingPool"("lpMintAddress");

-- CreateIndex
CREATE UNIQUE INDEX "FarmingPosition_depositTransactionId_key" ON "FarmingPosition"("depositTransactionId");

-- CreateIndex
CREATE INDEX "FarmingPosition_poolId_idx" ON "FarmingPosition"("poolId");

-- CreateIndex
CREATE INDEX "FarmingPosition_userWalletAddress_idx" ON "FarmingPosition"("userWalletAddress");

-- CreateIndex
CREATE INDEX "FarmingPosition_status_idx" ON "FarmingPosition"("status");

-- CreateIndex
CREATE UNIQUE INDEX "FarmingRewardDeposit_transactionId_key" ON "FarmingRewardDeposit"("transactionId");

-- CreateIndex
CREATE INDEX "FarmingRewardDeposit_poolId_idx" ON "FarmingRewardDeposit"("poolId");

-- AddForeignKey
ALTER TABLE "FarmingPool" ADD CONSTRAINT "FarmingPool_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FarmingPool" ADD CONSTRAINT "FarmingPool_rewardTokenId_fkey" FOREIGN KEY ("rewardTokenId") REFERENCES "LaunchedToken"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FarmingPosition" ADD CONSTRAINT "FarmingPosition_poolId_fkey" FOREIGN KEY ("poolId") REFERENCES "FarmingPool"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FarmingRewardDeposit" ADD CONSTRAINT "FarmingRewardDeposit_poolId_fkey" FOREIGN KEY ("poolId") REFERENCES "FarmingPool"("id") ON DELETE CASCADE ON UPDATE CASCADE;
