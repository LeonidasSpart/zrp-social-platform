// Classifies a URL found in user text as one of ZRP's own linkable
// entities, so a link to a post or a profile can be rendered as a real
// in-app card (built from the live /api/posts/[id] and
// /api/users/[username] data) instead of being handed to the generic
// OG-scraping /api/link-preview route. That route can never unfurl an
// internal link: in development the server's own origin is loopback and
// the SSRF guard rejects it outright, and in production it would mean
// the server fetching its own public page to scrape metadata it already
// owns. Pure and dependency-free so it's unit-testable.
import { getInternalPath } from "@/lib/parse-content";

export type InternalLink =
  | { kind: "post"; id: string; path: string }
  | { kind: "profile"; username: string; path: string }
  | { kind: "other"; path: string };

const POST_PATH = /^\/post\/([A-Za-z0-9_-]+)\/?$/;
// Reserved top-level routes that would otherwise parse as /profile/x are
// not a concern: profiles always live under /profile/<username>.
const PROFILE_PATH = /^\/profile\/([A-Za-z0-9_.-]+)\/?$/;

export function classifyInternalLink(url: string): InternalLink | null {
  const internalPath = getInternalPath(url);
  if (!internalPath) return null;

  // Strip query/hash - a shared post URL can carry tracking params or a
  // #comment anchor and still name the same post.
  const path = internalPath.split(/[?#]/)[0];

  const post = path.match(POST_PATH);
  if (post) return { kind: "post", id: post[1], path: internalPath };

  const profile = path.match(PROFILE_PATH);
  if (profile) return { kind: "profile", username: profile[1], path: internalPath };

  return { kind: "other", path: internalPath };
}
