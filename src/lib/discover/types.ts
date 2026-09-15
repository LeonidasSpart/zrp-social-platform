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
    url: string;
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
