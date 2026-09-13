import { prisma } from "@/lib/db";
import { viewablePostAuthorFilter } from "@/lib/permissions";
import { POST_CARD_SELECT, attachViewerState } from "@/lib/post-card-feed";

// Deliberately narrow, matching the reference product's own category
// list rather than an open free-text field - see the Community model's
// own comment in prisma/schema.prisma for why "category" and "hashtag"
// are two separate concepts (category groups communities for browsing,
// hashtag is what actually selects a community's feed).
export const COMMUNITY_CATEGORIES = [
  "TRAVEL",
  "PHOTOGRAPHY",
  "NATURE",
  "TECHNOLOGY",
  "HEALTH_FITNESS",
  "ART_DESIGN",
  "GENERAL",
] as const;

export type CommunityCategoryValue = (typeof COMMUNITY_CATEGORIES)[number];

const HASHTAG_RE = /^[a-z0-9_]{2,32}$/;

export function normalizeHashtag(raw: string): string | null {
  const cleaned = raw.trim().replace(/^#/, "").toLowerCase();
  return HASHTAG_RE.test(cleaned) ? cleaned : null;
}

export function slugifyName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

/**
 * A community's feed is every published post carrying its hashtag -
 * there is no separate community-post join table (see the schema
 * comment). This mirrors exactly how the pre-existing Android
 * "Communities" screen already sourced posts, just promoted to a real,
 * paginated, cross-platform feed endpoint.
 */
export async function getCommunityFeedPage(
  hashtag: string,
  userId: string | null | undefined,
  cursor: string | null,
  limit: number
) {
  const posts = await prisma.post.findMany({
    take: limit + 1,
    ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
    orderBy: { createdAt: "desc" },
    where: {
      status: "published",
      scheduledAt: null,
      hashtags: { has: hashtag },
      author: viewablePostAuthorFilter(userId),
    },
    select: POST_CARD_SELECT,
  });

  const hasMore = posts.length > limit;
  const page = hasMore ? posts.slice(0, limit) : posts;
  await attachViewerState(page, userId);

  return { items: page, nextCursor: hasMore ? page[page.length - 1].id : null };
}
