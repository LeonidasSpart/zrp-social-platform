-- CreateTable
CREATE TABLE "PostSubscription" (
    "id" TEXT NOT NULL,
    "subscriberId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PostSubscription_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PostSubscription_subscriberId_idx" ON "PostSubscription"("subscriberId");

-- CreateIndex
CREATE INDEX "PostSubscription_authorId_idx" ON "PostSubscription"("authorId");

-- CreateIndex
CREATE UNIQUE INDEX "PostSubscription_subscriberId_authorId_key" ON "PostSubscription"("subscriberId", "authorId");

-- AddForeignKey
ALTER TABLE "PostSubscription" ADD CONSTRAINT "PostSubscription_subscriberId_fkey" FOREIGN KEY ("subscriberId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PostSubscription" ADD CONSTRAINT "PostSubscription_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- A post has exactly one author, so unlike "comment" (many distinct
-- commenters can each notify the same post author) a given postId can
-- only ever produce ONE post_from_subscription notification per
-- recipient - making (userId, postId) a safe, always-correct dedup key
-- for this type specifically. A partial index (not a schema.prisma
-- @@unique, which can't express a WHERE clause) so it only constrains
-- this one notification type and never collides with a "like"/"comment"/
-- etc. notification that legitimately shares the same userId+postId.
-- src/lib/post-subscriptions.ts's bulk insert relies on this via
-- Prisma's skipDuplicates (-> ON CONFLICT DO NOTHING) so a duplicate
-- fan-out call for the same post is a structural no-op, not just a
-- call-site discipline the code has to get right every time.
CREATE UNIQUE INDEX "Notification_post_subscription_userId_postId_key" ON "Notification"("userId", "postId") WHERE "type" = 'post_from_subscription' AND "postId" IS NOT NULL;
