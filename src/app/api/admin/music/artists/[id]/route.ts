import { NextResponse } from "next/server";
import { requireStaff } from "@/lib/admin";
import { prisma } from "@/lib/db";
import { logAdminAction } from "@/lib/audit-log";
import { deleteUploadThingKeys, extractUploadThingKey } from "@/lib/uploadthing";

export const dynamic = "force-dynamic";

// ─── DELETE: staff removes an artist profile and everything under it ─
// MusicTrack/MusicAlbum/MusicFollow all cascade off MusicArtist in the
// schema (onDelete: Cascade), so deleting the artist row removes every
// track (and, via each track's own cascades, its likes/playlist
// entries/history), every album, and every follow relationship in one
// step. This is deliberately destructive - moderating away a
// fraudulent or abusive artist is expected to take their catalogue
// with them, unlike deleting a single track or album.
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const adminCheck = await requireStaff();
  if (!adminCheck.authorized) return adminCheck.response;

  const { id } = await params;

  const artist = await prisma.musicArtist.findUnique({
    where: { id },
    select: {
      displayName: true,
      userId: true,
      avatarUrl: true,
      bannerUrl: true,
      tracks: { select: { audioUrl: true, audioKey: true, coverUrl: true, coverKey: true } },
      albums: { select: { coverUrl: true, coverKey: true } },
    },
  });
  if (!artist) return NextResponse.json({ error: "Artist not found" }, { status: 404 });

  await prisma.musicArtist.delete({ where: { id } });

  // Every storage object exclusively owned by this artist's catalogue
  // is now safe to remove - the DB rows referencing them are already
  // gone. Audio files are always exclusive to their track. Covers
  // (track/album/avatar/banner) could in principle be reused, so each
  // is only deleted from storage once nothing else in the platform
  // still points at that same URL - never blind-deleted.
  const keysToDelete: string[] = [];
  const coverUrlsToCheck: string[] = [];

  for (const track of artist.tracks) {
    const audioKey = track.audioKey || extractUploadThingKey(track.audioUrl);
    if (audioKey) keysToDelete.push(audioKey);
    if (track.coverUrl) coverUrlsToCheck.push(track.coverUrl);
  }
  for (const album of artist.albums) {
    if (album.coverUrl) coverUrlsToCheck.push(album.coverUrl);
  }
  if (artist.avatarUrl) coverUrlsToCheck.push(artist.avatarUrl);
  if (artist.bannerUrl) coverUrlsToCheck.push(artist.bannerUrl);

  for (const url of Array.from(new Set(coverUrlsToCheck))) {
    const [otherTrack, otherAlbum, otherArtistAvatar, otherArtistBanner] = await Promise.all([
      prisma.musicTrack.findFirst({ where: { coverUrl: url }, select: { id: true } }),
      prisma.musicAlbum.findFirst({ where: { coverUrl: url }, select: { id: true } }),
      prisma.musicArtist.findFirst({ where: { avatarUrl: url }, select: { id: true } }),
      prisma.musicArtist.findFirst({ where: { bannerUrl: url }, select: { id: true } }),
    ]);
    if (!otherTrack && !otherAlbum && !otherArtistAvatar && !otherArtistBanner) {
      const key = extractUploadThingKey(url);
      if (key) keysToDelete.push(key);
    }
  }

  if (keysToDelete.length) {
    await deleteUploadThingKeys(keysToDelete);
  }

  await logAdminAction({
    actor: adminCheck.session,
    action: "music_artist_delete",
    targetType: "MusicArtist",
    targetId: id,
    metadata: {
      displayName: artist.displayName,
      userId: artist.userId,
      trackCount: artist.tracks.length,
      albumCount: artist.albums.length,
    },
  });

  return NextResponse.json({ success: true });
}
