-- CreateTable
CREATE TABLE "DiscoverDismissal" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DiscoverDismissal_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DiscoverDismissal_userId_idx" ON "DiscoverDismissal"("userId");

-- CreateIndex
CREATE INDEX "DiscoverDismissal_postId_idx" ON "DiscoverDismissal"("postId");

-- CreateIndex
CREATE UNIQUE INDEX "DiscoverDismissal_userId_postId_key" ON "DiscoverDismissal"("userId", "postId");

-- AddForeignKey
ALTER TABLE "DiscoverDismissal" ADD CONSTRAINT "DiscoverDismissal_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiscoverDismissal" ADD CONSTRAINT "DiscoverDismissal_postId_fkey" FOREIGN KEY ("postId") REFERENCES "Post"("id") ON DELETE CASCADE ON UPDATE CASCADE;

