import { describe, it, expect } from "vitest";
import { belongsInVideoFeed, isLockedPremiumVideoPost } from "../video-feed";

describe("isLockedPremiumVideoPost", () => {
  it("is true only when premiumPost.locked is exactly true", () => {
    expect(isLockedPremiumVideoPost({ premiumPost: { locked: true } })).toBe(true);
    expect(isLockedPremiumVideoPost({ premiumPost: { locked: false } })).toBe(false);
    expect(isLockedPremiumVideoPost({ premiumPost: null })).toBe(false);
    expect(isLockedPremiumVideoPost({})).toBe(false);
  });
});

describe("belongsInVideoFeed", () => {
  it("keeps an ordinary post with a real media URL", () => {
    expect(belongsInVideoFeed({ imageUrl: "https://cdn.example/a.mp4" })).toBe(true);
  });

  it("drops a post with no media and no premium gate (never a real video)", () => {
    expect(belongsInVideoFeed({ imageUrl: null })).toBe(false);
    expect(belongsInVideoFeed({})).toBe(false);
  });

  // ⚠️ SECURITY/UX regression guard: applyPremiumGating() (see
  // src/lib/premium-content.ts, wired into GET /api/videos) redacts
  // imageUrl to null for a locked pay-per-view video. Before this helper
  // existed, both video surfaces treated "no imageUrl" as "not a real
  // video" and silently dropped these posts from the feed entirely -
  // which was SAFE (no leaked media URL) but indistinguishable from the
  // post simply not existing. This is the regression test for keeping
  // it in the feed instead so a locked-state slide can render.
  it("keeps a locked premium post even though imageUrl was redacted to null", () => {
    expect(
      belongsInVideoFeed({ imageUrl: null, premiumPost: { locked: true } })
    ).toBe(true);
  });

  it("drops a premium post the viewer has unlocked but that still has no media for some other reason", () => {
    expect(
      belongsInVideoFeed({ imageUrl: null, premiumPost: { locked: false } })
    ).toBe(false);
  });
});
