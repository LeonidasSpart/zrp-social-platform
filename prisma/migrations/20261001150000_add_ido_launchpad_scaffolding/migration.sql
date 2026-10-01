-- CreateEnum
CREATE TYPE "IdoWhitelistStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateTable
CREATE TABLE "IdoCampaign" (
    "id" TEXT NOT NULL,
    "launchedTokenId" TEXT NOT NULL,
    "creatorId" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "tokenPriceUsdc" DECIMAL(18,6) NOT NULL,
    "softCapUsdc" DECIMAL(18,6) NOT NULL,
    "hardCapUsdc" DECIMAL(18,6) NOT NULL,
    "requiresWhitelist" BOOLEAN NOT NULL DEFAULT true,
    "participationInstructions" TEXT NOT NULL,
    "saleStartsAt" TIMESTAMP(3) NOT NULL,
    "saleEndsAt" TIMESTAMP(3) NOT NULL,
    "cancelledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IdoCampaign_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IdoWhitelistApplication" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "applicantWalletAddress" TEXT NOT NULL,
    "contactEmail" TEXT,
    "status" "IdoWhitelistStatus" NOT NULL DEFAULT 'PENDING',
    "reviewNote" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IdoWhitelistApplication_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "IdoCampaign_creatorId_idx" ON "IdoCampaign"("creatorId");

-- CreateIndex
CREATE INDEX "IdoCampaign_launchedTokenId_idx" ON "IdoCampaign"("launchedTokenId");

-- CreateIndex
CREATE INDEX "IdoCampaign_saleEndsAt_idx" ON "IdoCampaign"("saleEndsAt");

-- CreateIndex
CREATE INDEX "IdoWhitelistApplication_campaignId_idx" ON "IdoWhitelistApplication"("campaignId");

-- CreateIndex
CREATE INDEX "IdoWhitelistApplication_status_idx" ON "IdoWhitelistApplication"("status");

-- CreateIndex
CREATE UNIQUE INDEX "IdoWhitelistApplication_campaignId_applicantWalletAddress_key" ON "IdoWhitelistApplication"("campaignId", "applicantWalletAddress");

-- AddForeignKey
ALTER TABLE "IdoCampaign" ADD CONSTRAINT "IdoCampaign_launchedTokenId_fkey" FOREIGN KEY ("launchedTokenId") REFERENCES "LaunchedToken"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IdoCampaign" ADD CONSTRAINT "IdoCampaign_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IdoWhitelistApplication" ADD CONSTRAINT "IdoWhitelistApplication_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "IdoCampaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;
