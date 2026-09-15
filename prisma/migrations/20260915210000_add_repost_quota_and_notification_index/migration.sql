-- CreateTable
CREATE TABLE "RepostDailyUsage" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reposts" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "RepostDailyUsage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RepostDailyUsage_userId_idx" ON "RepostDailyUsage"("userId");

-- CreateIndex
CREATE INDEX "RepostDailyUsage_date_idx" ON "RepostDailyUsage"("date");

-- CreateIndex
CREATE UNIQUE INDEX "RepostDailyUsage_userId_date_key" ON "RepostDailyUsage"("userId", "date");

-- CreateIndex
CREATE INDEX "Notification_userId_createdAt_idx" ON "Notification"("userId", "createdAt");

-- AddForeignKey
ALTER TABLE "RepostDailyUsage" ADD CONSTRAINT "RepostDailyUsage_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
