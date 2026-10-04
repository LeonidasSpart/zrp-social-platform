-- CreateTable
CREATE TABLE "UserGiftPolicy" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "canSendGifts" BOOLEAN NOT NULL DEFAULT true,
    "reason" TEXT,
    "updatedBy" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserGiftPolicy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CoinAdjustment" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "adminId" TEXT NOT NULL,
    "beforeBalance" INTEGER NOT NULL,
    "delta" INTEGER NOT NULL,
    "afterBalance" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CoinAdjustment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "UserGiftPolicy_userId_key" ON "UserGiftPolicy"("userId");

-- CreateIndex
CREATE INDEX "CoinAdjustment_userId_idx" ON "CoinAdjustment"("userId");

-- CreateIndex
CREATE INDEX "CoinAdjustment_adminId_idx" ON "CoinAdjustment"("adminId");

-- AddForeignKey
ALTER TABLE "UserGiftPolicy" ADD CONSTRAINT "UserGiftPolicy_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CoinAdjustment" ADD CONSTRAINT "CoinAdjustment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CoinAdjustment" ADD CONSTRAINT "CoinAdjustment_adminId_fkey" FOREIGN KEY ("adminId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
