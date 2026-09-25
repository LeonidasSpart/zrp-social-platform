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
  // An ARTICLE post's full text lives in `body`, not `content` - any
  // post type can be made pay-per-view, and every route that uses
  // `include` (or selects `body`) returns it.
  body?: string | null;
  // A quote-post can itself be gated independently of the post quoting
  // it. Several routes `include: { quotePost: { include: { author, ... } } }`,
  // which returns the quoted post's own scalar fields (content,
  // imageUrl(s), linkUrl, authorId) in full - see the N5 note below for
  // why this can't be left to the caller.
  quotePost?: GateablePost | null;
};

/*
 * ⚠️ SECURITY (N5 follow-up): this used to only redact the TOP-LEVEL
 * post passed in, never a nested `quotePost` - so a quote-post that was
 * itself premium-gated leaked its full content/media through every
 * route that includes `quotePost` (post detail, feed, explore, search,
 * hashtag, profile/user post lists, the quotes listing), regardless of
 * whether the viewer had purchased THAT quoted post. Gating now recurses
 * into `quotePost` once (Prisma's own `include` shape here never nests
 * a second level - a quote-of-a-quote - so this naturally terminates).
 */
// Recursively adds `premiumPost` to a gated post AND, if present, to
// its nested `quotePost` - a plain `T & { premiumPost? }` return type
// loses that nested field's shape (TypeScript widens it back to
// GateablePost's own declared `quotePost?: GateablePost | null`), which
// would make a caller's own type-checked access to
// `result.quotePost.premiumPost` fail even though the value is
// genuinely there at runtime.
type Gated<T extends GateablePost> = Omit<T, "quotePost"> & {
  premiumPost?: PremiumGateSummary;
  quotePost?: T["quotePost"] extends GateablePost | null | undefined
    ? T["quotePost"] extends null | undefined
      ? T["quotePost"]
      : Gated<NonNullable<T["quotePost"]>>
    : T["quotePost"];
};

export async function applyPremiumGating<T extends GateablePost>(
  posts: T[],
  viewerId: string | null | undefined
): Promise<Gated<T>[]> {
  if (posts.length === 0) return posts as unknown as Gated<T>[];

  const allIds: string[] = [];
  for (const post of posts) {
    allIds.push(post.id);
    if (post.quotePost) allIds.push(post.quotePost.id);
  }

  const premiumPosts = await prisma.premiumPost.findMany({
    where: { postId: { in: allIds } },
  });

  if (premiumPosts.length === 0) return posts as unknown as Gated<T>[];

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

  function gateOne<P extends GateablePost>(post: P): Gated<P> {
    const gatedQuotePost = post.quotePost ? gateOne(post.quotePost) : post.quotePost;
    const premiumPost = premiumByPostId.get(post.id);

    if (!premiumPost) {
      return { ...post, quotePost: gatedQuotePost } as unknown as Gated<P>;
    }

    const isOwner = viewerId != null && viewerId === post.authorId;
    const hasPurchased = purchasedPremiumPostIds.has(premiumPost.id);
    const unlocked = isOwner || hasPurchased;

    return {
      ...post,
      quotePost: gatedQuotePost,
      content: unlocked ? post.content : premiumPost.previewContent || "",
      ...(("imageUrl" in post) ? { imageUrl: unlocked ? post.imageUrl : null } : {}),
      ...(("imageUrls" in post) ? { imageUrls: unlocked ? post.imageUrls : [] } : {}),
      ...(("linkUrl" in post) ? { linkUrl: unlocked ? post.linkUrl : null } : {}),
      // ⚠️ SECURITY: a premium ARTICLE's real content is its `body` -
      // redacting only `content` left the whole paid article readable.
      ...(("body" in post) ? { body: unlocked ? post.body : null } : {}),
      premiumPost: {
        id: premiumPost.id,
        price: premiumPost.price.toNumber(),
        currency: premiumPost.currency,
        previewContent: premiumPost.previewContent || "",
        locked: !unlocked,
      },
    } as unknown as Gated<P>;
  }

  return posts.map(gateOne) as Gated<T>[];
}

type AuthoredPost = {
  author: { id: string };
  quotePost?: AuthoredPost | null;
};

/**
 * Some shared `select` shapes (e.g. POST_CARD_SELECT in
 * src/lib/post-card-feed.ts, used by Communities/Lists feeds) only
 * carry the author as a nested relation (`author.id`), not a raw
 * `authorId` scalar - applyPremiumGating needs the latter for its
 * owner check. Adds it (recursively, into `quotePost` too) without
 * requiring the caller's shared select shape to change.
 */
export function withAuthorId<T extends AuthoredPost>(
  post: T
): T & { authorId: string; quotePost?: (T["quotePost"] & { authorId: string }) | null } {
  return {
    ...post,
    authorId: post.author.id,
    quotePost: post.quotePost ? withAuthorId(post.quotePost) : post.quotePost,
  } as T & { authorId: string; quotePost?: (T["quotePost"] & { authorId: string }) | null };
}

/** Inverse of withAuthorId - strips the `authorId` it added back out before the response is sent, so the response shape is unchanged. */
export function withoutAuthorId<T extends { authorId: string; quotePost?: unknown }>(
  post: T
): Omit<T, "authorId"> {
  const { authorId: _authorId, quotePost, ...rest } = post;
  return {
    ...rest,
    ...(quotePost !== undefined
      ? { quotePost: quotePost ? withoutAuthorId(quotePost as T) : quotePost }
      : {}),
  } as Omit<T, "authorId">;
}
