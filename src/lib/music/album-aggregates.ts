import { prisma } from "@/lib/db";

// Batches the "how long is this album" calculation for a whole list of
// albums into one groupBy query instead of one query per album (an
// N+1 that would otherwise show up on any page listing more than a
// handful of albums - the albums list, an artist's albums, Music
// Studio's album cards).
export async function attachAlbumDurations<T extends { id: string }>(
  albums: T[]
): Promise<(T & { totalDurationSec: number })[]> {
  if (albums.length === 0) return [];

  const sums = await prisma.musicTrack.groupBy({
    by: ["albumId"],
    where: { albumId: { in: albums.map((a) => a.id) }, status: "PUBLISHED" },
    _sum: { durationSec: true },
  });
  const sumMap = new Map(sums.map((s) => [s.albumId, s._sum.durationSec || 0]));

  return albums.map((album) => ({ ...album, totalDurationSec: sumMap.get(album.id) || 0 }));
}
