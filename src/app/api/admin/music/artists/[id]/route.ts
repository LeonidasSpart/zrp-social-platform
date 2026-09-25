import { NextResponse } from "next/server";
import { requireStaff } from "@/lib/admin";
import { prisma } from "@/lib/db";
import { logAdminAction } from "@/lib/audit-log";
import { deleteUploadsIfUnreferenced } from "@/lib/upload-ownership";

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

  // The DB rows referencing this catalogue's files are gone now.
  // ⚠️ SECURITY: an artist's avatar/banner/cover only has to be SOME
  // UploadThing URL (isTrustedUploadUrl), and every such URL is public -
  // an artist can point theirs at another user's profile avatar or post
  // image. Checking only the music tables before deleting (the old
  // behaviour here) let a staff delete of that artist destroy the other
  // user's file. The shared guard deletes a key only when nothing
  // anywhere in the database still references it.
  await deleteUploadsIfUnreferenced([
    ...artist.tracks.flatMap((t) => [t.audioKey, t.audioUrl, t.coverKey, t.coverUrl]),
    ...artist.albums.flatMap((a) => [a.coverKey, a.coverUrl]),
    artist.avatarUrl,
    artist.bannerUrl,
  ]);

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
