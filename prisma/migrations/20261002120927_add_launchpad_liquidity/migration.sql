-- CreateEnum
CREATE TYPE "TokenPoolDex" AS ENUM ('RAYDIUM_CPMM');

-- CreateEnum
CREATE TYPE "TokenPoolStatus" AS ENUM ('PENDING', 'ACTIVE', 'FAILED');

-- CreateEnum
CREATE TYPE "LiquidityEventType" AS ENUM ('ADD', 'REMOVE', 'BURN');

-- CreateEnum
CREATE TYPE "LiquidityEventStatus" AS ENUM ('SUCCESS', 'FAILED', 'DISPUTED');

-- CreateEnum
CREATE TYPE "TradeSide" AS ENUM ('BUY', 'SELL');

-- CreateTable
CREATE TABLE "TokenPool" (
    "id" TEXT NOT NULL,
    "launchedTokenId" TEXT,
    "dex" "TokenPoolDex" NOT NULL,
    "poolAddress" TEXT NOT NULL,
    "baseMint" TEXT NOT NULL,
    "quoteMint" TEXT NOT NULL,
    "lpMint" TEXT NOT NULL,
    "baseVault" TEXT NOT NULL,
    "quoteVault" TEXT NOT NULL,
    "creatorId" TEXT,
    "creatorWalletAddress" TEXT NOT NULL,
    "createTransactionId" TEXT NOT NULL,
    "status" "TokenPoolStatus" NOT NULL DEFAULT 'PENDING',
    "failureReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TokenPool_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LiquidityEvent" (
    "id" TEXT NOT NULL,
    "poolId" TEXT NOT NULL,
    "type" "LiquidityEventType" NOT NULL,
    "status" "LiquidityEventStatus" NOT NULL,
    "walletAddress" TEXT NOT NULL,
    "transactionId" TEXT,
    "lpAmountRaw" DECIMAL(38,0),
    "baseAmountRaw" DECIMAL(38,0),
    "quoteAmountRaw" DECIMAL(38,0),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LiquidityEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TokenTrade" (
    "id" TEXT NOT NULL,
    "poolId" TEXT NOT NULL,
    "mintAddress" TEXT NOT NULL,
    "txSignature" TEXT NOT NULL,
    "side" "TradeSide" NOT NULL,
    "baseAmountRaw" DECIMAL(38,0) NOT NULL,
    "quoteAmountRaw" DECIMAL(38,0) NOT NULL,
    "walletAddress" TEXT NOT NULL,
    "blockTime" TIMESTAMP(3) NOT NULL,
    "slot" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TokenTrade_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TokenVolumeSyncState" (
    "id" TEXT NOT NULL,
    "poolAddress" TEXT NOT NULL,
    "lastSignature" TEXT,
    "lastSyncedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TokenVolumeSyncState_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TokenPool_poolAddress_key" ON "TokenPool"("poolAddress");

-- CreateIndex
CREATE UNIQUE INDEX "TokenPool_createTransactionId_key" ON "TokenPool"("createTransactionId");

-- CreateIndex
CREATE INDEX "TokenPool_launchedTokenId_idx" ON "TokenPool"("launchedTokenId");

-- CreateIndex
CREATE INDEX "TokenPool_baseMint_idx" ON "TokenPool"("baseMint");

-- CreateIndex
CREATE INDEX "TokenPool_creatorId_idx" ON "TokenPool"("creatorId");

-- CreateIndex
CREATE UNIQUE INDEX "LiquidityEvent_transactionId_key" ON "LiquidityEvent"("transactionId");

-- CreateIndex
CREATE INDEX "LiquidityEvent_poolId_idx" ON "LiquidityEvent"("poolId");

-- CreateIndex
CREATE INDEX "LiquidityEvent_walletAddress_idx" ON "LiquidityEvent"("walletAddress");

-- CreateIndex
CREATE UNIQUE INDEX "TokenTrade_txSignature_key" ON "TokenTrade"("txSignature");

-- CreateIndex
CREATE INDEX "TokenTrade_poolId_blockTime_idx" ON "TokenTrade"("poolId", "blockTime");

-- CreateIndex
CREATE INDEX "TokenTrade_mintAddress_blockTime_idx" ON "TokenTrade"("mintAddress", "blockTime");

-- CreateIndex
CREATE UNIQUE INDEX "TokenVolumeSyncState_poolAddress_key" ON "TokenVolumeSyncState"("poolAddress");

-- AddForeignKey
ALTER TABLE "TokenPool" ADD CONSTRAINT "TokenPool_launchedTokenId_fkey" FOREIGN KEY ("launchedTokenId") REFERENCES "LaunchedToken"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TokenPool" ADD CONSTRAINT "TokenPool_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LiquidityEvent" ADD CONSTRAINT "LiquidityEvent_poolId_fkey" FOREIGN KEY ("poolId") REFERENCES "TokenPool"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TokenTrade" ADD CONSTRAINT "TokenTrade_poolId_fkey" FOREIGN KEY ("poolId") REFERENCES "TokenPool"("id") ON DELETE CASCADE ON UPDATE CASCADE;
