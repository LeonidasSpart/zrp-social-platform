-- CreateTable
CREATE TABLE "ConversationClearance" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "otherUserId" TEXT NOT NULL,
    "clearedBefore" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConversationClearance_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ConversationClearance_otherUserId_idx" ON "ConversationClearance"("otherUserId");

-- CreateIndex
CREATE UNIQUE INDEX "ConversationClearance_userId_otherUserId_key" ON "ConversationClearance"("userId", "otherUserId");

-- AddForeignKey
ALTER TABLE "ConversationClearance" ADD CONSTRAINT "ConversationClearance_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConversationClearance" ADD CONSTRAINT "ConversationClearance_otherUserId_fkey" FOREIGN KEY ("otherUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

