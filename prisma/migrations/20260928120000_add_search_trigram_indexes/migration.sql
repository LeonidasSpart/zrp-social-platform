-- Advanced Search: trigram + array indexes.
--
-- Prisma's schema DSL cannot express a Postgres extension or a GIN index
-- with a non-default operator class (gin_trgm_ops) without enabling the
-- `postgresqlExtensions`/`extendedIndexes` preview features - this repo
-- deliberately runs with no previewFeatures declared (see the datasource
-- block's own comment in schema.prisma on why Prisma-version upgrades
-- here are kept conservative). So these indexes are hand-authored SQL,
-- intentionally NOT mirrored as `@@index` in schema.prisma; `prisma
-- migrate dev` replays the full migration history (this file included)
-- against the shadow DB before diffing the next migration, so an
-- unmirrored index here is never dropped or fought by a future `prisma
-- migrate dev` run - this is Prisma's own documented pattern for DB
-- objects outside the schema DSL's expressiveness.
--
-- `CONCURRENTLY` avoids taking a write-blocking lock on User/Post in
-- production while the index builds; Prisma detects `CREATE INDEX
-- CONCURRENTLY` in a migration file and automatically runs that file
-- outside a transaction (required - CONCURRENTLY cannot run inside one).
-- `IF NOT EXISTS` keeps this migration re-runnable if a prior partial
-- apply left some indexes already built.
--
-- gin_trgm_ops backs substring (`ILIKE '%term%'`, i.e. Prisma's
-- `contains: ..., mode: "insensitive"`) and fuzzy `similarity()`
-- matching - a plain btree index cannot accelerate either. Plain GIN
-- (no trgm) on the String[] columns accelerates the existing `{ has:
-- ... }` / `{ hasSome: ... }` array-containment filters already used by
-- /api/search, /api/opportunity and the new Advanced Search filters.

CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ─── People search: username / display name / professional profile ──
CREATE INDEX CONCURRENTLY IF NOT EXISTS "User_username_trgm_idx"
  ON "User" USING GIN ("username" gin_trgm_ops);
CREATE INDEX CONCURRENTLY IF NOT EXISTS "User_name_trgm_idx"
  ON "User" USING GIN ("name" gin_trgm_ops);
CREATE INDEX CONCURRENTLY IF NOT EXISTS "User_headline_trgm_idx"
  ON "User" USING GIN ("headline" gin_trgm_ops);
CREATE INDEX CONCURRENTLY IF NOT EXISTS "User_company_trgm_idx"
  ON "User" USING GIN ("company" gin_trgm_ops);

-- ─── Post search: content text + hashtag array containment ──────────
CREATE INDEX CONCURRENTLY IF NOT EXISTS "Post_content_trgm_idx"
  ON "Post" USING GIN ("content" gin_trgm_ops);
CREATE INDEX CONCURRENTLY IF NOT EXISTS "Post_hashtags_gin_idx"
  ON "Post" USING GIN ("hashtags");

-- ─── Community search: name + description ────────────────────────────
CREATE INDEX CONCURRENTLY IF NOT EXISTS "Community_name_trgm_idx"
  ON "Community" USING GIN ("name" gin_trgm_ops);
CREATE INDEX CONCURRENTLY IF NOT EXISTS "Community_description_trgm_idx"
  ON "Community" USING GIN ("description" gin_trgm_ops);

-- ─── Music search: artist / album / track / playlist names ──────────
CREATE INDEX CONCURRENTLY IF NOT EXISTS "MusicArtist_displayName_trgm_idx"
  ON "MusicArtist" USING GIN ("displayName" gin_trgm_ops);
CREATE INDEX CONCURRENTLY IF NOT EXISTS "MusicAlbum_title_trgm_idx"
  ON "MusicAlbum" USING GIN ("title" gin_trgm_ops);
CREATE INDEX CONCURRENTLY IF NOT EXISTS "MusicTrack_title_trgm_idx"
  ON "MusicTrack" USING GIN ("title" gin_trgm_ops);
CREATE INDEX CONCURRENTLY IF NOT EXISTS "MusicPlaylist_name_trgm_idx"
  ON "MusicPlaylist" USING GIN ("name" gin_trgm_ops);

-- ─── Opportunity search: title / description + skills containment ───
CREATE INDEX CONCURRENTLY IF NOT EXISTS "OpportunityListing_title_trgm_idx"
  ON "OpportunityListing" USING GIN ("title" gin_trgm_ops);
CREATE INDEX CONCURRENTLY IF NOT EXISTS "OpportunityListing_description_trgm_idx"
  ON "OpportunityListing" USING GIN ("description" gin_trgm_ops);
CREATE INDEX CONCURRENTLY IF NOT EXISTS "OpportunityListing_skills_gin_idx"
  ON "OpportunityListing" USING GIN ("skills");

-- ─── Marketplace search: title / description ─────────────────────────
CREATE INDEX CONCURRENTLY IF NOT EXISTS "Listing_title_trgm_idx"
  ON "Listing" USING GIN ("title" gin_trgm_ops);
CREATE INDEX CONCURRENTLY IF NOT EXISTS "Listing_description_trgm_idx"
  ON "Listing" USING GIN ("description" gin_trgm_ops);

-- ─── News search: title / excerpt ────────────────────────────────────
CREATE INDEX CONCURRENTLY IF NOT EXISTS "NewsArticle_title_trgm_idx"
  ON "NewsArticle" USING GIN ("title" gin_trgm_ops);
CREATE INDEX CONCURRENTLY IF NOT EXISTS "NewsArticle_excerpt_trgm_idx"
  ON "NewsArticle" USING GIN ("excerpt" gin_trgm_ops);
