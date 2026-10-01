-- CreateEnum
CREATE TYPE "AirdropRecipientStatus" AS ENUM ('SUCCESS', 'FAILED', 'DISPUTED');

-- CreateTable
CREATE TABLE "Airdrop" (
    "id" TEXT NOT NULL,
    "launchedTokenId" TEXT NOT NULL,
    "creatorId" TEXT,
    "senderWalletAddress" TEXT NOT NULL,
    "amountPerRecipientRaw" DECIMAL(38,0) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Airdrop_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AirdropRecipient" (
    "id" TEXT NOT NULL,
    "airdropId" TEXT NOT NULL,
    "walletAddress" TEXT NOT NULL,
    "status" "AirdropRecipientStatus" NOT NULL,
    "transactionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AirdropRecipient_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Airdrop_launchedTokenId_idx" ON "Airdrop"("launchedTokenId");

-- CreateIndex
CREATE INDEX "Airdrop_creatorId_idx" ON "Airdrop"("creatorId");

-- CreateIndex
CREATE INDEX "AirdropRecipient_airdropId_idx" ON "AirdropRecipient"("airdropId");

-- CreateIndex
CREATE INDEX "AirdropRecipient_walletAddress_idx" ON "AirdropRecipient"("walletAddress");

-- CreateIndex
CREATE UNIQUE INDEX "AirdropRecipient_transactionId_walletAddress_key" ON "AirdropRecipient"("transactionId", "walletAddress");

-- AddForeignKey
ALTER TABLE "Airdrop" ADD CONSTRAINT "Airdrop_launchedTokenId_fkey" FOREIGN KEY ("launchedTokenId") REFERENCES "LaunchedToken"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Airdrop" ADD CONSTRAINT "Airdrop_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AirdropRecipient" ADD CONSTRAINT "AirdropRecipient_airdropId_fkey" FOREIGN KEY ("airdropId") REFERENCES "Airdrop"("id") ON DELETE CASCADE ON UPDATE CASCADE;
