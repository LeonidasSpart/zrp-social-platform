-- AlterTable: Report's 9th polymorphic target (Live Video room)
ALTER TABLE "Report" ADD COLUMN "liveVideoRoomId" TEXT;

-- CreateIndex
CREATE INDEX "Report_liveVideoRoomId_idx" ON "Report"("liveVideoRoomId");

-- AddForeignKey
ALTER TABLE "Report" ADD CONSTRAINT "Report_liveVideoRoomId_fkey" FOREIGN KEY ("liveVideoRoomId") REFERENCES "LiveVideoRoom"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "GiftDefinition" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "priceCoins" INTEGER NOT NULL,
    "iconUrl" TEXT,
    "animationUrl" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GiftDefinition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CoinWallet" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "balance" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CoinWallet_pkey" PRIMARY KEY ("id"),
    -- Defense in depth alongside the application-layer conditional
    -- updateMany guard in gift-service.ts - see schema.prisma's comment
    -- on CoinWallet.balance for why both layers enforce this.
    CONSTRAINT "CoinWallet_balance_nonnegative" CHECK ("balance" >= 0)
);

-- CreateTable
CREATE TABLE "CoinPurchase" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "coinWalletId" TEXT NOT NULL,
    "usdcAmount" DECIMAL(18,6) NOT NULL,
    "coinsCredited" INTEGER NOT NULL,
    "transactionId" TEXT NOT NULL,
    "status" "TransactionStatus" NOT NULL DEFAULT 'COMPLETED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CoinPurchase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LiveGiftTransaction" (
    "id" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "senderId" TEXT NOT NULL,
    "recipientId" TEXT NOT NULL,
    "giftDefinitionId" TEXT NOT NULL,
    "unitPriceCoins" INTEGER NOT NULL,
    "quantity" INTEGER NOT NULL,
    "totalCoins" INTEGER NOT NULL,
    "creatorProfileId" TEXT NOT NULL,
    "platformFee" DECIMAL(18,6) NOT NULL DEFAULT 0,
    "charityAmount" DECIMAL(18,6) NOT NULL DEFAULT 0,
    "creatorAmount" DECIMAL(18,6) NOT NULL DEFAULT 0,
    "liveAudioRoomId" TEXT,
    "liveVideoRoomId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LiveGiftTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "GiftDefinition_key_key" ON "GiftDefinition"("key");

-- CreateIndex
CREATE INDEX "GiftDefinition_enabled_sortOrder_idx" ON "GiftDefinition"("enabled", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "CoinWallet_userId_key" ON "CoinWallet"("userId");

-- CreateIndex
CREATE INDEX "CoinPurchase_userId_idx" ON "CoinPurchase"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "CoinPurchase_transactionId_key" ON "CoinPurchase"("transactionId");

-- CreateIndex
CREATE UNIQUE INDEX "LiveGiftTransaction_idempotencyKey_key" ON "LiveGiftTransaction"("idempotencyKey");

-- CreateIndex
CREATE INDEX "LiveGiftTransaction_recipientId_idx" ON "LiveGiftTransaction"("recipientId");

-- CreateIndex
CREATE INDEX "LiveGiftTransaction_senderId_idx" ON "LiveGiftTransaction"("senderId");

-- CreateIndex
CREATE INDEX "LiveGiftTransaction_liveAudioRoomId_idx" ON "LiveGiftTransaction"("liveAudioRoomId");

-- CreateIndex
CREATE INDEX "LiveGiftTransaction_liveVideoRoomId_idx" ON "LiveGiftTransaction"("liveVideoRoomId");

-- CreateIndex
CREATE INDEX "LiveGiftTransaction_creatorProfileId_idx" ON "LiveGiftTransaction"("creatorProfileId");

-- AddForeignKey
ALTER TABLE "CoinWallet" ADD CONSTRAINT "CoinWallet_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CoinPurchase" ADD CONSTRAINT "CoinPurchase_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CoinPurchase" ADD CONSTRAINT "CoinPurchase_coinWalletId_fkey" FOREIGN KEY ("coinWalletId") REFERENCES "CoinWallet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LiveGiftTransaction" ADD CONSTRAINT "LiveGiftTransaction_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LiveGiftTransaction" ADD CONSTRAINT "LiveGiftTransaction_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LiveGiftTransaction" ADD CONSTRAINT "LiveGiftTransaction_giftDefinitionId_fkey" FOREIGN KEY ("giftDefinitionId") REFERENCES "GiftDefinition"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LiveGiftTransaction" ADD CONSTRAINT "LiveGiftTransaction_creatorProfileId_fkey" FOREIGN KEY ("creatorProfileId") REFERENCES "CreatorProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LiveGiftTransaction" ADD CONSTRAINT "LiveGiftTransaction_liveAudioRoomId_fkey" FOREIGN KEY ("liveAudioRoomId") REFERENCES "LiveAudioRoom"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LiveGiftTransaction" ADD CONSTRAINT "LiveGiftTransaction_liveVideoRoomId_fkey" FOREIGN KEY ("liveVideoRoomId") REFERENCES "LiveVideoRoom"("id") ON DELETE SET NULL ON UPDATE CASCADE;
