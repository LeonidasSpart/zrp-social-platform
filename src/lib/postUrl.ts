/**
 * The single canonical URL builder for an individual post - see
 * src/app/post/[id]/page.tsx and layout.tsx for the route this points
 * at. Every share/copy-link surface (PostCard's Share button, its
 * three-dot menu's Copy Link, and the internal "Send in Message" flow)
 * must build the URL through this function rather than reading
 * `window.location.href` (wrong on any page other than the post's own,
 * e.g. the feed) or hand-rolling `${origin}/post/${id}` inline, which is
 * exactly the drift that previously produced three divergent
 * implementations (PostCard.tsx, Post/PostActions.tsx, CommentItem.tsx).
 */
export function getPostUrl(postId: string): string {
  const origin =
    typeof window !== "undefined" ? window.location.origin : "https://zrp.one";
  return `${origin}/post/${postId}`;
}
