-- Session-revocation-on-password-change: see the schema comment on
-- User.credentialsVersion. Every existing row backfills to 0, which is
-- also the default every already-issued token implicitly carries (it
-- predates this column and has no claim for it at all) - so no
-- existing session is force-signed-out by this migration itself, only
-- by a password change from this point forward.
ALTER TABLE "User" ADD COLUMN "credentialsVersion" INTEGER NOT NULL DEFAULT 0;
