import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { isSessionAdmin } from "@/lib/admin";
import { logAdminAction } from "@/lib/audit-log";
import { extractUploadThingKey } from "@/lib/uploadthing";
import { deleteUploadsIfUnreferenced } from "@/lib/upload-ownership";
import { isTrustedUploadUrl, UPLOAD_ONLY_ERROR } from "@/lib/media-url";

export const dynamic = "force-dynamic";

const TITLE_MAX = 150;
const DESCRIPTION_MAX = 5000;

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id;

  const album = await prisma.musicAlbum.findUnique({
    where: { id },
    include: {
      artist: true,
      tracks: {
        where: { status: "PUBLISHED" },
        orderBy: [{ trackNumber: "asc" }, { createdAt: "asc" }],
        include: { artist: true },
      },
    },
  });

  if (!album) return NextResponse.json({ error: "Album not found" }, { status: 404 });

  let likedTrackIds = new Set<string>();
  if (userId) {
    const likes = await prisma.musicLike.findMany({
      where: { userId, trackId: { in: album.tracks.map((t) => t.id) } },
      select: { trackId: true },
    });
    likedTrackIds = new Set(likes.map((l) => l.trackId));
  }

  return NextResponse.json({
    ...album,
    tracks: album.tracks.map((t) => ({ ...t, liked: likedTrackIds.has(t.id) })),
  });
}

// ─── PATCH: album owner edits their own album's metadata ─────────────
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const album = await prisma.musicAlbum.findUnique({
    where: { id },
    select: { id: true, coverUrl: true, artist: { select: { userId: true } } },
  });
  if (!album) return NextResponse.json({ error: "Album not found" }, { status: 404 });
  if (album.artist.userId !== session.user.id) {
    return NextResponse.json({ error: "You don't own this album" }, { status: 403 });
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
  if (body.coverUrl !== undefined) {
    // ⚠️ SECURITY: a NEW cover must come from ZRP's own upload storage;
    // re-sending the cover already stored is accepted unchanged. The
    // key is derived server-side, never taken from the client (see
    // src/lib/upload-ownership.ts).
    const coverUrl = body.coverUrl === null ? null : String(body.coverUrl);
    if (coverUrl && coverUrl !== album.coverUrl && !isTrustedUploadUrl(coverUrl)) {
      return NextResponse.json({ error: UPLOAD_ONLY_ERROR }, { status: 400 });
    }
    data.coverUrl = coverUrl;
    data.coverKey = extractUploadThingKey(coverUrl);
  }
  if (body.releaseDate !== undefined) {
    data.releaseDate = body.releaseDate ? new Date(body.releaseDate) : null;
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "No fields to update" }, { status: 400 });
  }

  const updated = await prisma.musicAlbum.update({
    where: { id },
    data,
    include: { artist: true, _count: { select: { tracks: true } } },
  });

  return NextResponse.json(updated);
}

// ─── DELETE: album owner deletes their own album, or staff moderates ─
// Deliberately does NOT delete the tracks in the album - they're
// unassigned (albumId set to null) and remain fully intact, still
// published, still playable. This is a data-safety requirement: an
// artist deleting an album by mistake must never lose their songs.
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const album = await prisma.musicAlbum.findUnique({
    where: { id },
    select: { id: true, title: true, coverKey: true, coverUrl: true, artist: { select: { userId: true } } },
  });
  if (!album) return NextResponse.json({ error: "Album not found" }, { status: 404 });

  const isOwner = album.artist.userId === session.user.id;
  if (!isOwner && !(await isSessionAdmin(session))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  await prisma.$transaction([
    prisma.musicTrack.updateMany({
      where: { albumId: id },
      data: { albumId: null, trackNumber: null },
    }),
    prisma.musicAlbum.delete({ where: { id } }),
  ]);

  // ⚠️ SECURITY: artwork is only deleted from storage if NOTHING in the
  // database still references it - a track reusing the same artwork,
  // or any other record anywhere (see src/lib/upload-ownership.ts).
  // Never blind-deleted.
  await deleteUploadsIfUnreferenced([album.coverKey || album.coverUrl]);

  if (!isOwner) {
    await logAdminAction({
      actor: session,
      action: "music.album.delete",
      targetType: "MusicAlbum",
      targetId: id,
      metadata: { title: album.title },
    });
  }

  return NextResponse.json({ success: true });
}
