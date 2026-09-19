-- AlterTable
-- Additive-only: nullable storyId FK on Message so a story reply can be
-- delivered through the existing DM channel instead of a new one. No
-- existing column is renamed, retyped or dropped.
ALTER TABLE "Message"
  ADD COLUMN "storyId" TEXT;

-- CreateIndex
CREATE INDEX "Message_storyId_idx" ON "Message"("storyId");

-- AddForeignKey
-- SetNull, same as replyToId: a Story row is never hard-deleted by any
-- job in this codebase, but the reply message must survive regardless.
ALTER TABLE "Message"
  ADD CONSTRAINT "Message_storyId_fkey" FOREIGN KEY ("storyId") REFERENCES "Story"("id") ON DELETE SET NULL ON UPDATE CASCADE;
