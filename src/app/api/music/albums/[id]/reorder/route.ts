import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export const dynamic = "force-dynamic";

// Sets MusicTrack.trackNumber for every track in this album from a
// client-supplied order, the same pattern as the existing playlist
// reorder route. Only tracks that actually belong to this album (and
// this album's owning artist) can be reordered by it - the client's id
// list is filtered against the real album membership first.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const album = await prisma.musicAlbum.findUnique({
    where: { id },
    select: { artist: { select: { userId: true } } },
  });
  if (!album) return NextResponse.json({ error: "Album not found" }, { status: 404 });
  if (album.artist.userId !== session.user.id) {
    return NextResponse.json({ error: "You don't own this album" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const orderedTrackIds: string[] = Array.isArray(body.orderedTrackIds)
    ? body.orderedTrackIds.map(String)
    : [];
  if (!orderedTrackIds.length) {
    return NextResponse.json({ error: "orderedTrackIds required" }, { status: 400 });
  }

  const existing = await prisma.musicTrack.findMany({
    where: { albumId: id },
    select: { id: true },
  });
  const existingIds = new Set(existing.map((t) => t.id));

  const validOrderedIds = orderedTrackIds.filter((trackId) => existingIds.has(trackId));
  if (!validOrderedIds.length) {
    return NextResponse.json({ error: "No matching tracks in this album" }, { status: 400 });
  }

  await prisma.$transaction(
    validOrderedIds.map((trackId, index) =>
      prisma.musicTrack.update({ where: { id: trackId }, data: { trackNumber: index + 1 } })
    )
  );

  return NextResponse.json({ reordered: true });
}
