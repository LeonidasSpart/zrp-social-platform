import { describe, it, expect } from "vitest";
import { parseOwnPostsResponse } from "../parse-own-posts";

describe("parseOwnPostsResponse", () => {
  it("reads posts from the real { items, nextCursor } response shape", () => {
    const data = {
      items: [{ id: "p1", content: "hello", imageUrl: null, imageUrls: [] }],
      nextCursor: null,
    };
    expect(parseOwnPostsResponse(data)).toEqual(data.items);
  });

  // This is the exact regression this helper exists to prevent: the old
  // `data.posts || data || []` fell through to the whole response object
  // once `data.posts` was undefined (this endpoint has no `posts` key),
  // handing the caller a non-array that crashed the first `.map()` over it.
  it("never falls through to the raw response object when the expected key is absent", () => {
    const data = { items: [{ id: "p1", content: "hi", imageUrl: null, imageUrls: [] }], nextCursor: "abc" };
    const result = parseOwnPostsResponse(data);
    expect(Array.isArray(result)).toBe(true);
    expect(result).not.toBe(data);
  });

  it("falls back to an empty array for a shape with no items array", () => {
    expect(parseOwnPostsResponse({ posts: [{ id: "p1" }] })).toEqual([]);
    expect(parseOwnPostsResponse({})).toEqual([]);
    expect(parseOwnPostsResponse(null)).toEqual([]);
    expect(parseOwnPostsResponse(undefined)).toEqual([]);
  });
});
