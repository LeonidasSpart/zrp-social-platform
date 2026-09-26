import { describe, it, expect } from "vitest";
import { classifyInternalLink } from "../link-preview-internal";

// vitest runs in the node environment here: there is no `window`, so
// only the KNOWN_APP_HOSTS branch of getInternalPath applies (zrp.one).
// The same-origin branch (localhost/staging) is what the browser uses
// and is exercised by the live DM check documented in the fix report.
describe("classifyInternalLink", () => {
  it("recognises a shared post URL", () => {
    expect(classifyInternalLink("https://zrp.one/post/p_1")).toEqual({
      kind: "post",
      id: "p_1",
      path: "/post/p_1",
    });
  });

  it("keeps query/hash out of the id but preserves them in the path", () => {
    const r = classifyInternalLink("https://www.zrp.one/post/clx123abc?utm=dm#comments");
    expect(r).toEqual({ kind: "post", id: "clx123abc", path: "/post/clx123abc?utm=dm#comments" });
  });

  it("recognises a profile URL", () => {
    expect(classifyInternalLink("https://zrp.one/profile/alice")).toEqual({
      kind: "profile",
      username: "alice",
      path: "/profile/alice",
    });
  });

  it("does not treat a post sub-page (quotes/reposts) as the post itself", () => {
    expect(classifyInternalLink("https://zrp.one/post/p_1/quotes")).toEqual({
      kind: "other",
      path: "/post/p_1/quotes",
    });
  });

  it("classifies any other ZRP page as 'other' (no card, plain link)", () => {
    expect(classifyInternalLink("https://zrp.one/hashtag/zrp")).toEqual({ kind: "other", path: "/hashtag/zrp" });
    expect(classifyInternalLink("https://zrp.one")).toEqual({ kind: "other", path: "/" });
  });

  it("returns null for an external URL", () => {
    expect(classifyInternalLink("https://en.wikipedia.org/wiki/Cat")).toBeNull();
    expect(classifyInternalLink("https://zrp.one.evil.com/post/p_1")).toBeNull();
  });

  it("rejects a post id containing path-traversal or unsafe characters", () => {
    expect(classifyInternalLink("https://zrp.one/post/..%2Fadmin")).toEqual({
      kind: "other",
      path: "/post/..%2Fadmin",
    });
  });
});
