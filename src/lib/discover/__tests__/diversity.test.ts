import { describe, it, expect } from "vitest";
import { diversifyByCreator } from "../diversity";
import type { ScoredDiscoverPost } from "../types";

function scored(id: string, authorId: string, score: number): ScoredDiscoverPost {
  return {
    id,
    content: "caption",
    imageUrl: "https://cdn.example.com/video.mp4",
    mediaType: "video",
    createdAt: new Date(),
    views: 0,
    commentsEnabled: true,
    authorId,
    author: { id: authorId, username: authorId, name: null, avatarUrl: null, badgeType: null },
    _count: { likes: 0, comments: 0, reposts: 0, bookmarks: 0 },
    score,
  };
}

describe("Discover creator diversity pass", () => {
  it("never repeats a consecutive author when a later, different-author item exists within the lookahead window", () => {
    // Creator A dominates the top of the ranking (6 posts back-to-back);
    // Creator B has exactly one post buried at the bottom.
    const ranked = [
      scored("a1", "creatorA", 100),
      scored("a2", "creatorA", 99),
      scored("a3", "creatorA", 98),
      scored("b1", "creatorB", 10),
      scored("a4", "creatorA", 97),
    ];

    const diversified = diversifyByCreator(ranked);

    for (let i = 1; i < diversified.length; i++) {
      if (diversified[i].authorId === diversified[i - 1].authorId) {
        // A repeat is only acceptable if literally every later item is
        // also that same author (i.e. there was truly no alternative).
        const rest = diversified.slice(i);
        expect(rest.every((p) => p.authorId === diversified[i].authorId)).toBe(true);
      }
    }
  });

  it("pulls the diversifying item forward without dropping or duplicating anything", () => {
    const ranked = [scored("a1", "creatorA", 3), scored("a2", "creatorA", 2), scored("b1", "creatorB", 1)];

    const diversified = diversifyByCreator(ranked);

    expect(diversified.map((p) => p.id).sort()).toEqual(["a1", "a2", "b1"]);
    expect(diversified[0].id).toBe("a1");
    expect(diversified[1].id).toBe("b1"); // pulled forward ahead of the a1/a2 repeat
    expect(diversified[2].id).toBe("a2");
  });

  it("allows a same-author repeat rather than starving the feed when no alternative exists anywhere", () => {
    const ranked = [scored("a1", "creatorA", 3), scored("a2", "creatorA", 2), scored("a3", "creatorA", 1)];

    const diversified = diversifyByCreator(ranked);

    expect(diversified.map((p) => p.id)).toEqual(["a1", "a2", "a3"]);
  });

  it("does not reorder anything when there is no repeat to fix", () => {
    const ranked = [scored("a1", "creatorA", 3), scored("b1", "creatorB", 2), scored("c1", "creatorC", 1)];

    expect(diversifyByCreator(ranked).map((p) => p.id)).toEqual(["a1", "b1", "c1"]);
  });

  it("handles empty and single-item lists", () => {
    expect(diversifyByCreator([])).toEqual([]);
    const single = [scored("a1", "creatorA", 1)];
    expect(diversifyByCreator(single)).toEqual(single);
  });

  it("is a pure reordering: same set size in, same set size out, for a larger mixed pool", () => {
    const ranked = [
      scored("a1", "creatorA", 10),
      scored("a2", "creatorA", 9),
      scored("a3", "creatorA", 8),
      scored("b1", "creatorB", 7),
      scored("a4", "creatorA", 6),
      scored("c1", "creatorC", 5),
      scored("a5", "creatorA", 4),
      scored("b2", "creatorB", 3),
    ];

    const diversified = diversifyByCreator(ranked);

    expect(diversified).toHaveLength(ranked.length);
    expect(diversified.map((p) => p.id).sort()).toEqual(ranked.map((p) => p.id).sort());
  });
});
