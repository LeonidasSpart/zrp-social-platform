import { prisma } from "@/lib/db";
import { getCached, setCached } from "@/lib/redis";

export interface HashtagCount {
  tag: string;
  count: number;
}

// There is no dedicated Hashtag table - hashtags live as a plain
// String[] on Post (see prisma/schema.prisma). This scans the most
// recent live (published, not scheduled, non-banned-author) posts once
// and caches the raw scan, so both an all-time tally (GET
// /api/hashtags/search's original behavior) and a recency-windowed
// "trending" tally (Advanced Search's `sort=trending` for the hashtags
// category) can be derived from the same cached data at no extra
// Postgres cost - the scan is already ordered most-recent-first.
const SCAN_CACHE_KEY = "hashtags:scan:v1";
const SCAN_CACHE_TTL_SECONDS = 300;
const SCAN_LIMIT = 1000;

interface ScannedPost {
  hashtags: string[];
  createdAt: string;
}

async function getScannedPosts(): Promise<ScannedPost[]> {
  const cached = await getCached<ScannedPost[]>(SCAN_CACHE_KEY);
  if (cached) return cached;

  const posts = await prisma.post.findMany({
    where: { status: "published", scheduledAt: null, author: { banned: false } },
    take: SCAN_LIMIT,
    orderBy: { createdAt: "desc" },
    select: { hashtags: true, createdAt: true },
  });

  const scanned = posts.map((p) => ({ hashtags: p.hashtags, createdAt: p.createdAt.toISOString() }));
  await setCached(SCAN_CACHE_KEY, scanned, SCAN_CACHE_TTL_SECONDS);
  return scanned;
}

function tally(posts: ScannedPost[]): HashtagCount[] {
  const counts: Record<string, number> = {};
  for (const post of posts) {
    for (const tag of post.hashtags ?? []) {
      counts[tag] = (counts[tag] || 0) + 1;
    }
  }
  return Object.entries(counts)
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));
}

/** All-time tally over the most recent live posts - unchanged behavior from the original GET /api/hashtags/search. */
export async function getAllHashtagCounts(): Promise<HashtagCount[]> {
  return tally(await getScannedPosts());
}

/** Tally restricted to posts created within `windowDays` - backs Advanced Search's "trending" sort for hashtags. */
export async function getRecentHashtagCounts(windowDays: number): Promise<HashtagCount[]> {
  const cutoff = Date.now() - windowDays * 24 * 60 * 60 * 1000;
  const posts = await getScannedPosts();
  return tally(posts.filter((p) => new Date(p.createdAt).getTime() >= cutoff));
}
