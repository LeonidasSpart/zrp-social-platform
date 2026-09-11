-- ZRP PLAY: add REACTION (Speed/Reaction category) and SEQUENCE (Memory
-- category, Simon-says style) as new mini-game types, part of the
-- shared game-registry architecture in src/lib/play/registry.ts.
--
-- Additive only: adds two new values to the existing PlayChallengeType
-- enum. No existing value is renamed or removed, no column type
-- changes, and no existing PlayChallenge row is touched. IF NOT EXISTS
-- makes this safe to re-run.

-- AlterEnum
ALTER TYPE "PlayChallengeType" ADD VALUE IF NOT EXISTS 'REACTION';
ALTER TYPE "PlayChallengeType" ADD VALUE IF NOT EXISTS 'SEQUENCE';
