import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { attachAlbumDurations } from "@/lib/music/album-aggregates";

export const dynamic = "force-dynamic";

// Every section of the Music home screen used to be its own client
// fetch (new releases, latest albums, popular artists, genres, and -
// for a signed-in user - recently played, liked preview, your
// playlists): up to 6-7 round trips before the page had anything to
// show. This batches all of it into the one request the home screen
// actually needs, running the queries in parallel server-side instead
// of serially over the network.
export async function GET() {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id;

  const [newReleasesRaw, latestAlbumsRaw, popularArtists, genreRows, likesRaw, historyRaw, playlistsRaw] =
    await Promise.all([
      prisma.musicTrack.findMany({
        where: { status: "PUBLISHED" },
        orderBy: [{ createdAt: "desc" }],
        take: 10,
        include: {
          artist: true,
          album: true,
          ...(userId ? { likes: { where: { userId }, select: { id: true } } } : {}),
        },
      }),
      prisma.musicAlbum.findMany({
        orderBy: { createdAt: "desc" },
        take: 10,
        include: { artist: true, _count: { select: { tracks: true } } },
      }),
      prisma.musicArtist.findMany({
        orderBy: [{ followers: { _count: "desc" } }, { displayName: "asc" }],
        take: 10,
        include: { _count: { select: { tracks: true, followers: true } } },
      }),
      prisma.musicTrack.groupBy({
        by: ["genre"],
        where: { status: "PUBLISHED", genre: { not: null } },
        _count: { genre: true },
        orderBy: { _count: { genre: "desc" } },
      }),
      userId
        ? prisma.musicLike.findMany({
            where: { userId },
            orderBy: { createdAt: "desc" },
            take: 10,
            include: { track: { include: { artist: true, album: true } } },
          })
        : Promise.resolve([]),
      userId
        ? prisma.musicHistory.findMany({
            where: { userId },
            orderBy: { createdAt: "desc" },
            take: 100,
            include: { track: { include: { artist: true, album: true } } },
          })
        : Promise.resolve([]),
      userId
        ? prisma.musicPlaylist.findMany({
            where: { userId },
            orderBy: { updatedAt: "desc" },
            take: 8,
            include: {
              tracks: {
                orderBy: { position: "asc" },
                take: 1,
                include: { track: { select: { coverUrl: true, album: { select: { coverUrl: true } } } } },
              },
            },
          })
        : Promise.resolve([]),
    ]);

  const newReleases = newReleasesRaw.map((t) => ({
    ...t,
    liked: "likes" in t ? (t.likes as { id: string }[]).length > 0 : false,
    likes: undefined,
  }));

  const latestAlbums = await attachAlbumDurations(latestAlbumsRaw);

  const genres = genreRows.filter((r) => r.genre).map((r) => ({ genre: r.genre as string, count: r._count.genre }));

  // Same de-dupe the home screen always applied client-side: history is
  // every play event, so the same track played repeatedly shouldn't
  // eat multiple "Recently Played" slots.
  const seen = new Set<string>();
  const recentlyPlayed: typeof historyRaw[number]["track"][] = [];
  for (const entry of historyRaw) {
    if (seen.has(entry.track.id)) continue;
    seen.add(entry.track.id);
    recentlyPlayed.push(entry.track);
    if (recentlyPlayed.length >= 10) break;
  }

  // Every track here came from the user's own likes, so it's
  // definitionally liked - no need to look that up separately.
  const likedPreview = likesRaw.map((l) => ({ ...l.track, liked: true }));

  const yourPlaylists = playlistsRaw;

  return NextResponse.json({
    newReleases,
    latestAlbums,
    popularArtists,
    genres,
    recentlyPlayed,
    likedPreview,
    yourPlaylists,
  });
}
