import { describe, it, expect } from "vitest";
import { parseContent, getInternalPath } from "../parse-content";

describe("parseContent", () => {
  it("linkifies a bare URL - the exact Google Play URL from the user report", () => {
    const url = "https://play.google.com/store/apps/details?id=one.zrp.social";
    const parts = parseContent(`Check out the app: ${url}`);
    expect(parts).toContainEqual({ type: "url", value: url });
  });

  it("linkifies a URL with query params and no other text", () => {
    expect(parseContent("https://example.com/path?foo=bar&x=1")).toEqual([
      { type: "url", value: "https://example.com/path?foo=bar&x=1" },
    ]);
  });

  it("linkifies a URL with a fragment", () => {
    expect(parseContent("https://example.com/a#section")).toEqual([
      { type: "url", value: "https://example.com/a#section" },
    ]);
  });

  it("handles multiple URLs in one message", () => {
    const parts = parseContent("https://a.com and https://b.com");
    const urls = parts.filter((p) => p.type === "url").map((p) => p.value);
    expect(urls).toEqual(["https://a.com", "https://b.com"]);
  });

  it("strips trailing sentence punctuation from a URL without dropping it from the text", () => {
    const parts = parseContent("See https://example.com.");
    expect(parts).toContainEqual({ type: "url", value: "https://example.com" });
    expect(parts).toContainEqual({ type: "text", value: "." });
  });

  it("linkifies a bare www. URL", () => {
    expect(parseContent("visit www.example.com today")).toContainEqual({
      type: "url",
      value: "www.example.com",
    });
  });

  it("does not linkify a javascript: URI as a url part", () => {
    // The regex only ever matches a literal http(s):// or www. prefix,
    // so a javascript:/data:/vbscript: scheme can never produce a
    // ContentPart of type "url" - it stays plain text.
    const parts = parseContent("click javascript:alert(1) now");
    expect(parts.some((p) => p.type === "url")).toBe(false);
  });

  it("still detects mentions and hashtags alongside a URL", () => {
    const parts = parseContent("@alice check #zrp https://zrp.one/post/1");
    expect(parts).toContainEqual({ type: "mention", value: "@alice" });
    expect(parts).toContainEqual({ type: "hashtag", value: "#zrp" });
    expect(parts).toContainEqual({ type: "url", value: "https://zrp.one/post/1" });
  });

  it("handles a URL on its own line surrounded by other text", () => {
    const parts = parseContent("hello\nhttps://example.com\nworld");
    expect(parts).toContainEqual({ type: "url", value: "https://example.com" });
  });
});

describe("getInternalPath", () => {
  it("recognizes zrp.one as an internal route", () => {
    expect(getInternalPath("https://zrp.one/profile/alice")).toBe("/profile/alice");
  });

  it("preserves query and hash on an internal path", () => {
    expect(getInternalPath("https://zrp.one/post/123?x=1#c")).toBe("/post/123?x=1#c");
  });

  it("returns null for an external URL - the Google Play URL must stay external", () => {
    expect(getInternalPath("https://play.google.com/store/apps/details?id=one.zrp.social")).toBeNull();
  });

  it("returns null for an unrelated external domain", () => {
    expect(getInternalPath("https://example.com")).toBeNull();
  });

  it("returns null for an unparsable value", () => {
    expect(getInternalPath("not a url")).toBeNull();
  });
});
