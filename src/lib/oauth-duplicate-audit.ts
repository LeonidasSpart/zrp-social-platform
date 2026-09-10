import { prisma } from "./db";

/*
 * ============================================================
 * Read-only audit: accounts that differ only by email case
 * ============================================================
 *
 * Background: User.email is a case-sensitive unique key. Until commit
 * f85d193 registration stored the address as typed, while every lookup
 * lowercased it first; and until the auth regression fix the Google /
 * Apple link step did an exact lookup on the lowercased address, so an
 * existing "Leo@Example.com" was not found and a SECOND account
 * "leo@example.com" was created for the same person (password null,
 * emailVerified set, onboardingCompleted false - the exact shape
 * findOrCreateOAuthUser's create path writes).
 *
 * This module answers "how many, which, and what is on them" with
 * SELECT/COUNT queries only. It never writes, never returns an email
 * address, a name, a password hash or any token. Account ids (opaque
 * cuids) are included so a reviewer can act on a specific group; every
 * other field is a count or a boolean.
 */

export type DuplicateOrigin =
  | "oauth-link-miss" // newer row: no password, verified email, lowercase of an older mixed-case row
  | "pre-normalization-register" // newer row has its own password: a second registration slipped past the exact-match check
  | "other";

export interface MemberDataProfile {
  content: number; // posts, comments, reactions, likes, reposts, bookmarks, polls, stories
  socialGraph: number; // follows (both directions), follow requests, mutes, blocks
  messaging: number; // messages sent/received, conversations, participants, message reactions
  media: number; // avatar/cover set, stories (media-bearing)
  marketplace: number; // listings, favorites
  music: number; // artist profile, playlists, likes, follows, history
  financial: number; // creator profile, tips, purchases, withdrawals, upgrade/payment requests
  play: number; // play profile, challenges, attempts, achievements, duels
  support: number; // tickets, replies, appeals, reports
  ads: number; // campaigns, impressions, clicks
  newsAndJournalism: number; // articles, journalist profile, editorial feed, reviews
  opportunityAndHelp: number;
  team: number; // team memberships either side
  credentialsAndDevices: number; // api keys, push subscriptions, fcm tokens
  ai: number; // AI conversations / usage
  notifications: number; // received notifications
}

export interface MemberSummary {
  id: string;
  createdAt: string;
  hasPassword: boolean;
  emailVerified: boolean;
  onboardingCompleted: boolean;
  banned: boolean;
  role: string;
  plan: string;
  isAdmin: boolean;
  emailIsLowercase: boolean;
  data: MemberDataProfile;
  totalOwnedRecords: number;
}

export type GroupVerdict =
  | "safe-to-merge" // every non-canonical member owns nothing at all
  | "manual-review"; // some duplicate owns data, or a privilege/finance/ban signal is present

export interface DuplicateGroup {
  groupIndex: number;
  memberCount: number;
  canonicalId: string;
  canonicalIsOldest: true;
  canonicalHasPassword: boolean;
  canonicalHasData: boolean;
  origin: DuplicateOrigin;
  verdict: GroupVerdict;
  reviewReasons: string[];
  members: MemberSummary[];
  duplicateIds: string[];
  duplicatesWithData: number;
  duplicatesEmpty: number;
  dataOnlyOnDuplicates: (keyof MemberDataProfile)[];
}

export interface DuplicateAuditReport {
  generatedAt: string;
  totalUsers: number;
  usersWithMixedCaseEmail: number;
  duplicateGroups: number;
  duplicateAccounts: number; // non-canonical rows across all groups
  byOrigin: Record<DuplicateOrigin, number>;
  byVerdict: Record<GroupVerdict, number>;
  dataCategoriesPresentOnDuplicates: Record<keyof MemberDataProfile, number>; // groups where a duplicate owns records in that category
  notes: string[];
  groups: DuplicateGroup[];
}

const EMPTY_PROFILE: MemberDataProfile = {
  content: 0,
  socialGraph: 0,
  messaging: 0,
  media: 0,
  marketplace: 0,
  music: 0,
  financial: 0,
  play: 0,
  support: 0,
  ads: 0,
  newsAndJournalism: 0,
  opportunityAndHelp: 0,
  team: 0,
  credentialsAndDevices: 0,
  ai: 0,
  notifications: 0,
};

