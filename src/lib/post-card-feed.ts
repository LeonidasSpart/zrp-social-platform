import { prisma } from "@/lib/db";

// Shared Prisma `select` shape for any feed that renders ZRP's standard
// PostCard (web) - matches src/app/api/posts/explore/route.ts's select
// field-for-field so a Communities/Lists feed post looks and behaves
// exactly like a For You/Following post, not a stripped-down copy.
export const POST_CARD_SELECT = {
  id: true,
  content: true,
  imageUrl: true,
  imageUrls: true,
  mediaType: true,
  createdAt: true,
  views: true,
  isPoll: true,
  poll: {
    select: {
      id: true,
      question: true,
      options: true,
      votes: true,
      expiresAt: true,
    },
  },
  author: {
    select: {
      id: true,
      username: true,
      name: true,
      avatarUrl: true,
      badgeType: true,
    },
  },
  quotePost: {
    select: {
      id: true,
      content: true,
      imageUrl: true,
      imageUrls: true,
      mediaType: true,
      createdAt: true,
      author: {
        select: {
          id: true,
          username: true,
          name: true,
          avatarUrl: true,
          badgeType: true,
        },
      },
      _count: {
        select: { likes: true, comments: true, reposts: true, quotedBy: true },
      },
    },
  },
  _count: {
    select: { likes: true, comments: true, reposts: true, quotedBy: true },
  },
} as const;

/**
 * Attaches the viewer's own like + poll-vote state to a page of posts,
 * always computed fresh (never cached) - same reasoning as the explore
 * route: a viewer's own reaction must never wait out a cache window.
 * Mutates and returns `posts` for convenient chaining.
 */
export async function attachViewerState(posts: any[], userId: string | null | undefined) {
  if (!userId || posts.length === 0) return posts;

  const postIds = posts.map((p) => p.id);
  const likes = await prisma.like.findMany({
    where: { userId, postId: { in: postIds } },
    select: { postId: true },
  });
  const likedIds = new Set(likes.map((l) => l.postId));
  posts.forEach((p) => (p.liked = likedIds.has(p.id)));

  const pollIds = posts.filter((p) => p.poll).map((p) => p.poll.id);
  if (pollIds.length > 0) {
    const votes = await prisma.pollVote.findMany({
      where: { userId, pollId: { in: pollIds } },
      select: { pollId: true, optionIndex: true },
    });
    const votesByPoll = new Map(votes.map((v) => [v.pollId, v]));
    posts.forEach((p) => {
      if (p.poll) {
        const vote = votesByPoll.get(p.poll.id);
        p.poll.votes_user = vote ? [{ optionIndex: vote.optionIndex }] : [];
      }
    });
  }

  return posts;
}
