-- CreateEnum
CREATE TYPE "DaoVoteChoice" AS ENUM ('FOR', 'AGAINST', 'ABSTAIN');

-- CreateTable
CREATE TABLE "Dao" (
    "id" TEXT NOT NULL,
    "launchedTokenId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "quorumRaw" DECIMAL(38,0) NOT NULL,
    "proposalThresholdRaw" DECIMAL(38,0) NOT NULL,
    "votingPeriodSeconds" INTEGER NOT NULL DEFAULT 259200,
    "creatorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Dao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DaoProposal" (
    "id" TEXT NOT NULL,
    "daoId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "proposerWalletAddress" TEXT NOT NULL,
    "votingStartsAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "votingEndsAt" TIMESTAMP(3) NOT NULL,
    "forRaw" DECIMAL(38,0) NOT NULL DEFAULT 0,
    "againstRaw" DECIMAL(38,0) NOT NULL DEFAULT 0,
    "abstainRaw" DECIMAL(38,0) NOT NULL DEFAULT 0,
    "cancelledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DaoProposal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DaoVote" (
    "id" TEXT NOT NULL,
    "proposalId" TEXT NOT NULL,
    "voterWalletAddress" TEXT NOT NULL,
    "choice" "DaoVoteChoice" NOT NULL,
    "weightRaw" DECIMAL(38,0) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DaoVote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DaoVoteChallenge" (
    "id" TEXT NOT NULL,
    "proposalId" TEXT NOT NULL,
    "walletAddress" TEXT NOT NULL,
    "nonce" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DaoVoteChallenge_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Dao_launchedTokenId_key" ON "Dao"("launchedTokenId");

-- CreateIndex
CREATE INDEX "Dao_creatorId_idx" ON "Dao"("creatorId");

-- CreateIndex
CREATE INDEX "DaoProposal_daoId_idx" ON "DaoProposal"("daoId");

-- CreateIndex
CREATE INDEX "DaoProposal_votingEndsAt_idx" ON "DaoProposal"("votingEndsAt");

-- CreateIndex
CREATE INDEX "DaoVote_proposalId_idx" ON "DaoVote"("proposalId");

-- CreateIndex
CREATE UNIQUE INDEX "DaoVote_proposalId_voterWalletAddress_key" ON "DaoVote"("proposalId", "voterWalletAddress");

-- CreateIndex
CREATE INDEX "DaoVoteChallenge_proposalId_idx" ON "DaoVoteChallenge"("proposalId");

-- CreateIndex
CREATE UNIQUE INDEX "DaoVoteChallenge_proposalId_walletAddress_key" ON "DaoVoteChallenge"("proposalId", "walletAddress");

-- AddForeignKey
ALTER TABLE "Dao" ADD CONSTRAINT "Dao_launchedTokenId_fkey" FOREIGN KEY ("launchedTokenId") REFERENCES "LaunchedToken"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Dao" ADD CONSTRAINT "Dao_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DaoProposal" ADD CONSTRAINT "DaoProposal_daoId_fkey" FOREIGN KEY ("daoId") REFERENCES "Dao"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DaoVote" ADD CONSTRAINT "DaoVote_proposalId_fkey" FOREIGN KEY ("proposalId") REFERENCES "DaoProposal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DaoVoteChallenge" ADD CONSTRAINT "DaoVoteChallenge_proposalId_fkey" FOREIGN KEY ("proposalId") REFERENCES "DaoProposal"("id") ON DELETE CASCADE ON UPDATE CASCADE;