// Every list relation on User, counted through Prisma's relation counts
// (a COUNT per relation, no row data is read).
const LIST_RELATION_COUNTS = {
  posts: true,
  comments: true,
  likes: true,
  reposts: true,
  reactions: true,
  bookmarks: true,
  pollVotes: true,
  stories: true,
  storyViews: true,
  storyLikes: true,
  commentLikes: true,
  commentReposts: true,
  commentBookmarks: true,
  following: true,
  followers: true,
  followRequestsSent: true,
  followRequestsReceived: true,
  muter: true,
  mutedBy: true,
  blockedUsers: true,
  blockedBy: true,
  sentMessages: true,
  receivedMessages: true,
  messageReactions: true,
  createdConversations: true,
  conversationParticipants: true,
  listings: true,
  listingFavorites: true,
  musicPlaylists: true,
  musicLikes: true,
  musicFollows: true,
  musicHistory: true,
  sentTips: true,
  receivedTips: true,
  premiumPurchases: true,
  withdrawalRequests: true,
  upgradeRequests: true,
  paymentRequests: true,
  playChallenges: true,
  playAttempts: true,
  playUserAchievements: true,
  duelsChallenged: true,
  duelsReceived: true,
  supportTickets: true,
  assignedTickets: true,
  ticketReplies: true,
  appeals: true,
  reports: true,
  reportsAgainstMe: true,
  adCampaigns: true,
  adImpressions: true,
  adClicks: true,
  newsArticles: true,
  journalistReviewsGiven: true,
  newsReviewsGiven: true,
  opportunityListings: true,
  opportunityApplications: true,
  opportunitySaved: true,
  helpCampaigns: true,
  helpContributions: true,
  helpOffers: true,
  helpWithdrawalRequests: true,
  teamAccount: true,
  teamMembers: true,
  apiKeys: true,
  pushSubscriptions: true,
  fcmTokens: true,
  aiConversations: true,
  aiDailyUsage: true,
  notifications: true,
  sentNotifications: true,
} as const;

type Counts = Record<keyof typeof LIST_RELATION_COUNTS, number>;

function sum(counts: Counts, keys: (keyof Counts)[]): number {
  return keys.reduce((total, key) => total + (counts[key] ?? 0), 0);
}

function profileFrom(
  counts: Counts,
  flags: {
    hasAvatar: boolean;
    hasCover: boolean;
    hasPlayProfile: boolean;
    hasCreatorProfile: boolean;
    hasJournalistProfile: boolean;
    hasMusicArtist: boolean;
    hasNewsFeed: boolean;
  }
): MemberDataProfile {
  return {
    content: sum(counts, [
      "posts",
      "comments",
      "likes",
      "reposts",
      "reactions",
      "bookmarks",
      "pollVotes",
      "stories",
      "storyViews",
      "storyLikes",
      "commentLikes",
      "commentReposts",
      "commentBookmarks",
    ]),
    socialGraph: sum(counts, [
      "following",
      "followers",
      "followRequestsSent",
      "followRequestsReceived",
      "muter",
      "mutedBy",
      "blockedUsers",
      "blockedBy",
    ]),
    messaging: sum(counts, [
      "sentMessages",
      "receivedMessages",
      "messageReactions",
      "createdConversations",
      "conversationParticipants",
    ]),
    media: (flags.hasAvatar ? 1 : 0) + (flags.hasCover ? 1 : 0) + counts.stories,
    marketplace: sum(counts, ["listings", "listingFavorites"]),
    music:
      (flags.hasMusicArtist ? 1 : 0) +
      sum(counts, ["musicPlaylists", "musicLikes", "musicFollows", "musicHistory"]),
    financial:
      (flags.hasCreatorProfile ? 1 : 0) +
      sum(counts, [
        "sentTips",
        "receivedTips",
        "premiumPurchases",
        "withdrawalRequests",
        "upgradeRequests",
        "paymentRequests",
      ]),
    play:
      (flags.hasPlayProfile ? 1 : 0) +
      sum(counts, [
        "playChallenges",
        "playAttempts",
        "playUserAchievements",
        "duelsChallenged",
        "duelsReceived",
      ]),
    support: sum(counts, [
      "supportTickets",
      "assignedTickets",
      "ticketReplies",
      "appeals",
      "reports",
      "reportsAgainstMe",
    ]),
    ads: sum(counts, ["adCampaigns", "adImpressions", "adClicks"]),
    newsAndJournalism:
      (flags.hasJournalistProfile ? 1 : 0) +
      (flags.hasNewsFeed ? 1 : 0) +
      sum(counts, ["newsArticles", "journalistReviewsGiven", "newsReviewsGiven"]),
    opportunityAndHelp: sum(counts, [
      "opportunityListings",
      "opportunityApplications",
      "opportunitySaved",
      "helpCampaigns",
      "helpContributions",
      "helpOffers",
      "helpWithdrawalRequests",
    ]),
    team: sum(counts, ["teamAccount", "teamMembers"]),
    credentialsAndDevices: sum(counts, ["apiKeys", "pushSubscriptions", "fcmTokens"]),
    ai: sum(counts, ["aiConversations", "aiDailyUsage"]),
    notifications: sum(counts, ["notifications", "sentNotifications"]),
  };
}

