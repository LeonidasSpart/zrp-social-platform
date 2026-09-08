import { describe, it, expect } from "vitest";
import { computeMilestones } from "../milestones";

// Regression coverage for moving milestone computation out of
// src/app/profile/[username]/page.tsx (client-only, so Android and iOS
// had no way to show the same badges) and into a single shared source of
// truth the profile API now serves to every client.
describe("computeMilestones", () => {
  const monthsAgo = (n: number) => new Date(Date.now() - n * 30.44 * 24 * 60 * 60 * 1000);

  it("returns no join-date badge for an account under a month old", () => {
    const facts = computeMilestones({ createdAt: monthsAgo(0.5), postCount: 0, followerCount: 0 });
    expect(facts.find((f) => ["new_member", "six_months", "years_on_zrp"].includes(f.key))).toBeUndefined();
  });

  it("returns new_member between 1 and 6 months", () => {
    const facts = computeMilestones({ createdAt: monthsAgo(3), postCount: 0, followerCount: 0 });
    expect(facts).toContainEqual({ key: "new_member", icon: "🌱" });
  });

  it("returns six_months between 6 and 12 months, not new_member", () => {
    const facts = computeMilestones({ createdAt: monthsAgo(8), postCount: 0, followerCount: 0 });
    expect(facts).toContainEqual({ key: "six_months", icon: "🎉" });
    expect(facts.some((f) => f.key === "new_member")).toBe(false);
  });

  it("returns years_on_zrp with the correct count at 12+ months, not six_months", () => {
    const facts = computeMilestones({ createdAt: monthsAgo(30), postCount: 0, followerCount: 0 });
    expect(facts).toContainEqual({ key: "years_on_zrp", icon: "🎂", params: { n: 2 } });
    expect(facts.some((f) => f.key === "six_months")).toBe(false);
  });

  it("picks only the highest post-count tier reached", () => {
    expect(computeMilestones({ createdAt: monthsAgo(0), postCount: 9, followerCount: 0 })).not.toContainEqual(
      expect.objectContaining({ key: "posts_10" })
    );
    expect(computeMilestones({ createdAt: monthsAgo(0), postCount: 10, followerCount: 0 })).toContainEqual({
      key: "posts_10",
      icon: "✍️",
    });
    const at100 = computeMilestones({ createdAt: monthsAgo(0), postCount: 100, followerCount: 0 });
    expect(at100).toContainEqual({ key: "posts_100", icon: "📝" });
    expect(at100.some((f) => f.key === "posts_10")).toBe(false);
    const at500 = computeMilestones({ createdAt: monthsAgo(0), postCount: 500, followerCount: 0 });
    expect(at500).toContainEqual({ key: "posts_500", icon: "🏆" });
    expect(at500.some((f) => f.key === "posts_100")).toBe(false);
  });

  it("picks only the highest follower-count tier reached", () => {
    expect(computeMilestones({ createdAt: monthsAgo(0), postCount: 0, followerCount: 99 })).not.toContainEqual(
      expect.objectContaining({ key: "followers_100" })
    );
    const at100 = computeMilestones({ createdAt: monthsAgo(0), postCount: 0, followerCount: 100 });
    expect(at100).toContainEqual({ key: "followers_100", icon: "👥" });
    const at1000 = computeMilestones({ createdAt: monthsAgo(0), postCount: 0, followerCount: 1000 });
    expect(at1000).toContainEqual({ key: "followers_1k", icon: "⭐" });
    expect(at1000.some((f) => f.key === "followers_100")).toBe(false);
  });

  it("returns badges from all three categories at once, in a stable order", () => {
    const facts = computeMilestones({ createdAt: monthsAgo(24), postCount: 600, followerCount: 2000 });
    expect(facts.map((f) => f.key)).toEqual(["years_on_zrp", "posts_500", "followers_1k"]);
  });

  it("returns an empty list for a brand-new account with no activity", () => {
    expect(computeMilestones({ createdAt: new Date(), postCount: 0, followerCount: 0 })).toEqual([]);
  });
});
