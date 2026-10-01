-- CreateEnum
CREATE TYPE "ReferralCommissionSource" AS ENUM ('LAUNCHPAD_TOKEN_CREATION');

-- CreateTable
CREATE TABLE "Referral" (
    "id" TEXT NOT NULL,
    "ambassadorProfileId" TEXT NOT NULL,
    "referredUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Referral_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReferralCommission" (
    "id" TEXT NOT NULL,
    "referralId" TEXT NOT NULL,
    "sourceType" "ReferralCommissionSource" NOT NULL,
    "sourceId" TEXT NOT NULL,
    "feeAmount" DECIMAL(18,6) NOT NULL,
    "commissionAmount" DECIMAL(18,6) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReferralCommission_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Referral_referredUserId_key" ON "Referral"("referredUserId");

-- CreateIndex
CREATE INDEX "Referral_ambassadorProfileId_idx" ON "Referral"("ambassadorProfileId");

-- CreateIndex
CREATE INDEX "ReferralCommission_referralId_idx" ON "ReferralCommission"("referralId");

-- CreateIndex
CREATE UNIQUE INDEX "ReferralCommission_sourceType_sourceId_key" ON "ReferralCommission"("sourceType", "sourceId");

-- AddForeignKey
ALTER TABLE "Referral" ADD CONSTRAINT "Referral_ambassadorProfileId_fkey" FOREIGN KEY ("ambassadorProfileId") REFERENCES "AmbassadorProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Referral" ADD CONSTRAINT "Referral_referredUserId_fkey" FOREIGN KEY ("referredUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReferralCommission" ADD CONSTRAINT "ReferralCommission_referralId_fkey" FOREIGN KEY ("referralId") REFERENCES "Referral"("id") ON DELETE CASCADE ON UPDATE CASCADE;
