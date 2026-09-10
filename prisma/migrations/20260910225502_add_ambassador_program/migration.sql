-- CreateEnum
CREATE TYPE "AmbassadorStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "AmbassadorLevel" AS ENUM ('EXPLORER', 'AMBASSADOR', 'COMMUNITY_LEADER', 'GLOBAL_AMBASSADOR');

-- CreateTable
CREATE TABLE "AmbassadorProfile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" "AmbassadorStatus" NOT NULL DEFAULT 'PENDING',
    "level" "AmbassadorLevel" NOT NULL DEFAULT 'EXPLORER',
    "countryCode" TEXT NOT NULL,
    "cityRegion" TEXT,
    "languages" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "communityLinks" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "motivation" TEXT NOT NULL,
    "communityDescription" TEXT,
    "audienceSize" INTEGER,
    "invitationCode" TEXT NOT NULL,
    "appliedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedAt" TIMESTAMP(3),
    "reviewedById" TEXT,
    "rejectionReason" TEXT,
    "suspensionReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AmbassadorProfile_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AmbassadorProfile_userId_key" ON "AmbassadorProfile"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "AmbassadorProfile_invitationCode_key" ON "AmbassadorProfile"("invitationCode");

-- CreateIndex
CREATE INDEX "AmbassadorProfile_status_idx" ON "AmbassadorProfile"("status");

-- CreateIndex
CREATE INDEX "AmbassadorProfile_countryCode_idx" ON "AmbassadorProfile"("countryCode");

-- CreateIndex
CREATE INDEX "AmbassadorProfile_reviewedById_idx" ON "AmbassadorProfile"("reviewedById");

-- AddForeignKey
ALTER TABLE "AmbassadorProfile" ADD CONSTRAINT "AmbassadorProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AmbassadorProfile" ADD CONSTRAINT "AmbassadorProfile_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

