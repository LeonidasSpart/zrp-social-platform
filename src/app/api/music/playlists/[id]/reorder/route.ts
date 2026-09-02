import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const playlist = await prisma.musicPlaylist.findFirst({ where: { id, userId: session.user.id } });
  if (!playlist) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json();
  const orderedIds: string[] = Array.isArray(body.orderedIds) ? body.orderedIds.map(String) : [];
  if (!orderedIds.length) return NextResponse.json({ error: "orderedIds required" }, { status: 400 });

  const existing = await prisma.musicPlaylistTrack.findMany({
    where: { playlistId: id },
    select: { id: true },
  });
  const existingIds = new Set(existing.map((e) => e.id));

  // Only reorder rows that actually belong to this playlist - never
  // trust the client-supplied id list to reach into another playlist.
  const validOrderedIds = orderedIds.filter((itemId) => existingIds.has(itemId));
  if (!validOrderedIds.length) return NextResponse.json({ error: "No matching playlist tracks" }, { status: 400 });

  await prisma.$transaction(
    validOrderedIds.map((itemId, index) =>
      prisma.musicPlaylistTrack.update({ where: { id: itemId }, data: { position: index } })
    )
  );

  return NextResponse.json({ reordered: true });
}
