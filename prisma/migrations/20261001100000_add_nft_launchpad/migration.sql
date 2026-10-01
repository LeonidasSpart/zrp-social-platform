-- CreateEnum
CREATE TYPE "NftStakingPositionStatus" AS ENUM ('ACTIVE', 'UNSTAKED');

-- CreateTable
CREATE TABLE "LaunchedNft" (
    "id" TEXT NOT NULL,
    "mintAddress" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "imageUrl" TEXT NOT NULL,
    "collectionName" TEXT,
    "attributes" JSONB,
    "sellerFeeBasisPoints" INTEGER NOT NULL DEFAULT 0,
    "revokeUpdate" BOOLEAN NOT NULL DEFAULT false,
    "feeAmount" DECIMAL(18,6) NOT NULL,
    "feeTransactionId" TEXT NOT NULL,
    "mintTransactionId" TEXT,
    "status" "TransactionStatus" NOT NULL DEFAULT 'PENDING',
    "failureReason" TEXT,
    "creatorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LaunchedNft_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NftStakingPool" (
    "id" TEXT NOT NULL,
    "collectionName" TEXT NOT NULL,
    "creatorId" TEXT NOT NULL,
    "rewardTokenId" TEXT NOT NULL,
    "rewardRatePerDayRaw" DECIMAL(38,0) NOT NULL,
    "lockSeconds" INTEGER NOT NULL,
    "rewardReserveRaw" DECIMAL(38,0) NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NftStakingPool_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NftStakingPosition" (
    "id" TEXT NOT NULL,
    "poolId" TEXT NOT NULL,
    "nftId" TEXT NOT NULL,
    "userWalletAddress" TEXT NOT NULL,
    "rewardClaimedRaw" DECIMAL(38,0) NOT NULL DEFAULT 0,
    "depositTransactionId" TEXT NOT NULL,
    "stakedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "unlocksAt" TIMESTAMP(3) NOT NULL,
    "status" "NftStakingPositionStatus" NOT NULL DEFAULT 'ACTIVE',
    "claimNonce" TEXT,
    "claimNonceExpiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NftStakingPosition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NftStakingRewardDeposit" (
    "id" TEXT NOT NULL,
    "poolId" TEXT NOT NULL,
    "amountRaw" DECIMAL(38,0) NOT NULL,
    "transactionId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NftStakingRewardDeposit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "LaunchedNft_mintAddress_key" ON "LaunchedNft"("mintAddress");

-- CreateIndex
CREATE UNIQUE INDEX "LaunchedNft_feeTransactionId_key" ON "LaunchedNft"("feeTransactionId");

-- CreateIndex
CREATE UNIQUE INDEX "LaunchedNft_mintTransactionId_key" ON "LaunchedNft"("mintTransactionId");

-- CreateIndex
CREATE INDEX "LaunchedNft_creatorId_idx" ON "LaunchedNft"("creatorId");

-- CreateIndex
CREATE INDEX "LaunchedNft_status_idx" ON "LaunchedNft"("status");

-- CreateIndex
CREATE INDEX "LaunchedNft_collectionName_idx" ON "LaunchedNft"("collectionName");

-- CreateIndex
CREATE INDEX "NftStakingPool_creatorId_idx" ON "NftStakingPool"("creatorId");

-- CreateIndex
CREATE INDEX "NftStakingPool_collectionName_idx" ON "NftStakingPool"("collectionName");

-- CreateIndex
CREATE UNIQUE INDEX "NftStakingPosition_depositTransactionId_key" ON "NftStakingPosition"("depositTransactionId");

-- CreateIndex
CREATE INDEX "NftStakingPosition_poolId_idx" ON "NftStakingPosition"("poolId");

-- CreateIndex
CREATE INDEX "NftStakingPosition_userWalletAddress_idx" ON "NftStakingPosition"("userWalletAddress");

-- CreateIndex
CREATE INDEX "NftStakingPosition_nftId_idx" ON "NftStakingPosition"("nftId");

-- CreateIndex
CREATE INDEX "NftStakingPosition_status_idx" ON "NftStakingPosition"("status");

-- CreateIndex
CREATE UNIQUE INDEX "NftStakingRewardDeposit_transactionId_key" ON "NftStakingRewardDeposit"("transactionId");

-- CreateIndex
CREATE INDEX "NftStakingRewardDeposit_poolId_idx" ON "NftStakingRewardDeposit"("poolId");

-- AddForeignKey
ALTER TABLE "LaunchedNft" ADD CONSTRAINT "LaunchedNft_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NftStakingPool" ADD CONSTRAINT "NftStakingPool_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NftStakingPool" ADD CONSTRAINT "NftStakingPool_rewardTokenId_fkey" FOREIGN KEY ("rewardTokenId") REFERENCES "LaunchedToken"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NftStakingPosition" ADD CONSTRAINT "NftStakingPosition_poolId_fkey" FOREIGN KEY ("poolId") REFERENCES "NftStakingPool"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NftStakingPosition" ADD CONSTRAINT "NftStakingPosition_nftId_fkey" FOREIGN KEY ("nftId") REFERENCES "LaunchedNft"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NftStakingRewardDeposit" ADD CONSTRAINT "NftStakingRewardDeposit_poolId_fkey" FOREIGN KEY ("poolId") REFERENCES "NftStakingPool"("id") ON DELETE CASCADE ON UPDATE CASCADE;
