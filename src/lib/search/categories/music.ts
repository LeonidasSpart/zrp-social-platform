import { prisma } from "@/lib/db";
import { textMatchWeight } from "../text-match";
import { relevanceScore, ageDecayedScore } from "../ranking";
import { paginateRanked, parseOffsetCursor } from "../paginate";
import { CANDIDATE_POOL_SIZE, RANKED_CACHE_TTL_SECONDS } from "../constants";
import { resolveDateFilter } from "../params";
import type { SearchPage, SearchQueryParams } from "../types";

// ─── Music: artists / albums / tracks / playlists ─────────────────────
// Unlike every other category, "Music" spans four distinct Prisma
// models with no shared table - a search for an artist's name should
// surface the artist AND their albums/tracks, so results are merged and
// ranked together rather than exposed as four separate sub-categories.
// This is also the one category with no true DB-keyset "recent" sort:
// there is no single ordered source to walk a cursor across four
// heterogeneous tables, so - like hashtags' own documented exception -
// every sort mode here goes through the cached-ranked-list + offset-
// cursor path (paginateRanked), not buildKeysetPage.
//
// Each kind's popularity counter is genuinely its own (not fabricated):
// artist -> follower count (MusicFollow), track -> playCount, album/
// playlist -> track count (the closest real size signal either model
// has). These are NOT unit-normalized against each other - "engagement"/
// "trending" sort ranks the merged list by each item's own raw counter,
// a documented simplification (see docs/advanced-search-architecture.md)
// rather than an invented cross-kind fairness scheme.
//
// Only tracks are gated by `status` (PUBLISHED) - MusicArtist/
// MusicAlbum/MusicPlaylist have no publish-workflow status column in
// the schema; MusicPlaylist additionally requires isPublic: true so a
// private playlist never surfaces in search results for anyone but
// isn't otherwise access-controlled here.

export type MusicSearchResult =
  | { kind: "artist"; id: string; displayName: string; avatarUrl: string | null; verified: boolean; createdAt: Date; counter: number }
  | {
      kind: "album";
      id: string;
      title: string;
      coverUrl: string | null;
      artist: { id: string; displayName: string };
      createdAt: Date;
      counter: number;
    }
  | {
      kind: "track";
      id: string;
      title: string;
      audioUrl: string;
      coverUrl: string | null;
      durationSec: number | null;
      artist: { id: string; displayName: string; avatarUrl: string | null };
      playCount: number;
      createdAt: Date;
      counter: number;
    }
  | { kind: "playlist"; id: string; name: string; coverUrl: string | null; createdAt: Date; counter: number };

async function fetchCandidates(params: SearchQueryParams): Promise<MusicSearchResult[]> {
  const { query, filters } = params;
  const dateFilter = resolveDateFilter(filters);
  const perKindTake = Math.ceil(CANDIDATE_POOL_SIZE / 4);

  const [artists, albums, tracks, playlists] = await Promise.all([
    prisma.musicArtist.findMany({
      where: {
        displayName: { contains: query, mode: "insensitive" },
        ...(dateFilter ? { createdAt: dateFilter } : {}),
      },
      select: { id: true, displayName: true, avatarUrl: true, verified: true, createdAt: true, _count: { select: { followers: true } } },
      orderBy: { createdAt: "desc" },
      take: perKindTake,
    }),
    prisma.musicAlbum.findMany({
      where: {
        title: { contains: query, mode: "insensitive" },
        ...(dateFilter ? { createdAt: dateFilter } : {}),
      },
      select: {
        id: true,
        title: true,
        coverUrl: true,
        createdAt: true,
        artist: { select: { id: true, displayName: true } },
        _count: { select: { tracks: true } },
      },
      orderBy: { createdAt: "desc" },
      take: perKindTake,
    }),
    prisma.musicTrack.findMany({
      where: {
        title: { contains: query, mode: "insensitive" },
        status: "PUBLISHED",
        ...(dateFilter ? { createdAt: dateFilter } : {}),
      },
      select: {
        id: true,
        title: true,
        audioUrl: true,
        coverUrl: true,
        durationSec: true,
        playCount: true,
        createdAt: true,
        artist: { select: { id: true, displayName: true, avatarUrl: true } },
      },
      orderBy: { createdAt: "desc" },
      take: perKindTake,
    }),
    prisma.musicPlaylist.findMany({
      where: {
        name: { contains: query, mode: "insensitive" },
        isPublic: true,
        ...(dateFilter ? { createdAt: dateFilter } : {}),
      },
      select: { id: true, name: true, coverUrl: true, createdAt: true, _count: { select: { tracks: true } } },
      orderBy: { createdAt: "desc" },
      take: perKindTake,
    }),
  ]);

  return [
    ...artists.map((a) => ({
      kind: "artist" as const,
      id: a.id,
      displayName: a.displayName,
      avatarUrl: a.avatarUrl,
      verified: a.verified,
      createdAt: a.createdAt,
      counter: a._count.followers,
    })),
    ...albums.map((a) => ({
      kind: "album" as const,
      id: a.id,
      title: a.title,
      coverUrl: a.coverUrl,
      artist: a.artist,
      createdAt: a.createdAt,
      counter: a._count.tracks,
    })),
    ...tracks.map((t) => ({
      kind: "track" as const,
      id: t.id,
      title: t.title,
      audioUrl: t.audioUrl,
      coverUrl: t.coverUrl,
      durationSec: t.durationSec,
      artist: t.artist,
      playCount: t.playCount,
      createdAt: t.createdAt,
      counter: t.playCount,
    })),
    ...playlists.map((p) => ({
      kind: "playlist" as const,
      id: p.id,
      name: p.name,
      coverUrl: p.coverUrl,
      createdAt: p.createdAt,
      counter: p._count.tracks,
    })),
  ];
}

function nameOf(item: MusicSearchResult): string {
  switch (item.kind) {
    case "artist":
      return item.displayName;
    case "album":
    case "track":
      return item.title;
    case "playlist":
      return item.name;
  }
}

function scoreCandidate(item: MusicSearchResult, query: string, sort: SearchQueryParams["sort"]): number {
  if (sort === "engagement") return item.counter;
  if (sort === "trending") return ageDecayedScore(item.counter, item.createdAt);
  if (sort === "recent") return item.createdAt.getTime();
  return relevanceScore(textMatchWeight(query, nameOf(item)), item.counter);
}

export async function searchMusic(params: SearchQueryParams): Promise<SearchPage<MusicSearchResult>> {
  if (params.query.trim().length < 2) return { items: [], nextCursor: null };

  const offset = parseOffsetCursor(params.cursor);
  const cacheKey = `search:music:v1:${params.sort}:${params.query.trim().toLowerCase()}:${JSON.stringify(params.filters)}`;

  return paginateRanked<MusicSearchResult>(cacheKey, RANKED_CACHE_TTL_SECONDS, offset, params.limit, async () => {
    const candidates = await fetchCandidates(params);
    return candidates
      .map((item) => ({ item, score: scoreCandidate(item, params.query, params.sort) }))
      .sort((a, b) => b.score - a.score)
      .map((r) => r.item);
  });
}
