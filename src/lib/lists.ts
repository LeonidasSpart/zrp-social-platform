import { prisma } from "@/lib/db";
import { viewablePostAuthorFilter } from "@/lib/permissions";
import { POST_CARD_SELECT, attachViewerState } from "@/lib/post-card-feed";

/**
 * A list's feed is the standard post feed filtered to its member
 * users' authorId - no new post-tagging table, same pattern as
 * getCommunityFeedPage in communities.ts.
 */
export async function getListFeedPage(
  memberUserIds: string[],
  userId: string | null | undefined,
  cursor: string | null,
  limit: number
) {
  if (memberUserIds.length === 0) {
    return { items: [], nextCursor: null };
  }

  const posts = await prisma.post.findMany({
    take: limit + 1,
    ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
    orderBy: { createdAt: "desc" },
    where: {
      status: "published",
      scheduledAt: null,
      authorId: { in: memberUserIds },
      author: viewablePostAuthorFilter(userId),
    },
    select: POST_CARD_SELECT,
  });

  const hasMore = posts.length > limit;
  const page = hasMore ? posts.slice(0, limit) : posts;
  await attachViewerState(page, userId);

  return { items: page, nextCursor: hasMore ? page[page.length - 1].id : null };
}
