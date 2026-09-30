-- ZRP Launchpad, phase 3: fixed-APY staking pools (see StakingPool's
-- own comment in schema.prisma for the deposit/claim design).
CREATE TYPE "StakingPositionStatus" AS ENUM ('ACTIVE', 'UNSTAKED');

-- CreateTable
CREATE TABLE "StakingPool" (
    "id" TEXT NOT NULL,
    "launchedTokenId" TEXT NOT NULL,
    "creatorId" TEXT,
    "apyBasisPoints" INTEGER NOT NULL,
    "lockSeconds" INTEGER NOT NULL,
    "minStakeRaw" DECIMAL(38,0) NOT NULL,
    "maxStakeRaw" DECIMAL(38,0),
    "totalStakedRaw" DECIMAL(38,0) NOT NULL DEFAULT 0,
    "rewardReserveRaw" DECIMAL(38,0) NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StakingPool_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StakingPosition" (
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

    CONSTRAINT "StakingPosition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StakingRewardDeposit" (
    "id" TEXT NOT NULL,
    "poolId" TEXT NOT NULL,
    "amountRaw" DECIMAL(38,0) NOT NULL,
    "transactionId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StakingRewardDeposit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "StakingPool_launchedTokenId_idx" ON "StakingPool"("launchedTokenId");

-- CreateIndex
CREATE INDEX "StakingPool_creatorId_idx" ON "StakingPool"("creatorId");

-- CreateIndex
CREATE UNIQUE INDEX "StakingPosition_depositTransactionId_key" ON "StakingPosition"("depositTransactionId");

-- CreateIndex
CREATE INDEX "StakingPosition_poolId_idx" ON "StakingPosition"("poolId");

-- CreateIndex
CREATE INDEX "StakingPosition_userWalletAddress_idx" ON "StakingPosition"("userWalletAddress");

-- CreateIndex
CREATE INDEX "StakingPosition_status_idx" ON "StakingPosition"("status");

-- CreateIndex
CREATE UNIQUE INDEX "StakingRewardDeposit_transactionId_key" ON "StakingRewardDeposit"("transactionId");

-- CreateIndex
CREATE INDEX "StakingRewardDeposit_poolId_idx" ON "StakingRewardDeposit"("poolId");

-- AddForeignKey
ALTER TABLE "StakingPool" ADD CONSTRAINT "StakingPool_launchedTokenId_fkey" FOREIGN KEY ("launchedTokenId") REFERENCES "LaunchedToken"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StakingPool" ADD CONSTRAINT "StakingPool_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StakingPosition" ADD CONSTRAINT "StakingPosition_poolId_fkey" FOREIGN KEY ("poolId") REFERENCES "StakingPool"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StakingRewardDeposit" ADD CONSTRAINT "StakingRewardDeposit_poolId_fkey" FOREIGN KEY ("poolId") REFERENCES "StakingPool"("id") ON DELETE CASCADE ON UPDATE CASCADE;
