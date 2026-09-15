-- CreateEnum
CREATE TYPE "DiscoverEventType" AS ENUM ('IMPRESSION', 'START', 'PROGRESS_25', 'PROGRESS_50', 'PROGRESS_75', 'COMPLETE', 'SKIP');

-- CreateTable
CREATE TABLE "DiscoverEvent" (
    "id" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "userId" TEXT,
    "ip" TEXT,
    "eventType" "DiscoverEventType" NOT NULL,
    "watchedMs" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DiscoverEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DiscoverEvent_postId_eventType_idx" ON "DiscoverEvent"("postId", "eventType");

-- CreateIndex
CREATE INDEX "DiscoverEvent_postId_createdAt_idx" ON "DiscoverEvent"("postId", "createdAt");

-- CreateIndex
CREATE INDEX "DiscoverEvent_userId_postId_eventType_createdAt_idx" ON "DiscoverEvent"("userId", "postId", "eventType", "createdAt");

-- CreateIndex
CREATE INDEX "DiscoverEvent_ip_postId_eventType_createdAt_idx" ON "DiscoverEvent"("ip", "postId", "eventType", "createdAt");

-- AddForeignKey
ALTER TABLE "DiscoverEvent" ADD CONSTRAINT "DiscoverEvent_postId_fkey" FOREIGN KEY ("postId") REFERENCES "Post"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiscoverEvent" ADD CONSTRAINT "DiscoverEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
