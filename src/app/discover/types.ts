/**
 * Client-side types for the ZRP Discover Vertical page
 * (src/app/discover/page.tsx and src/components/discover/). Deliberately
 * separate from src/lib/discover/types.ts (the server-side DiscoverFeedItem
 * contract, imported by route handlers that also pull in `prisma`) -
 * nothing under src/app or src/components should import a server-only
 * module, even just for a type. This file mirrors the wire shape returned
 * by GET /api/discover and layers the extra client-only, per-session UI
 * state on top (follow-button state, live progress for the on-screen
 * progress bar, and whether the viewer is the author).
 */

export type FollowState = "none" | "following" | "requested";

export interface DiscoverFeedItemDTO {
  id: string;
  author: {
    id: string;
    username: string;
    name: string | null;
    avatarUrl: string | null;
    badgeType: string | null;
  };
  media: {
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
  premiumPost?: {
    id: string;
    price: number;
    currency: string;
    previewContent: string;
    locked: boolean;
  };
}

export interface DiscoverClientItem extends DiscoverFeedItemDTO {
  followState: FollowState;
  isOwnPost: boolean;
  /** 0-100, driven by the active slide's real <video> timeupdate. */
  progressPct?: number;
}

export interface DiscoverFeedPageDTO {
  items: DiscoverFeedItemDTO[];
  nextCursor: string | null;
}
