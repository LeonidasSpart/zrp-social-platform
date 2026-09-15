export interface OwnPostSummary {
  id: string;
  content: string;
  imageUrl: string | null;
  imageUrls: string[];
}

// GET /api/users/[username]/posts responds with { items, nextCursor } -
// unlike every other posts-list endpoint in this app (/api/posts,
// /api/posts/explore, /api/search, community/list feeds), which all
// respond with { posts, nextCursor }. A bare `data.posts || data || []`
// against this endpoint's real shape falls through to the whole (truthy)
// response object once `data.posts` is undefined, handing the caller a
// non-array and crashing the first `.map()` over it. Always go through
// this helper instead of re-deriving the fallback chain at each call site.
export function parseOwnPostsResponse(data: unknown): OwnPostSummary[] {
  if (data && typeof data === "object" && Array.isArray((data as { items?: unknown }).items)) {
    return (data as { items: OwnPostSummary[] }).items;
  }
  return [];
}
