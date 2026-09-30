-- ZRP Launchpad, phase 1: SPL token creation (see LaunchedToken's own
-- comment in schema.prisma for the server-signed-minting design).
CREATE TABLE "LaunchedToken" (
    "id" TEXT NOT NULL,
    "mintAddress" TEXT,
    "name" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "description" TEXT,
    "imageUrl" TEXT NOT NULL,
    "website" TEXT,
    "twitter" TEXT,
    "telegram" TEXT,
    "discord" TEXT,
    "supply" DECIMAL(38,0) NOT NULL,
    "decimals" INTEGER NOT NULL,
    "revokeMint" BOOLEAN NOT NULL DEFAULT false,
    "revokeFreeze" BOOLEAN NOT NULL DEFAULT false,
    "revokeUpdate" BOOLEAN NOT NULL DEFAULT false,
    "feeAmount" DECIMAL(18,6) NOT NULL,
    "feeTransactionId" TEXT NOT NULL,
    "mintTransactionId" TEXT,
    "status" "TransactionStatus" NOT NULL DEFAULT 'PENDING',
    "failureReason" TEXT,
    "creatorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LaunchedToken_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "LaunchedToken_mintAddress_key" ON "LaunchedToken"("mintAddress");

-- CreateIndex
CREATE UNIQUE INDEX "LaunchedToken_feeTransactionId_key" ON "LaunchedToken"("feeTransactionId");

-- CreateIndex
CREATE UNIQUE INDEX "LaunchedToken_mintTransactionId_key" ON "LaunchedToken"("mintTransactionId");

-- CreateIndex
CREATE INDEX "LaunchedToken_creatorId_idx" ON "LaunchedToken"("creatorId");

-- CreateIndex
CREATE INDEX "LaunchedToken_status_idx" ON "LaunchedToken"("status");

-- AddForeignKey
ALTER TABLE "LaunchedToken" ADD CONSTRAINT "LaunchedToken_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