function totalOf(profile: MemberDataProfile): number {
  return (Object.keys(EMPTY_PROFILE) as (keyof MemberDataProfile)[]).reduce(
    (total, key) => total + profile[key],
    0
  );
}

/** Email keys (lowercased) that more than one account share. */
async function findDuplicateEmailKeys(): Promise<{ key: string; count: number }[]> {
  // The lowercased key never leaves this function - it is only used to
  // fetch the member rows and is not part of the report.
  const rows = await prisma.$queryRaw<{ key: string; count: bigint }[]>`
    SELECT lower("email") AS key, count(*)::bigint AS count
    FROM "User"
    GROUP BY lower("email")
    HAVING count(*) > 1
    ORDER BY count(*) DESC, lower("email") ASC
  `;
  return rows.map((row) => ({ key: row.key, count: Number(row.count) }));
}

async function summarizeMember(userId: string): Promise<MemberSummary> {
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      createdAt: true,
      password: true,
      emailVerified: true,
      onboardingCompleted: true,
      banned: true,
      role: true,
      plan: true,
      isAdmin: true,
      avatarUrl: true,
      coverUrl: true,
      playProfile: { select: { id: true } },
      creatorProfile: { select: { id: true } },
      journalistProfile: { select: { id: true } },
      musicArtist: { select: { id: true } },
      newsFeed: { select: { id: true } },
      _count: { select: LIST_RELATION_COUNTS },
    },
  });

  const profile = profileFrom(user._count as Counts, {
    hasAvatar: !!user.avatarUrl,
    hasCover: !!user.coverUrl,
    hasPlayProfile: !!user.playProfile,
    hasCreatorProfile: !!user.creatorProfile,
    hasJournalistProfile: !!user.journalistProfile,
    hasMusicArtist: !!user.musicArtist,
    hasNewsFeed: !!user.newsFeed,
  });

  return {
    id: user.id,
    createdAt: user.createdAt.toISOString(),
    hasPassword: !!user.password, // boolean only - the hash is never surfaced
    emailVerified: !!user.emailVerified,
    onboardingCompleted: user.onboardingCompleted,
    banned: user.banned,
    role: user.role,
    plan: user.plan,
    isAdmin: user.isAdmin,
    emailIsLowercase: user.email === user.email.toLowerCase(),
    data: profile,
    totalOwnedRecords: totalOf(profile),
  };
}

function classifyOrigin(canonical: MemberSummary, duplicate: MemberSummary): DuplicateOrigin {
  if (!duplicate.hasPassword && duplicate.emailVerified && duplicate.emailIsLowercase && !canonical.emailIsLowercase) {
    return "oauth-link-miss";
  }
  if (duplicate.hasPassword) return "pre-normalization-register";
  return "other";
}

