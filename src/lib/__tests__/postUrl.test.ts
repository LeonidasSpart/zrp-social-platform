import { describe, it, expect, vi, afterEach } from "vitest";
import { getPostUrl } from "../postUrl";

describe("getPostUrl", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("builds the canonical /post/{id} URL from the current origin", () => {
    vi.stubGlobal("window", { location: { origin: "https://zrp.one" } });
    expect(getPostUrl("abc123")).toBe("https://zrp.one/post/abc123");
  });

  it("never returns the feed/current-page URL - only the post's own path", () => {
    vi.stubGlobal("window", { location: { origin: "https://zrp.one", href: "https://zrp.one/some-other-page" } });
    expect(getPostUrl("xyz789")).toBe("https://zrp.one/post/xyz789");
  });

  it("falls back to the production origin when window is unavailable (SSR)", () => {
    vi.stubGlobal("window", undefined);
    expect(getPostUrl("abc123")).toBe("https://zrp.one/post/abc123");
  });
});
