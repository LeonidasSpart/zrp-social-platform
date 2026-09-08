// Real profile milestones ("years on ZRP", post-count and follower-count
// badges), computed once here from real account data instead of being
// duplicated per client. This used to live only in
// src/app/profile/[username]/page.tsx as a client-side function - not
// wrong data, but logic that would need to be reimplemented identically
// in Android and iOS (thresholds, icons, and the if/else-if precedence
// between tiers) to avoid the three clients silently disagreeing on
// which badges a profile has earned.
//
// Localization stays client-side, same as Trust Passport: each fact is a
// stable `key` (never a rendered string) plus whatever numeric `params`
// its label needs, so every client's own translation table decides the
// actual wording. `icon` is included directly since an emoji carries no
// language dependency - there's nothing for a client to localize there.
export interface MilestoneFact {
  key: string;
  icon: string;
  params?: Record<string, number>;
}

export function computeMilestones(input: {
  createdAt: Date | string;
  postCount: number;
  followerCount: number;
}): MilestoneFact[] {
  const facts: MilestoneFact[] = [];

  const joined = new Date(input.createdAt);
  const monthsSinceJoin = (Date.now() - joined.getTime()) / (1000 * 60 * 60 * 24 * 30.44);

  if (monthsSinceJoin >= 12) {
    facts.push({ key: "years_on_zrp", icon: "🎂", params: { n: Math.floor(monthsSinceJoin / 12) } });
  } else if (monthsSinceJoin >= 6) {
    facts.push({ key: "six_months", icon: "🎉" });
  } else if (monthsSinceJoin >= 1) {
    facts.push({ key: "new_member", icon: "🌱" });
  }

  if (input.postCount >= 500) {
    facts.push({ key: "posts_500", icon: "🏆" });
  } else if (input.postCount >= 100) {
    facts.push({ key: "posts_100", icon: "📝" });
  } else if (input.postCount >= 10) {
    facts.push({ key: "posts_10", icon: "✍️" });
  }

  if (input.followerCount >= 1000) {
    facts.push({ key: "followers_1k", icon: "⭐" });
  } else if (input.followerCount >= 100) {
    facts.push({ key: "followers_100", icon: "👥" });
  }

  return facts;
}
