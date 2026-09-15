/**
 * Shared types for the ZRP Discover backend (src/lib/discover/). See
 * docs/discover-backend.md for the architecture this supports:
 * DiscoverCandidateService -> DiscoverRankingService -> creator
 * diversity -> DiscoverFeedService (pagination + viewer-state hydration)
 * -> GET /api/discover. DiscoverEvent* below is the separate watch-event
 * side, handled by DiscoverEventService (./events.ts).
 */

/** Exactly the fields DiscoverCandidateService selects off `Post`. */
export interface DiscoverCandidatePost {
  id: string;
  content: string;
  imageUrl: string | null;
  mediaType: string | null;
  createdAt: Date;
  views: number;
  commentsEnabled: boolean;
  authorId: string;
  author: {
    id: string;
    username: string;
    name: string | null;
    avatarUrl: string | null;
    badgeType: string | null;
  };
  _count: {
    likes: number;
    comments: number;
    reposts: number;
    bookmarks: number;
  };
}

/** A candidate once DiscoverRankingService has scored it. */
export interface ScoredDiscoverPost extends DiscoverCandidatePost {
  score: number;
}

/**
 * The public response shape for one Discover feed item - see "API" in
 * docs/discover-backend.md for the full contract. `audio` is modeled
 * now but always null in V1 (see that doc's "Audio / music" section):
 * there is no attachment between a Post and a MusicTrack today, so
 * there is nothing real to populate it with yet, but a client can
 * already branch on its presence without a future breaking change.
 */
export interface DiscoverFeedItem {
  id: string;
  author: {
    id: string;
    username: string;
    name: string | null;
    avatarUrl: string | null;
    badgeType: string | null;
  };
  media: {
    // Nullable - not a normal-content case, only a locked pay-per-view
    // item: applyPremiumGating (src/lib/premium-content.ts) replaces
    // imageUrl with null for a premium post the viewer hasn't
    // purchased, and this is the one field DiscoverFeedItem carries
    // that value through into (rather than defaulting it back to a
    // placeholder string), so a client never receives the real video
    // URL for content it hasn't paid for.
    url: string | null;
    type: "video";
  };
  caption: string;
  audio: null;
  stats: {
    likes: number;
    comments: number;
    reposts: number;
    saves: number;
    views: number;
  };
  viewerState: {
    liked: boolean;
    saved: boolean;
    reposted: boolean;
    followsAuthor: boolean;
  };
  commentsEnabled: boolean;
  createdAt: string;
  // "recent" | "popular" - the real, honest reason this item ranked
  // where it did (DiscoverRankingService.getDiscoverReason), shown by
  // the client's "Why am I seeing this?" affordance. Never a
  // fabricated personalization reason - scoreCandidate() has no follow/
  // watch-history signal to honestly claim either of those yet.
  reason: "recent" | "popular";
  // Present only when premium-gated content redacted this item - same
  // shape applyPremiumGating attaches everywhere else (src/lib/premium-content.ts).
  premiumPost?: {
    id: string;
    price: number;
    currency: string;
    previewContent: string;
    locked: boolean;
  };
}

export interface DiscoverFeedPage {
  items: DiscoverFeedItem[];
  nextCursor: string | null;
}
