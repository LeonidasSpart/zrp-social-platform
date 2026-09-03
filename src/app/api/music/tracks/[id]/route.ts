import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { isSessionAdmin } from "@/lib/admin";
import { logAdminAction } from "@/lib/audit-log";
import { deleteUploadThingKeys, extractUploadThingKey } from "@/lib/uploadthing";

export const dynamic = "force-dynamic";

const GENRE_MAX = 60;
const TITLE_MAX = 200;
const DESCRIPTION_MAX = 5000;

// ─── PATCH: track owner edits their own published track's metadata ───
// Never trusts a client-sent artistId/userId - ownership is always
// re-derived server-side from the authenticated session against the
// track's real artist relation.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const track = await prisma.musicTrack.findUnique({
    where: { id },
    select: { id: true, artistId: true, artist: { select: { userId: true } } },
  });
  if (!track) return NextResponse.json({ error: "Track not found" }, { status: 404 });
  if (track.artist.userId !== session.user.id) {
    return NextResponse.json({ error: "You don't own this track" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const data: Record<string, unknown> = {};

  if (body.title !== undefined) {
    const title = String(body.title).trim().slice(0, TITLE_MAX);
    if (!title) return NextResponse.json({ error: "Title cannot be empty" }, { status: 400 });
    data.title = title;
  }
  if (body.description !== undefined) {
    data.description = body.description === null ? null : String(body.description).trim().slice(0, DESCRIPTION_MAX);
  }
  if (body.genre !== undefined) {
    data.genre = body.genre === null ? null : String(body.genre).trim().slice(0, GENRE_MAX);
  }
  if (body.explicit !== undefined) {
    data.explicit = !!body.explicit;
  }
  if (body.coverUrl !== undefined) {
    data.coverUrl = body.coverUrl === null ? null : String(body.coverUrl);
    data.coverKey = body.coverKey ? String(body.coverKey) : extractUploadThingKey(data.coverUrl as string | null);
  }
  if (body.trackNumber !== undefined) {
    data.trackNumber = body.trackNumber === null ? null : Math.max(0, Math.trunc(Number(body.trackNumber)) || 0);
  }

  // Assigning/unassigning an album. Setting albumId to null just
  // unassigns the track. Setting it to a real id requires that album to
  // belong to the SAME artist - otherwise a track could be dropped into
  // another artist's album by guessing its id (an IDOR).
  if (body.albumId !== undefined) {
    if (body.albumId === null) {
      data.albumId = null;
      data.trackNumber = null;
    } else {
      const albumId = String(body.albumId);
      const album = await prisma.musicAlbum.findUnique({
        where: { id: albumId },
        select: { artistId: true },
      });
      if (!album) return NextResponse.json({ error: "Album not found" }, { status: 404 });
      if (album.artistId !== track.artistId) {
        return NextResponse.json({ error: "You can only add tracks to your own albums" }, { status: 403 });
      }
      data.albumId = albumId;
    }
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "No fields to update" }, { status: 400 });
  }

  const updated = await prisma.musicTrack.update({
    where: { id },
    data,
    include: { artist: true, album: true },
  });

  return NextResponse.json(updated);
}

// ─── DELETE: track owner deletes their own track, or staff moderates ─
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const track = await prisma.musicTrack.findUnique({
    where: { id },
    select: {
      id: true,
      title: true,
      audioKey: true,
      audioUrl: true,
      coverKey: true,
      coverUrl: true,
      artist: { select: { userId: true } },
    },
  });
  if (!track) return NextResponse.json({ error: "Track not found" }, { status: 404 });

  const isOwner = track.artist.userId === session.user.id;
  if (!isOwner && !(await isSessionAdmin(session))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  // Deleting the MusicTrack row cascades MusicLike/MusicPlaylistTrack/
  // MusicHistory (all onDelete: Cascade on trackId in the schema) - no
  // manual cleanup needed for those dependent records.
  await prisma.musicTrack.delete({ where: { id } });

  // The audio file is exclusively this track's - safe to delete
  // unconditionally once the row is gone.
  const audioKey = track.audioKey || extractUploadThingKey(track.audioUrl);
  const keysToDelete = audioKey ? [audioKey] : [];

  // The cover, however, could in principle be reused (e.g. an artist
  // reusing the same artwork for a track and its album), so it's only
  // deleted from storage if nothing else still references it - never
  // blind-deleted just because this track is gone.
  const coverKey = track.coverKey || extractUploadThingKey(track.coverUrl);
  if (coverKey && track.coverUrl) {
    const [otherTrack, otherAlbum] = await Promise.all([
      prisma.musicTrack.findFirst({ where: { coverUrl: track.coverUrl }, select: { id: true } }),
      prisma.musicAlbum.findFirst({ where: { coverUrl: track.coverUrl }, select: { id: true } }),
    ]);
    if (!otherTrack && !otherAlbum) keysToDelete.push(coverKey);
  }

  if (keysToDelete.length) {
    await deleteUploadThingKeys(keysToDelete);
  }

  if (!isOwner) {
    await logAdminAction({
      actor: session,
      action: "music.track.delete",
      targetType: "MusicTrack",
      targetId: id,
      metadata: { title: track.title },
    });
  }

  return NextResponse.json({ success: true });
}
