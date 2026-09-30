-- Community.createdById was the only required FK-to-User relation in the
-- whole schema left at the implicit ON DELETE RESTRICT default. That
-- blocked prisma.user.delete() for any user who ever created a community
-- (Postgres FK violation), which in turn made the self-service and cron
-- account-deletion paths fail forever for that account. Every other
-- ownership-style relation to User (Post.author, PlayChallenge.creator,
-- Conversation.createdBy, ...) already uses SET NULL so a deleted user's
-- content/ownership rows survive them - this migration brings Community
-- in line with that established pattern.
ALTER TABLE "Community" ALTER COLUMN "createdById" DROP NOT NULL;

ALTER TABLE "Community" DROP CONSTRAINT "Community_createdById_fkey";

ALTER TABLE "Community" ADD CONSTRAINT "Community_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