export async function auditOAuthDuplicates(): Promise<DuplicateAuditReport> {
  const [totalUsers, mixedCaseRows, keys] = await Promise.all([
    prisma.user.count(),
    prisma.$queryRaw<{ count: bigint }[]>`SELECT count(*)::bigint AS count FROM "User" WHERE "email" <> lower("email")`,
    findDuplicateEmailKeys(),
  ]);

  const groups: DuplicateGroup[] = [];
  const byOrigin: Record<DuplicateOrigin, number> = {
    "oauth-link-miss": 0,
    "pre-normalization-register": 0,
    other: 0,
  };
  const byVerdict: Record<GroupVerdict, number> = { "safe-to-merge": 0, "manual-review": 0 };
  const categoriesOnDuplicates = { ...EMPTY_PROFILE };

  for (let index = 0; index < keys.length; index++) {
    const memberRows = await prisma.$queryRaw<{ id: string }[]>`
      SELECT "id" FROM "User" WHERE lower("email") = ${keys[index].key} ORDER BY "createdAt" ASC, "id" ASC
    `;
    const members: MemberSummary[] = [];
    for (const row of memberRows) members.push(await summarizeMember(row.id));

    const canonical = members[0];
    const duplicates = members.slice(1);
    const reviewReasons: string[] = [];

    const dataOnlyOnDuplicates = new Set<keyof MemberDataProfile>();
    for (const duplicate of duplicates) {
      for (const key of Object.keys(EMPTY_PROFILE) as (keyof MemberDataProfile)[]) {
        if (duplicate.data[key] > 0) {
          categoriesOnDuplicates[key] += 1;
          if (canonical.data[key] === 0) dataOnlyOnDuplicates.add(key);
        }
      }
    }

    const duplicatesWithData = duplicates.filter((d) => d.totalOwnedRecords > 0).length;
    if (duplicatesWithData > 0) reviewReasons.push(`${duplicatesWithData} duplicate(s) own records`);
    if (!canonical.hasPassword && duplicates.some((d) => d.hasPassword)) {
      reviewReasons.push("oldest row has no password but a newer one does");
    }
    if (members.some((m) => m.banned)) reviewReasons.push("a member is banned");
    if (members.some((m) => m.isAdmin || m.role !== "USER")) {
      reviewReasons.push("a member holds a privileged role");
    }
    if (members.some((m) => m.data.financial > 0)) reviewReasons.push("financial records present");
    if (members.length > 2) reviewReasons.push("more than two accounts share the address");

    // The origin of a group is the most specific origin among its
    // duplicates: one OAuth-shaped duplicate is enough to attribute it.
    const origins = duplicates.map((d) => classifyOrigin(canonical, d));
    const origin: DuplicateOrigin = origins.includes("oauth-link-miss")
      ? "oauth-link-miss"
      : origins.includes("pre-normalization-register")
        ? "pre-normalization-register"
        : "other";

    const verdict: GroupVerdict = reviewReasons.length === 0 ? "safe-to-merge" : "manual-review";
    byOrigin[origin] += 1;
    byVerdict[verdict] += 1;

    groups.push({
      groupIndex: index,
      memberCount: members.length,
      canonicalId: canonical.id,
      canonicalIsOldest: true,
      canonicalHasPassword: canonical.hasPassword,
      canonicalHasData: canonical.totalOwnedRecords > 0,
      origin,
      verdict,
      reviewReasons,
      members,
      duplicateIds: duplicates.map((d) => d.id),
      duplicatesWithData,
      duplicatesEmpty: duplicates.length - duplicatesWithData,
      dataOnlyOnDuplicates: Array.from(dataOnlyOnDuplicates),
    });
  }

  return {
    generatedAt: new Date().toISOString(),
    totalUsers,
    usersWithMixedCaseEmail: Number(mixedCaseRows[0]?.count ?? 0),
    duplicateGroups: groups.length,
    duplicateAccounts: groups.reduce((total, g) => total + g.duplicateIds.length, 0),
    byOrigin,
    byVerdict,
    dataCategoriesPresentOnDuplicates: categoriesOnDuplicates,
    notes: [
      "Read-only: SELECT/COUNT queries only; nothing was written.",
      "Canonical = the oldest account (createdAt ASC) sharing the address; the login fix already prefers it.",
      "Sessions are stateless JWTs (no session table) and there is no OAuth account-link table (no NextAuth adapter), so neither has rows to inventory.",
      "safe-to-merge = every non-canonical account owns zero records in every category above; manual-review otherwise.",
      "Emails, names, password hashes and tokens are never included; account ids are opaque cuids.",
    ],
    groups,
  };
}
