-- ZRP Launchpad, phase 2: token vesting (see VestingContract's own
-- comment in schema.prisma for the deposit/claim design).
CREATE TYPE "VestingContractStatus" AS ENUM ('ACTIVE', 'COMPLETED');

-- CreateTable
CREATE TABLE "VestingContract" (
    "id" TEXT NOT NULL,
    "launchedTokenId" TEXT NOT NULL,
    "creatorId" TEXT,
    "beneficiaryWalletAddress" TEXT NOT NULL,
    "totalAmount" DECIMAL(38,0) NOT NULL,
    "totalReleased" DECIMAL(38,0) NOT NULL DEFAULT 0,
    "cliffSeconds" INTEGER NOT NULL,
    "vestingSeconds" INTEGER NOT NULL,
    "startAt" TIMESTAMP(3) NOT NULL,
    "depositTransactionId" TEXT NOT NULL,
    "status" "VestingContractStatus" NOT NULL DEFAULT 'ACTIVE',
    "claimNonce" TEXT,
    "claimNonceExpiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VestingContract_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VestingRelease" (
    "id" TEXT NOT NULL,
    "vestingContractId" TEXT NOT NULL,
    "amount" DECIMAL(38,0) NOT NULL,
    "transactionId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VestingRelease_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "VestingContract_depositTransactionId_key" ON "VestingContract"("depositTransactionId");

-- CreateIndex
CREATE INDEX "VestingContract_launchedTokenId_idx" ON "VestingContract"("launchedTokenId");

-- CreateIndex
CREATE INDEX "VestingContract_beneficiaryWalletAddress_idx" ON "VestingContract"("beneficiaryWalletAddress");

-- CreateIndex
CREATE INDEX "VestingContract_status_idx" ON "VestingContract"("status");

-- CreateIndex
CREATE UNIQUE INDEX "VestingRelease_transactionId_key" ON "VestingRelease"("transactionId");

-- CreateIndex
CREATE INDEX "VestingRelease_vestingContractId_idx" ON "VestingRelease"("vestingContractId");

-- AddForeignKey
ALTER TABLE "VestingContract" ADD CONSTRAINT "VestingContract_launchedTokenId_fkey" FOREIGN KEY ("launchedTokenId") REFERENCES "LaunchedToken"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VestingContract" ADD CONSTRAINT "VestingContract_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VestingRelease" ADD CONSTRAINT "VestingRelease_vestingContractId_fkey" FOREIGN KEY ("vestingContractId") REFERENCES "VestingContract"("id") ON DELETE CASCADE ON UPDATE CASCADE;
