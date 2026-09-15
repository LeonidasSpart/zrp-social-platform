import { describe, it, expect } from "vitest";
import { scoreCandidate, rankCandidates, getDiscoverReason } from "../ranking";
import type { DiscoverCandidatePost } from "../types";

function candidate(overrides: Partial<DiscoverCandidatePost> & { id: string }): DiscoverCandidatePost {
  return {
    content: "caption",
    imageUrl: "https://cdn.example.com/video.mp4",
    mediaType: "video",
    createdAt: new Date(),
    views: 0,
    commentsEnabled: true,
    authorId: `author-${overrides.id}`,
    author: {
      id: `author-${overrides.id}`,
      username: `user${overrides.id}`,
      name: null,
      avatarUrl: null,
      badgeType: null,
    },
    _count: { likes: 0, comments: 0, reposts: 0, bookmarks: 0 },
    ...overrides,
  };
}

const NOW = Date.parse("2026-09-15T12:00:00.000Z");
const hoursAgo = (h: number) => new Date(NOW - h * 60 * 60 * 1000);

describe("DiscoverRankingService", () => {
  it("scores a fresh post with engagement higher than an old post with the same engagement", () => {
    const fresh = candidate({ id: "fresh", createdAt: hoursAgo(0.5), _count: { likes: 10, comments: 0, reposts: 0, bookmarks: 0 } });
    const old = candidate({ id: "old", createdAt: hoursAgo(48), _count: { likes: 10, comments: 0, reposts: 0, bookmarks: 0 } });

    expect(scoreCandidate(fresh, NOW)).toBeGreaterThan(scoreCandidate(old, NOW));
  });

  it("weights reposts > comments > likes for equal-age posts", () => {
    const likedOnly = candidate({ id: "liked", createdAt: hoursAgo(1), _count: { likes: 10, comments: 0, reposts: 0, bookmarks: 0 } });
    const commentedOnly = candidate({ id: "commented", createdAt: hoursAgo(1), _count: { likes: 0, comments: 10, reposts: 0, bookmarks: 0 } });
    const repostedOnly = candidate({ id: "reposted", createdAt: hoursAgo(1), _count: { likes: 0, comments: 0, reposts: 10, bookmarks: 0 } });

    const likedScore = scoreCandidate(likedOnly, NOW);
    const commentedScore = scoreCandidate(commentedOnly, NOW);
    const repostedScore = scoreCandidate(repostedOnly, NOW);

    expect(repostedScore).toBeGreaterThan(commentedScore);
    expect(commentedScore).toBeGreaterThan(likedScore);
  });

  it("does not let raw view count alone dominate: a 100x view gap scores nowhere near 100x", () => {
    const lowViews = candidate({ id: "low", createdAt: hoursAgo(1), views: 100 });
    const highViews = candidate({ id: "high", createdAt: hoursAgo(1), views: 10_000 });

    const lowScore = scoreCandidate(lowViews, NOW);
    const highScore = scoreCandidate(highViews, NOW);

    expect(highScore).toBeGreaterThan(lowScore);
    // log1p-scaled, so the ratio must be far below the raw view-count ratio (100x).
    expect(highScore / Math.max(lowScore, 1e-9)).toBeLessThan(10);
  });

  it("rankCandidates sorts descending by score and never drops or duplicates a candidate", () => {
    const posts = [
      candidate({ id: "a", createdAt: hoursAgo(10), _count: { likes: 1, comments: 0, reposts: 0, bookmarks: 0 } }),
      candidate({ id: "b", createdAt: hoursAgo(1), _count: { likes: 50, comments: 0, reposts: 0, bookmarks: 0 } }),
      candidate({ id: "c", createdAt: hoursAgo(5), _count: { likes: 5, comments: 0, reposts: 0, bookmarks: 0 } }),
    ];

    const ranked = rankCandidates(posts);

    expect(ranked.map((p) => p.id).sort()).toEqual(["a", "b", "c"]);
    expect(ranked[0].id).toBe("b");
    for (let i = 1; i < ranked.length; i++) {
      expect(ranked[i - 1].score).toBeGreaterThanOrEqual(ranked[i].score);
    }
  });

  it("breaks score ties by preserving the original (DB createdAt-desc) order deterministically", () => {
    const posts = [
      candidate({ id: "first", createdAt: hoursAgo(1) }),
      candidate({ id: "second", createdAt: hoursAgo(1) }),
      candidate({ id: "third", createdAt: hoursAgo(1) }),
    ];

    const ranked1 = rankCandidates(posts).map((p) => p.id);
    const ranked2 = rankCandidates(posts).map((p) => p.id);

    expect(ranked1).toEqual(["first", "second", "third"]);
    expect(ranked1).toEqual(ranked2);
  });
});

describe("getDiscoverReason", () => {
  it("returns 'recent' for a post younger than the threshold", () => {
    const post = candidate({ id: "fresh", createdAt: hoursAgo(1) });
    expect(getDiscoverReason(post, NOW)).toBe("recent");
  });

  it("returns 'popular' for a post older than the threshold - it can only rank this high on real engagement", () => {
    const post = candidate({ id: "old", createdAt: hoursAgo(48) });
    expect(getDiscoverReason(post, NOW)).toBe("popular");
  });

  it("never returns a third, fabricated reason - always exactly 'recent' or 'popular'", () => {
    const posts = [
      candidate({ id: "a", createdAt: hoursAgo(0) }),
      candidate({ id: "b", createdAt: hoursAgo(6) }),
      candidate({ id: "c", createdAt: hoursAgo(1000) }),
    ];
    for (const post of posts) {
      expect(["recent", "popular"]).toContain(getDiscoverReason(post, NOW));
    }
  });
});
