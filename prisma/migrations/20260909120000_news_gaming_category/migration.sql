-- ZRP News Network: add a GAMING category (PlayStation, Nintendo, Xbox
-- and general video-game coverage), requested to widen the network's
-- topic coverage beyond the existing desks.
--
-- Additive only: adds one new value to each of two existing enums. No
-- existing value is renamed or removed, no column type changes, and no
-- existing row is touched - every already-published NewsStory,
-- NewsRendition and NewsArticle keeps its current topic/category
-- untouched. IF NOT EXISTS makes this safe to re-run.

-- AlterEnum
ALTER TYPE "NewsTopic" ADD VALUE IF NOT EXISTS 'GAMING';

-- AlterEnum
ALTER TYPE "NewsArticleCategory" ADD VALUE IF NOT EXISTS 'GAMING';
