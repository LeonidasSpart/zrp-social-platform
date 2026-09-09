-- ZRP News Network: automated editorial system.
--
-- Additive only: no existing column is altered or dropped, and the
-- existing NewsArticle (human journalist) workflow is untouched.

-- CreateEnum
CREATE TYPE "NewsRegion" AS ENUM ('GLOBAL', 'NORTH_AMERICA', 'SOUTH_AMERICA', 'EUROPE', 'AFRICA', 'ASIA', 'MIDDLE_EAST', 'OCEANIA');

-- CreateEnum
CREATE TYPE "NewsTopic" AS ENUM ('WORLD', 'POLITICS', 'BUSINESS', 'ECONOMY', 'TECHNOLOGY', 'AI', 'SCIENCE', 'HEALTH', 'CRYPTO', 'FINANCE', 'SPORTS', 'ENTERTAINMENT', 'CULTURE', 'ENVIRONMENT', 'CLIMATE', 'SECURITY', 'EDUCATION', 'TRAVEL', 'TOURISM', 'TRANSPORTATION', 'AVIATION', 'AUTOMOTIVE', 'LIFESTYLE', 'LOCAL', 'BREAKING');

-- CreateEnum
CREATE TYPE "NewsSourceStatus" AS ENUM ('HEALTHY', 'WARNING', 'FAILED', 'DISABLED');

-- CreateEnum
CREATE TYPE "NewsStoryStatus" AS ENUM ('NEW', 'READY', 'PUBLISHED', 'REJECTED', 'SUPERSEDED');

-- CreateEnum
CREATE TYPE "NewsConfidence" AS ENUM ('CONFIRMED', 'DEVELOPING', 'UNCONFIRMED');

-- CreateEnum
CREATE TYPE "NewsRenditionStatus" AS ENUM ('PENDING', 'READY', 'FAILED', 'REJECTED');

-- CreateEnum
CREATE TYPE "NewsPublicationStatus" AS ENUM ('SCHEDULED', 'PUBLISHED', 'FAILED', 'REMOVED');

