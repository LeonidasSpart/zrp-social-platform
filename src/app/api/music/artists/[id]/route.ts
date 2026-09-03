import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id;

  const artist = await prisma.musicArtist.findUnique({
    where: { id },
    include: {
      _count: { select: { tracks: true, followers: true } },
      albums: {
        orderBy: { createdAt: "desc" },
        include: { _count: { select: { tracks: true } } },
      },
      tracks: {
        where: { status: "PUBLISHED" },
        orderBy: [{ playCount: "desc" }, { createdAt: "desc" }],
        // artist: true is required even though every track here already
        // belongs to this same artist - MusicTrack (the player's shared
        // type) always expects track.artist.displayName (used by the
        // mini player and the Media Session integration), and omitting
        // it here made "Play all" on an artist page throw as soon as a
        // track without .artist became the now-playing track.
        include: { album: true, artist: true },
      },
    },
  });

  if (!artist) return NextResponse.json({ error: "Artist not found" }, { status: 404 });

  let likedTrackIds = new Set<string>();
  let isFollowing = false;

  if (userId) {
    const [likes, follow] = await Promise.all([
      prisma.musicLike.findMany({
        where: { userId, trackId: { in: artist.tracks.map((t) => t.id) } },
        select: { trackId: true },
      }),
      prisma.musicFollow.findUnique({
        where: { userId_artistId: { userId, artistId: id } },
        select: { id: true },
      }),
    ]);
    likedTrackIds = new Set(likes.map((l) => l.trackId));
    isFollowing = !!follow;
  }

  return NextResponse.json({
    ...artist,
    isFollowing,
    isOwner: userId === artist.userId,
    tracks: artist.tracks.map((t) => ({ ...t, liked: likedTrackIds.has(t.id) })),
  });
}
