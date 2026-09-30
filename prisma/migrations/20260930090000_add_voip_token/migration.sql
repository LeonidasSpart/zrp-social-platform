-- CreateTable
CREATE TABLE "VoipToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "platform" TEXT NOT NULL DEFAULT 'ios',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VoipToken_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "VoipToken_token_key" ON "VoipToken"("token");

-- CreateIndex
CREATE INDEX "VoipToken_userId_idx" ON "VoipToken"("userId");

-- AddForeignKey
ALTER TABLE "VoipToken" ADD CONSTRAINT "VoipToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
