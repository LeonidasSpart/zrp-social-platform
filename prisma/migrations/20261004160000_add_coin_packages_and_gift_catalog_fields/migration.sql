-- AlterTable
ALTER TABLE "CoinPurchase" ADD COLUMN     "coinPackageId" TEXT;

-- AlterTable
ALTER TABLE "GiftDefinition" ADD COLUMN     "availableFrom" TIMESTAMP(3),
ADD COLUMN     "availableTo" TIMESTAMP(3),
ADD COLUMN     "category" TEXT,
ADD COLUMN     "minTier" TEXT,
ADD COLUMN     "rarity" TEXT,
ADD COLUMN     "soundUrl" TEXT;

-- CreateTable
CREATE TABLE "CoinPackage" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "priceUsdc" DECIMAL(18,6) NOT NULL,
    "coinsCredited" INTEGER NOT NULL,
    "bonusCoins" INTEGER NOT NULL DEFAULT 0,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CoinPackage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CoinPackage_key_key" ON "CoinPackage"("key");

-- CreateIndex
CREATE INDEX "CoinPackage_enabled_sortOrder_idx" ON "CoinPackage"("enabled", "sortOrder");

-- CreateIndex
CREATE INDEX "CoinPurchase_coinPackageId_idx" ON "CoinPurchase"("coinPackageId");

-- AddForeignKey
ALTER TABLE "CoinPurchase" ADD CONSTRAINT "CoinPurchase_coinPackageId_fkey" FOREIGN KEY ("coinPackageId") REFERENCES "CoinPackage"("id") ON DELETE SET NULL ON UPDATE CASCADE;