-- CreateEnum
CREATE TYPE "NewsJobStatus" AS ENUM ('RUNNING', 'SUCCEEDED', 'FAILED', 'SKIPPED');

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "isEditorialFeed" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "NewsFeed" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "description" TEXT,
    "userId" TEXT NOT NULL,
    "region" "NewsRegion" NOT NULL DEFAULT 'GLOBAL',
    "country" TEXT,
    "language" TEXT NOT NULL DEFAULT 'en',
    "timezone" TEXT NOT NULL DEFAULT 'UTC',
    "topics" "NewsTopic"[] DEFAULT ARRAY[]::"NewsTopic"[],
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "isPilot" BOOLEAN NOT NULL DEFAULT false,
    "minMinutesBetweenPosts" INTEGER NOT NULL DEFAULT 180,
    "maxPostsPerDay" INTEGER NOT NULL DEFAULT 6,
    "lastPublishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NewsFeed_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NewsSource" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "publisher" TEXT NOT NULL,
    "feedUrl" TEXT NOT NULL,
    "homepageUrl" TEXT,
    "region" "NewsRegion" NOT NULL DEFAULT 'GLOBAL',
    "country" TEXT,
    "language" TEXT NOT NULL DEFAULT 'en',
    "topics" "NewsTopic"[] DEFAULT ARRAY[]::"NewsTopic"[],
    "trustTier" INTEGER NOT NULL DEFAULT 2,
    "official" BOOLEAN NOT NULL DEFAULT false,
    "allowImages" BOOLEAN NOT NULL DEFAULT false,
    "attribution" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "status" "NewsSourceStatus" NOT NULL DEFAULT 'HEALTHY',
    "fetchIntervalMinutes" INTEGER NOT NULL DEFAULT 60,
    "lastFetchedAt" TIMESTAMP(3),
    "lastSuccessAt" TIMESTAMP(3),
    "lastErrorAt" TIMESTAMP(3),
    "lastError" TEXT,
    "consecutiveFailures" INTEGER NOT NULL DEFAULT 0,
    "backoffUntil" TIMESTAMP(3),
    "etag" TEXT,
    "lastModified" TEXT,
    "itemsIngested" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NewsSource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NewsStory" (
    "id" TEXT NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "normalizedTitle" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "sourceMaterial" TEXT NOT NULL,
    "topic" "NewsTopic" NOT NULL DEFAULT 'WORLD',
    "region" "NewsRegion" NOT NULL DEFAULT 'GLOBAL',
    "country" TEXT,
    "language" TEXT NOT NULL DEFAULT 'en',
    "confidence" "NewsConfidence" NOT NULL DEFAULT 'DEVELOPING',
    "sensitive" BOOLEAN NOT NULL DEFAULT false,
    "isBreaking" BOOLEAN NOT NULL DEFAULT false,
    "isTravel" BOOLEAN NOT NULL DEFAULT false,
    "importance" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "sourceCount" INTEGER NOT NULL DEFAULT 1,
    "imageUrl" TEXT,
    "imageCredit" TEXT,
    "status" "NewsStoryStatus" NOT NULL DEFAULT 'NEW',
    "rejectionReason" TEXT,
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "publishedAt" TIMESTAMP(3),
    "correctionNote" TEXT,
    "correctedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NewsStory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NewsStorySource" (
    "id" TEXT NOT NULL,
    "storyId" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "excerpt" TEXT,
    "imageUrl" TEXT,
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NewsStorySource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NewsRendition" (
    "id" TEXT NOT NULL,
    "storyId" TEXT NOT NULL,
    "language" TEXT NOT NULL,
    "headline" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "status" "NewsRenditionStatus" NOT NULL DEFAULT 'PENDING',
    "model" TEXT,
    "error" TEXT,
    "validation" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NewsRendition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NewsPublication" (
    "id" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "storyId" TEXT NOT NULL,
    "renditionId" TEXT NOT NULL,
    "feedId" TEXT NOT NULL,
    "language" TEXT NOT NULL,
    "postId" TEXT,
    "status" "NewsPublicationStatus" NOT NULL DEFAULT 'SCHEDULED',
    "scheduledFor" TIMESTAMP(3) NOT NULL,
    "publishedAt" TIMESTAMP(3),
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "removedAt" TIMESTAMP(3),
    "removedReason" TEXT,
    "correctionNote" TEXT,
    "correctedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NewsPublication_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NewsJobRun" (
    "id" TEXT NOT NULL,
    "trigger" TEXT NOT NULL DEFAULT 'cron',
    "status" "NewsJobStatus" NOT NULL DEFAULT 'RUNNING',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "sourcesFetched" INTEGER NOT NULL DEFAULT 0,
    "sourcesFailed" INTEGER NOT NULL DEFAULT 0,
    "itemsIngested" INTEGER NOT NULL DEFAULT 0,
    "storiesCreated" INTEGER NOT NULL DEFAULT 0,
    "duplicatesPrevented" INTEGER NOT NULL DEFAULT 0,
    "renditionsGenerated" INTEGER NOT NULL DEFAULT 0,
    "renditionsFailed" INTEGER NOT NULL DEFAULT 0,
    "published" INTEGER NOT NULL DEFAULT 0,
    "publishFailures" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "details" JSONB,

    CONSTRAINT "NewsJobRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NewsAutomationSetting" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "paused" BOOLEAN NOT NULL DEFAULT true,
    "enabledLanguages" TEXT[] DEFAULT ARRAY['en', 'fr', 'de', 'it']::TEXT[],
    "enabledTopics" "NewsTopic"[] DEFAULT ARRAY[]::"NewsTopic"[],
    "enabledRegions" "NewsRegion"[] DEFAULT ARRAY[]::"NewsRegion"[],
    "enabledCountries" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "maxPublicationsPerCycle" INTEGER NOT NULL DEFAULT 12,
    "maxPublicationsPerDay" INTEGER NOT NULL DEFAULT 120,
    "minMinutesBetweenPublications" INTEGER NOT NULL DEFAULT 4,
    "requireHumanReviewForSensitive" BOOLEAN NOT NULL DEFAULT true,
    "lastCycleAt" TIMESTAMP(3),
    "nextCycleAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NewsAutomationSetting_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "NewsFeed_key_key" ON "NewsFeed"("key");

-- CreateIndex
CREATE UNIQUE INDEX "NewsFeed_userId_key" ON "NewsFeed"("userId");

-- CreateIndex
CREATE INDEX "NewsFeed_enabled_idx" ON "NewsFeed"("enabled");

-- CreateIndex
CREATE INDEX "NewsFeed_region_idx" ON "NewsFeed"("region");

-- CreateIndex
CREATE INDEX "NewsFeed_country_idx" ON "NewsFeed"("country");

-- CreateIndex
CREATE INDEX "NewsFeed_language_idx" ON "NewsFeed"("language");

-- CreateIndex
CREATE UNIQUE INDEX "NewsSource_key_key" ON "NewsSource"("key");

-- CreateIndex
CREATE UNIQUE INDEX "NewsSource_feedUrl_key" ON "NewsSource"("feedUrl");

-- CreateIndex
CREATE INDEX "NewsSource_enabled_backoffUntil_idx" ON "NewsSource"("enabled", "backoffUntil");

-- CreateIndex
CREATE INDEX "NewsSource_status_idx" ON "NewsSource"("status");

-- CreateIndex
CREATE INDEX "NewsSource_region_idx" ON "NewsSource"("region");

-- CreateIndex
CREATE INDEX "NewsSource_country_idx" ON "NewsSource"("country");

-- CreateIndex
CREATE UNIQUE INDEX "NewsStory_fingerprint_key" ON "NewsStory"("fingerprint");

-- CreateIndex
CREATE INDEX "NewsStory_status_idx" ON "NewsStory"("status");

-- CreateIndex
CREATE INDEX "NewsStory_topic_idx" ON "NewsStory"("topic");

-- CreateIndex
CREATE INDEX "NewsStory_region_idx" ON "NewsStory"("region");

-- CreateIndex
CREATE INDEX "NewsStory_country_idx" ON "NewsStory"("country");

-- CreateIndex
CREATE INDEX "NewsStory_isTravel_idx" ON "NewsStory"("isTravel");

-- CreateIndex
CREATE INDEX "NewsStory_status_importance_idx" ON "NewsStory"("status", "importance");

-- CreateIndex
CREATE INDEX "NewsStory_firstSeenAt_idx" ON "NewsStory"("firstSeenAt");

-- CreateIndex
CREATE INDEX "NewsStory_normalizedTitle_idx" ON "NewsStory"("normalizedTitle");

-- CreateIndex
CREATE UNIQUE INDEX "NewsStorySource_url_key" ON "NewsStorySource"("url");

-- CreateIndex
CREATE INDEX "NewsStorySource_storyId_idx" ON "NewsStorySource"("storyId");

-- CreateIndex
CREATE INDEX "NewsStorySource_sourceId_idx" ON "NewsStorySource"("sourceId");

-- CreateIndex
CREATE INDEX "NewsStorySource_publishedAt_idx" ON "NewsStorySource"("publishedAt");

-- CreateIndex
CREATE INDEX "NewsRendition_status_idx" ON "NewsRendition"("status");

-- CreateIndex
CREATE INDEX "NewsRendition_language_idx" ON "NewsRendition"("language");

-- CreateIndex
CREATE UNIQUE INDEX "NewsRendition_storyId_language_key" ON "NewsRendition"("storyId", "language");

-- CreateIndex
CREATE UNIQUE INDEX "NewsPublication_idempotencyKey_key" ON "NewsPublication"("idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "NewsPublication_postId_key" ON "NewsPublication"("postId");

-- CreateIndex
CREATE INDEX "NewsPublication_status_scheduledFor_idx" ON "NewsPublication"("status", "scheduledFor");

-- CreateIndex
CREATE INDEX "NewsPublication_feedId_publishedAt_idx" ON "NewsPublication"("feedId", "publishedAt");

-- CreateIndex
CREATE INDEX "NewsPublication_storyId_idx" ON "NewsPublication"("storyId");

-- CreateIndex
CREATE INDEX "NewsPublication_language_idx" ON "NewsPublication"("language");

-- CreateIndex
CREATE INDEX "NewsPublication_publishedAt_idx" ON "NewsPublication"("publishedAt");

-- CreateIndex
CREATE INDEX "NewsJobRun_status_idx" ON "NewsJobRun"("status");

-- CreateIndex
CREATE INDEX "NewsJobRun_startedAt_idx" ON "NewsJobRun"("startedAt");

-- AddForeignKey
ALTER TABLE "NewsFeed" ADD CONSTRAINT "NewsFeed_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NewsStorySource" ADD CONSTRAINT "NewsStorySource_storyId_fkey" FOREIGN KEY ("storyId") REFERENCES "NewsStory"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NewsStorySource" ADD CONSTRAINT "NewsStorySource_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "NewsSource"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NewsRendition" ADD CONSTRAINT "NewsRendition_storyId_fkey" FOREIGN KEY ("storyId") REFERENCES "NewsStory"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NewsPublication" ADD CONSTRAINT "NewsPublication_storyId_fkey" FOREIGN KEY ("storyId") REFERENCES "NewsStory"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NewsPublication" ADD CONSTRAINT "NewsPublication_renditionId_fkey" FOREIGN KEY ("renditionId") REFERENCES "NewsRendition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NewsPublication" ADD CONSTRAINT "NewsPublication_feedId_fkey" FOREIGN KEY ("feedId") REFERENCES "NewsFeed"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NewsPublication" ADD CONSTRAINT "NewsPublication_postId_fkey" FOREIGN KEY ("postId") REFERENCES "Post"("id") ON DELETE SET NULL ON UPDATE CASCADE;
