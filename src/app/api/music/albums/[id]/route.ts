import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export const dynamic = "force-dynamic";

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
        orderBy: { createdAt: "asc" },
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
