-- ZRP Music: album track ordering + storage keys for cover artwork
-- (used by track/album delete to clean up UploadThing storage without
-- re-deriving the key from the URL). Purely additive/nullable.

-- AlterTable
ALTER TABLE "MusicAlbum" ADD COLUMN     "coverKey" TEXT;

-- AlterTable
ALTER TABLE "MusicTrack" ADD COLUMN     "coverKey" TEXT,
ADD COLUMN     "trackNumber" INTEGER;
