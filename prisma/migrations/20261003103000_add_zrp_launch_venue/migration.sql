-- AlterEnum
ALTER TYPE "TokenVenue" ADD VALUE 'ZRP_LAUNCH';

-- AlterTable
ALTER TABLE "LaunchedToken" ADD COLUMN     "bondingCurveAddress" TEXT;
