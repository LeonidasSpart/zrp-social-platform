-- Additive only: both columns are nullable, so every existing row is
-- valid with no backfill. See prisma/schema.prisma's own comment on
-- User.birthdate/termsAcceptedAt for why they are null-by-default and
-- who is expected to start setting them.
ALTER TABLE "User" ADD COLUMN "birthdate" DATE;
ALTER TABLE "User" ADD COLUMN "termsAcceptedAt" TIMESTAMP(3);
