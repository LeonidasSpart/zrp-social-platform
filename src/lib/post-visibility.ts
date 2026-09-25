import { prisma } from "@/lib/db";
import { canViewPrivateContent } from "@/lib/permissions";

/*
 * ⚠️ SECURITY: GET /api/posts/[id] hides a post that isn't published
 * (from anyone but its author) and a private account's post (from
 * anyone but the owner and approved followers). The interaction routes
 * - bookmark, repost, comment, reaction - only checked that the post
 * id existed, and several of them then SURFACE that post's content
 * somewhere the read check never runs: a bookmark shows up in
 * GET /api/bookmarks with the full post, a repost in the reposter's
 * public reposts tab. So anyone holding a private or scheduled post's
 * id could read it by bookmarking it, or republish it to the world by
 * reposting it. This is the same visibility rule as the single-post
 * read, applied before the interaction is allowed to form.
 *
 * Blocked-either-way is deliberately NOT folded in here: each route
 * already has its own block check with its own established error
 * message.
 */
export async function isPostVisibleTo(
  viewerId: string,
  post: { authorId: string; status: string; author: { isPrivate: boolean } }
): Promise<boolean> {
  if (post.authorId === viewerId) return true;
  if (post.status !== "published") return false;
  return canViewPrivateContent(viewerId, post.authorId, post.author.isPrivate);
}

/** Loads a post and returns it only if `viewerId` may see it. */
export async function findVisiblePost(viewerId: string, postId: string) {
  const post = await prisma.post.findUnique({
    where: { id: postId },
    select: {
      id: true,
      authorId: true,
      status: true,
      commentsEnabled: true,
      author: { select: { isPrivate: true } },
    },
  });
  if (!post) return null;
  return (await isPostVisibleTo(viewerId, post)) ? post : null;
}
