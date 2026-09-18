-- AlterTable
-- Additive-only: every new column is nullable or carries a safe,
-- non-fabricating default (see the field comments on User in
-- prisma/schema.prisma for why signupSource/signupPlatform default to
-- "UNKNOWN" rather than a guessed real value for pre-existing rows).
-- No existing column is renamed, retyped or dropped.
ALTER TABLE "User"
  ADD COLUMN "countryCode" TEXT,
  ADD COLUMN "signupCountryCode" TEXT,
  ADD COLUMN "signupSource" TEXT NOT NULL DEFAULT 'UNKNOWN',
  ADD COLUMN "signupCampaign" TEXT,
  ADD COLUMN "signupPlatform" TEXT NOT NULL DEFAULT 'UNKNOWN',
  ADD COLUMN "languageCode" TEXT,
  ADD COLUMN "headline" TEXT,
  ADD COLUMN "company" TEXT,
  ADD COLUMN "position" TEXT,
  ADD COLUMN "skills" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

-- CreateIndex
CREATE INDEX "User_countryCode_idx" ON "User"("countryCode");
CREATE INDEX "User_signupCountryCode_idx" ON "User"("signupCountryCode");
CREATE INDEX "User_signupSource_idx" ON "User"("signupSource");
CREATE INDEX "User_signupPlatform_idx" ON "User"("signupPlatform");
CREATE INDEX "User_languageCode_idx" ON "User"("languageCode");
