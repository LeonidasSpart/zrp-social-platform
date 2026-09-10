import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { isSessionAdmin } from "@/lib/admin";
import { logAdminAction } from "@/lib/audit-log";
import { extractUploadThingKey } from "@/lib/uploadthing";
import { deleteUploadsIfUnreferenced } from "@/lib/upload-ownership";
import { isTrustedUploadUrl, UPLOAD_ONLY_ERROR } from "@/lib/media-url";

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
    select: { id: true, artistId: true, coverUrl: true, artist: { select: { userId: true } } },
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
    // ⚠️ SECURITY: a NEW cover must come from ZRP's own upload storage;
    // re-sending the cover already stored on this track (which the
    // Music Studio edit form always does) is accepted unchanged. The
    // key is derived from the URL server-side - never taken from the
    // client, which could otherwise name any file in storage for
    // deletion. See src/lib/upload-ownership.ts.
    const coverUrl = body.coverUrl === null ? null : String(body.coverUrl);
    if (coverUrl && coverUrl !== track.coverUrl && !isTrustedUploadUrl(coverUrl)) {
      return NextResponse.json({ error: UPLOAD_ONLY_ERROR }, { status: 400 });
    }
    data.coverUrl = coverUrl;
    data.coverKey = extractUploadThingKey(coverUrl);
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

  // ⚠️ SECURITY: storage files are only deleted when NOTHING in the
  // database still references them - not just other tracks/albums, but
  // any record anywhere. Previously the audio key was deleted
  // unconditionally (and could have been any key the client named at
  // upload time), so a track pointing at someone else's file would
  // have destroyed that file on deletion. See src/lib/upload-ownership.ts.
  await deleteUploadsIfUnreferenced([
    track.audioKey || track.audioUrl,
    track.coverKey || track.coverUrl,
  ]);

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
