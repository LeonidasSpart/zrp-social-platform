-- ZRP Music: native catalogue, artists, albums, tracks, playlists, likes, follows and history.
CREATE TABLE "MusicArtist" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "displayName" TEXT NOT NULL,
  "bio" TEXT,
  "avatarUrl" TEXT,
  "bannerUrl" TEXT,
  "verified" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "MusicArtist_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "MusicArtist_userId_key" ON "MusicArtist"("userId");
CREATE INDEX "MusicArtist_displayName_idx" ON "MusicArtist"("displayName");
ALTER TABLE "MusicArtist" ADD CONSTRAINT "MusicArtist_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "MusicAlbum" (
  "id" TEXT NOT NULL,
  "artistId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT,
  "coverUrl" TEXT,
  "releaseDate" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "MusicAlbum_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "MusicAlbum_artistId_idx" ON "MusicAlbum"("artistId");
ALTER TABLE "MusicAlbum" ADD CONSTRAINT "MusicAlbum_artistId_fkey"
  FOREIGN KEY ("artistId") REFERENCES "MusicArtist"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "MusicTrack" (
  "id" TEXT NOT NULL,
  "artistId" TEXT NOT NULL,
  "albumId" TEXT,
  "title" TEXT NOT NULL,
  "description" TEXT,
  "audioUrl" TEXT NOT NULL,
  "audioKey" TEXT,
  "coverUrl" TEXT,
  "durationSec" INTEGER,
  "genre" TEXT,
  "explicit" BOOLEAN NOT NULL DEFAULT false,
  "status" TEXT NOT NULL DEFAULT 'PUBLISHED',
  "playCount" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "MusicTrack_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "MusicTrack_artistId_idx" ON "MusicTrack"("artistId");
CREATE INDEX "MusicTrack_albumId_idx" ON "MusicTrack"("albumId");
CREATE INDEX "MusicTrack_status_idx" ON "MusicTrack"("status");
CREATE INDEX "MusicTrack_createdAt_idx" ON "MusicTrack"("createdAt");
ALTER TABLE "MusicTrack" ADD CONSTRAINT "MusicTrack_artistId_fkey"
  FOREIGN KEY ("artistId") REFERENCES "MusicArtist"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MusicTrack" ADD CONSTRAINT "MusicTrack_albumId_fkey"
  FOREIGN KEY ("albumId") REFERENCES "MusicAlbum"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "MusicPlaylist" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "coverUrl" TEXT,
  "isPublic" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "MusicPlaylist_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "MusicPlaylist_userId_idx" ON "MusicPlaylist"("userId");
ALTER TABLE "MusicPlaylist" ADD CONSTRAINT "MusicPlaylist_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "MusicPlaylistTrack" (
  "id" TEXT NOT NULL,
  "playlistId" TEXT NOT NULL,
  "trackId" TEXT NOT NULL,
  "position" INTEGER NOT NULL DEFAULT 0,
  "addedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MusicPlaylistTrack_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "MusicPlaylistTrack_playlistId_trackId_key" ON "MusicPlaylistTrack"("playlistId","trackId");
CREATE INDEX "MusicPlaylistTrack_playlistId_position_idx" ON "MusicPlaylistTrack"("playlistId","position");
ALTER TABLE "MusicPlaylistTrack" ADD CONSTRAINT "MusicPlaylistTrack_playlistId_fkey"
  FOREIGN KEY ("playlistId") REFERENCES "MusicPlaylist"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MusicPlaylistTrack" ADD CONSTRAINT "MusicPlaylistTrack_trackId_fkey"
  FOREIGN KEY ("trackId") REFERENCES "MusicTrack"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "MusicLike" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "trackId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MusicLike_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "MusicLike_userId_trackId_key" ON "MusicLike"("userId","trackId");
CREATE INDEX "MusicLike_trackId_idx" ON "MusicLike"("trackId");
ALTER TABLE "MusicLike" ADD CONSTRAINT "MusicLike_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MusicLike" ADD CONSTRAINT "MusicLike_trackId_fkey"
  FOREIGN KEY ("trackId") REFERENCES "MusicTrack"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "MusicFollow" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "artistId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MusicFollow_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "MusicFollow_userId_artistId_key" ON "MusicFollow"("userId","artistId");
CREATE INDEX "MusicFollow_artistId_idx" ON "MusicFollow"("artistId");
ALTER TABLE "MusicFollow" ADD CONSTRAINT "MusicFollow_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MusicFollow" ADD CONSTRAINT "MusicFollow_artistId_fkey"
  FOREIGN KEY ("artistId") REFERENCES "MusicArtist"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "MusicHistory" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "trackId" TEXT NOT NULL,
  "secondsPlayed" INTEGER NOT NULL DEFAULT 0,
  "completed" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MusicHistory_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "MusicHistory_userId_createdAt_idx" ON "MusicHistory"("userId","createdAt");
CREATE INDEX "MusicHistory_trackId_idx" ON "MusicHistory"("trackId");
ALTER TABLE "MusicHistory" ADD CONSTRAINT "MusicHistory_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MusicHistory" ADD CONSTRAINT "MusicHistory_trackId_fkey"
  FOREIGN KEY ("trackId") REFERENCES "MusicTrack"("id") ON DELETE CASCADE ON UPDATE CASCADE;
