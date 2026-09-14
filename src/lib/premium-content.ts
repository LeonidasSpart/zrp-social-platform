import { prisma } from "@/lib/db";

/*
 * ⚠️ SECURITY: pay-per-view content gating.
 *
 * `PremiumPost`/`PremiumPurchase` (see prisma/schema.prisma and
 * src/app/api/creator/premium-post, src/app/api/creator/premium-purchase)
 * exist so a creator can gate a post's full content behind an on-chain
 * USDC payment. That payment path is real and independently verified
 * on-chain (verifyUsdcTransaction) - but until this helper, NOTHING
 * server-side ever redacted a gated post's `content`/media before
 * returning it from a feed/listing/detail read. Every route that reads
 * `Post` rows (GET /api/posts/feed, /api/posts/explore, /api/posts/[id],
 * /api/users/[username]/posts, /api/profile/[username]/posts,
 * /api/posts/hashtag/[tag]) selected and returned `post.content` in
 * full for every post regardless of PremiumPost/PremiumPurchase status,
 * so pay-per-view content was fully readable by anyone who hadn't
 * purchased it (and even by logged-out visitors) simply by viewing the
 * feed or the post directly - the payment/verification machinery was
 * real, but nothing ever depended on its result to decide what to show.
 *
 * `applyPremiumGating` is the single place that decides "should this
 * viewer see this post's real content" and must be called on every post
 * list/detail a viewer can reach, right before the response is sent.
 * It replaces `content`/`imageUrl`/`imageUrls`/`linkUrl` with the
 * creator's own `previewContent` (falling back to an empty string) for
 * any premium post the viewer hasn't completed a purchase for and
 * doesn't author, and attaches a `premiumPost` summary so the client
 * can render a paywall instead of silently showing truncated/missing
 * content with no explanation.
 */

export interface PremiumGateSummary {
  id: string;
  price: number;
  currency: string;
  previewContent: string;
  locked: boolean;
}

type GateablePost = {
  id: string;
  authorId: string;
  content: string;
  imageUrl?: string | null;
  imageUrls?: string[];
  linkUrl?: string | null;
};

export async function applyPremiumGating<T extends GateablePost>(
  posts: T[],
  viewerId: string | null | undefined
): Promise<(T & { premiumPost?: PremiumGateSummary })[]> {
  if (posts.length === 0) return posts;

  const premiumPosts = await prisma.premiumPost.findMany({
    where: { postId: { in: posts.map((p) => p.id) } },
  });

  if (premiumPosts.length === 0) return posts;

  const premiumByPostId = new Map(premiumPosts.map((pp) => [pp.postId, pp]));

  let purchasedPremiumPostIds = new Set<string>();
  if (viewerId) {
    const purchases = await prisma.premiumPurchase.findMany({
      where: {
        userId: viewerId,
        premiumPostId: { in: premiumPosts.map((pp) => pp.id) },
        status: "COMPLETED",
      },
      select: { premiumPostId: true },
    });
    purchasedPremiumPostIds = new Set(purchases.map((p) => p.premiumPostId));
  }

  return posts.map((post) => {
    const premiumPost = premiumByPostId.get(post.id);
    if (!premiumPost) return post;

    const isOwner = viewerId != null && viewerId === post.authorId;
    const hasPurchased = purchasedPremiumPostIds.has(premiumPost.id);
    const unlocked = isOwner || hasPurchased;

    return {
      ...post,
      content: unlocked ? post.content : premiumPost.previewContent || "",
      ...(("imageUrl" in post) ? { imageUrl: unlocked ? post.imageUrl : null } : {}),
      ...(("imageUrls" in post) ? { imageUrls: unlocked ? post.imageUrls : [] } : {}),
      ...(("linkUrl" in post) ? { linkUrl: unlocked ? post.linkUrl : null } : {}),
      premiumPost: {
        id: premiumPost.id,
        price: premiumPost.price.toNumber(),
        currency: premiumPost.currency,
        previewContent: premiumPost.previewContent || "",
        locked: !unlocked,
      },
    };
  });
}
