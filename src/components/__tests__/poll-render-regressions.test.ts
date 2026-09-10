import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

/**
 * Structural regression guard for poll publishing on Web/PWA/tablet.
 *
 * The backend pipeline for polls (create, store, feed selection, vote,
 * vote persistence) was already correct end-to-end. The actual bug was
 * that PostCard.tsx - the single component every post-listing page
 * (home feed, explore, profile, search, hashtag, bookmarks, single post)
 * renders posts through - never imported or rendered the existing,
 * working Poll.tsx component at all, and its post prop type didn't even
 * declare a `poll` field. A user could publish a poll, it would save and
 * be voteable via a direct API call, but it would never appear as a poll
 * anywhere in the UI - indistinguishable from a post that never had one.
 *
 * vitest here runs with environment: "node" (see vitest.config.ts), so
 * there is no DOM to render into and this asserts on the source instead,
 * matching the established pattern in profile-regressions.test.ts.
 */

const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), "utf8");

const POST_CARD = "src/components/PostCard.tsx";

describe("PostCard renders polls", () => {
  const src = read(POST_CARD);

  it("imports the Poll component", () => {
    expect(src).toMatch(/import Poll from ["']\.\/Poll["']/);
  });

  it("declares a poll field on its post prop type", () => {
    const idx = src.indexOf("interface PostCardProps");
    expect(idx).toBeGreaterThan(-1);
    const block = src.slice(idx, idx + 3000);
    expect(block).toContain("poll?:");
  });

  it("renders <Poll> when the post has a poll, passing the pollId/question/options/votes", () => {
    const idx = src.indexOf("{/* POLL */}");
    expect(idx).toBeGreaterThan(-1);
    const block = src.slice(idx, idx + 600);
    expect(block).toContain("post.poll &&");
    expect(block).toContain("<Poll");
    expect(block).toContain("pollId={post.poll.id}");
    expect(block).toContain("question={post.poll.question}");
    expect(block).toContain("options={post.poll.options}");
    expect(block).toContain("votes={post.poll.votes || {}}");
  });

  it("resolves the viewer's own vote from either API shape (userVote or votes_user)", () => {
    // /api/posts/[id] (the single-post page) collapses votes_user into a
    // plain userVote: number | null and deletes votes_user entirely,
    // while every feed/list endpoint (/api/posts, /api/posts/explore,
    // profile/likes/reposts/search/hashtag) keeps the raw
    // votes_user: [{optionIndex}] relation. Both must resolve to the
    // right selected option or the single-post page would show a poll
    // that always looks unvoted.
    const idx = src.indexOf("{/* POLL */}");
    const block = src.slice(idx, idx + 600);
    expect(block).toContain("post.poll.userVote");
    expect(block).toContain("post.poll.votes_user?.[0]?.optionIndex");
  });

  it("refreshes the post after a vote instead of leaving stale vote counts", () => {
    const idx = src.indexOf("{/* POLL */}");
    const block = src.slice(idx, idx + 600);
    expect(block).toMatch(/onVote=\{\(\)\s*=>\s*onUpdate\(\)\}/);
  });
});
