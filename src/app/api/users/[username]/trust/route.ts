import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

interface RouteContext {
  params: Promise<{
    username: string;
  }>;
}

export async function GET(_request: Request, props: RouteContext) {
  const params = await props.params;
  try {
    const username = decodeURIComponent(params.username);

    const user = await prisma.user.findUnique({
      where: {
        username,
      },
      select: {
        id: true,
        username: true,
        name: true,
        avatarUrl: true,
        coverUrl: true,
        bio: true,
        location: true,
        website: true,
        category: true,
        showCategory: true,
        badgeType: true,
        emailVerified: true,
        createdAt: true,
        banned: true,
        isPrivate: true,
        plan: true,
        verifiedSolanaWallet: true,

        _count: {
          select: {
            posts: true,
            followers: true,
            following: true,
            comments: true,
            likes: true,
            reposts: true,
          },
        },
      },
    });

    if (!user) {
      return NextResponse.json(
        { error: "User not found" },
        { status: 404 }
      );
    }

    /*
     * ---------------------------------------------------------------
     * ZRP TRUST PASSPORT
     * ---------------------------------------------------------------
     *
     * This score is intentionally based on existing authoritative
     * account data.
     *
     * It is NOT:
     * - an identity verification system
     * - a popularity score
     * - a financial score
     * - a moderation punishment score
     *
     * It represents positive trust signals available on ZRP.
     *
     * IMPORTANT:
     * The scoring formula below remains unchanged.
     * The new "breakdown" response simply exposes how the score
     * was calculated so the frontend can display it transparently.
     */

    /*
     * ---------------------------------------------------------------
     * ACCOUNT AGE
     * ---------------------------------------------------------------
     *
     * Days are calculated from exact elapsed time.
     *
     * Months are calculated using calendar months rather than
     * dividing the number of days by 30.44.
     *
     * This automatically updates whenever the Trust Passport
     * endpoint is requested.
     */

    const createdAt = new Date(user.createdAt);
    const nowDate = new Date();

    const accountAgeDays = Math.max(
      0,
      Math.floor(
        (nowDate.getTime() - createdAt.getTime()) /
          (1000 * 60 * 60 * 24)
      )
    );

    let accountAgeMonths =
      (nowDate.getFullYear() - createdAt.getFullYear()) * 12 +
      (nowDate.getMonth() - createdAt.getMonth());

    /*
     * If today's calendar day has not reached the account's
     * creation day, the current month is not complete yet.
     *
     * Example:
     *
     * Created: July 25
     * Current: August 18
     * Result: 0 months
     *
     * Created: July 25
     * Current: August 25
     * Result: 1 month
     */

    if (nowDate.getDate() < createdAt.getDate()) {
      accountAgeMonths--;
    }

    accountAgeMonths = Math.max(0, accountAgeMonths);

    /*
     * ---------------------------------------------------------------
     * PROFILE SIGNALS
     * ---------------------------------------------------------------
     */

    const profileSignals = {
      emailVerified: Boolean(user.emailVerified),
      avatarAdded: Boolean(user.avatarUrl),
      coverAdded: Boolean(user.coverUrl),
      nameAdded: Boolean(user.name?.trim()),
      bioAdded: Boolean(user.bio?.trim()),
      locationAdded: Boolean(user.location?.trim()),
      websiteAdded: Boolean(user.website?.trim()),
    };

    /*
     * ---------------------------------------------------------------
     * ACTIVITY SIGNALS
     * ---------------------------------------------------------------
     */

    const activitySignals = {
      hasPosts: user._count.posts > 0,
      hasComments: user._count.comments > 0,
      hasLikes: user._count.likes > 0,
      hasReposts: user._count.reposts > 0,
      hasFollowers: user._count.followers > 0,
    };

    /*
     * ---------------------------------------------------------------
     * ACCOUNT AGE SIGNALS
     * ---------------------------------------------------------------
     */

    const ageSignals = {
      established30Days: accountAgeDays >= 30,
      established90Days: accountAgeDays >= 90,
      established180Days: accountAgeDays >= 180,
      established365Days: accountAgeDays >= 365,
    };

    /*
     * ---------------------------------------------------------------
     * SCORE POINTS
     * ---------------------------------------------------------------
     *
     * Maximum possible score:
     *
     * SECURITY   = 20
     * PROFILE    = 30
     * HISTORY    = 25
     * COMMUNITY  = 17
     * ZRP        = 8
     *
     * TOTAL      = 100
     *
     * This is the SAME scoring formula already used by ZRP.
     */

    const scorePoints = {
      emailVerified: profileSignals.emailVerified ? 20 : 0,

      avatarAdded: profileSignals.avatarAdded ? 10 : 0,
      coverAdded: profileSignals.coverAdded ? 5 : 0,
      nameAdded: profileSignals.nameAdded ? 5 : 0,
      bioAdded: profileSignals.bioAdded ? 5 : 0,
      locationAdded: profileSignals.locationAdded ? 3 : 0,
      websiteAdded: profileSignals.websiteAdded ? 2 : 0,

      established30Days: ageSignals.established30Days ? 5 : 0,
      established90Days: ageSignals.established90Days ? 5 : 0,
      established180Days: ageSignals.established180Days ? 5 : 0,
      established365Days: ageSignals.established365Days ? 10 : 0,

      hasPosts: activitySignals.hasPosts ? 5 : 0,
      hasComments: activitySignals.hasComments ? 5 : 0,
      hasLikes: activitySignals.hasLikes ? 2 : 0,
      hasReposts: activitySignals.hasReposts ? 2 : 0,
      hasFollowers: activitySignals.hasFollowers ? 3 : 0,

      zrpVerification: user.badgeType ? 8 : 0,
    };

    /*
     * ---------------------------------------------------------------
     * SCORE
     * ---------------------------------------------------------------
     */

    let score =
      scorePoints.emailVerified +
      scorePoints.avatarAdded +
      scorePoints.coverAdded +
      scorePoints.nameAdded +
      scorePoints.bioAdded +
      scorePoints.locationAdded +
      scorePoints.websiteAdded +
      scorePoints.established30Days +
      scorePoints.established90Days +
      scorePoints.established180Days +
      scorePoints.established365Days +
      scorePoints.hasPosts +
      scorePoints.hasComments +
      scorePoints.hasLikes +
      scorePoints.hasReposts +
      scorePoints.hasFollowers +
      scorePoints.zrpVerification;

    // Hard cap
    score = Math.min(score, 100);

    /*
     * ---------------------------------------------------------------
     * LOCALIZATION KEYS
     * ---------------------------------------------------------------
     *
     * `title`/`description`/`levelLabel` below are hardcoded English
     * kept only for existing consumers that already render them as-is.
     * Every one of them also gets a stable `titleKey`/`descriptionKey`
     * (and `descriptionParams` where the text is parameterized) that
     * matches a real entry in src/lib/translations.ts, under the same
     * "backend sends keys, each client localizes" contract already
     * used for src/lib/milestones.ts. A client should always prefer
     * the *Key field over the prose field when it has a dictionary
     * for that key, and fall back to the prose otherwise.
     *
     * `titleKey`/`descriptionKey` for the four breakdown signals that
     * have no top-level equivalent (the per-tier account-age and
     * per-activity community signals under "history"/"community")
     * are intentionally omitted - there is no dictionary entry for
     * them yet since no client renders them today, and an omitted key
     * is the same "nothing to guess at" fallback iOS and web already
     * use for any key the dictionary doesn't have.
     */

    const CATEGORY_KEYS: Record<string, { titleKey: string; descriptionKey: string }> = {
      security: { titleKey: "trust.categorySecurity", descriptionKey: "trust.categorySecurityDesc" },
      profile: { titleKey: "trust.categoryProfile", descriptionKey: "trust.categoryProfileDesc" },
      history: { titleKey: "trust.categoryHistory", descriptionKey: "trust.categoryHistoryDesc" },
      community: { titleKey: "trust.categoryCommunity", descriptionKey: "trust.categoryCommunityDesc" },
      zrp: { titleKey: "trust.categoryZrp", descriptionKey: "trust.categoryZrpDesc" },
    };

    const SIGNAL_KEYS: Record<string, { titleKey: string; descriptionKey: string }> = {
      email: { titleKey: "trust.signalEmailTitle", descriptionKey: "trust.signalEmailDesc" },
      avatar: { titleKey: "trust.signalAvatarTitle", descriptionKey: "trust.signalAvatarDesc" },
      cover: { titleKey: "trust.signalCoverTitle", descriptionKey: "trust.signalCoverDesc" },
      name: { titleKey: "trust.signalNameTitle", descriptionKey: "trust.signalNameDesc" },
      bio: { titleKey: "trust.signalBioTitle", descriptionKey: "trust.signalBioDesc" },
      location: { titleKey: "trust.signalLocationTitle", descriptionKey: "trust.signalLocationDesc" },
      website: { titleKey: "trust.signalWebsiteTitle", descriptionKey: "trust.signalWebsiteDesc" },
      community: { titleKey: "trust.signalCommunityTitle", descriptionKey: "trust.signalCommunityDesc" },
      followers: { titleKey: "trust.signalFollowersTitle", descriptionKey: "trust.signalFollowersDesc" },
      verified: { titleKey: "trust.signalVerifiedTitle", descriptionKey: "trust.signalVerifiedDesc" },
    };

    // Breakdown signal keys that have a directly equivalent top-level
    // signal - reuse that signal's keys rather than inventing new ones.
    const BREAKDOWN_SIGNAL_KEY_ALIAS: Record<string, string> = {
      emailVerified: "email",
      avatarAdded: "avatar",
      coverAdded: "cover",
      nameAdded: "name",
      bioAdded: "bio",
      locationAdded: "location",
      websiteAdded: "website",
      zrpVerification: "verified",
    };

    const accountAgeEstablished = accountAgeMonths >= 12;
    const accountAgeTitleKey = accountAgeEstablished
      ? "trust.signalAccountAgeTitleEstablished"
      : "trust.signalAccountAgeTitleHistory";
    const accountAgeDescriptionKey = accountAgeEstablished
      ? "trust.signalAccountAgeDescEstablished"
      : accountAgeMonths === 1
        ? "trust.signalAccountAgeDescHistorySingular"
        : "trust.signalAccountAgeDescHistoryPlural";
    const accountAgeDescriptionParams = accountAgeEstablished ? undefined : { months: accountAgeMonths };

    /*
     * ---------------------------------------------------------------
     * TRANSPARENT SCORE BREAKDOWN
     * ---------------------------------------------------------------
     *
     * This is public information derived from the same scoring
     * formula. No private security or moderation information is
     * exposed here.
     */

    const breakdown = [
      {
        key: "security",
        title: "Security",
        description: "Account security and verification signals.",
        ...CATEGORY_KEYS.security,
        points: scorePoints.emailVerified,
        maxPoints: 20,
        signals: [
          {
            key: "emailVerified",
            title: "Email verified",
            titleKey: SIGNAL_KEYS[BREAKDOWN_SIGNAL_KEY_ALIAS.emailVerified].titleKey,
            points: scorePoints.emailVerified,
            maxPoints: 20,
            verified: profileSignals.emailVerified,
          },
        ],
      },

      {
        key: "profile",
        title: "Profile",
        description: "Positive profile completeness signals.",
        ...CATEGORY_KEYS.profile,
        points:
          scorePoints.avatarAdded +
          scorePoints.coverAdded +
          scorePoints.nameAdded +
          scorePoints.bioAdded +
          scorePoints.locationAdded +
          scorePoints.websiteAdded,
        maxPoints: 30,
        signals: [
          {
            key: "avatarAdded",
            title: "Profile photo added",
            titleKey: SIGNAL_KEYS[BREAKDOWN_SIGNAL_KEY_ALIAS.avatarAdded].titleKey,
            points: scorePoints.avatarAdded,
            maxPoints: 10,
            verified: profileSignals.avatarAdded,
          },
          {
            key: "coverAdded",
            title: "Profile banner added",
            titleKey: SIGNAL_KEYS[BREAKDOWN_SIGNAL_KEY_ALIAS.coverAdded].titleKey,
            points: scorePoints.coverAdded,
            maxPoints: 5,
            verified: profileSignals.coverAdded,
          },
          {
            key: "nameAdded",
            title: "Display name added",
            titleKey: SIGNAL_KEYS[BREAKDOWN_SIGNAL_KEY_ALIAS.nameAdded].titleKey,
            points: scorePoints.nameAdded,
            maxPoints: 5,
            verified: profileSignals.nameAdded,
          },
          {
            key: "bioAdded",
            title: "Profile bio added",
            titleKey: SIGNAL_KEYS[BREAKDOWN_SIGNAL_KEY_ALIAS.bioAdded].titleKey,
            points: scorePoints.bioAdded,
            maxPoints: 5,
            verified: profileSignals.bioAdded,
          },
          {
            key: "locationAdded",
            title: "Location added",
            titleKey: SIGNAL_KEYS[BREAKDOWN_SIGNAL_KEY_ALIAS.locationAdded].titleKey,
            points: scorePoints.locationAdded,
            maxPoints: 3,
            verified: profileSignals.locationAdded,
          },
          {
            key: "websiteAdded",
            title: "Website added",
            titleKey: SIGNAL_KEYS[BREAKDOWN_SIGNAL_KEY_ALIAS.websiteAdded].titleKey,
            points: scorePoints.websiteAdded,
            maxPoints: 2,
            verified: profileSignals.websiteAdded,
          },
        ],
      },

      {
        key: "history",
        title: "Account history",
        description: "Positive signals based on account age.",
        ...CATEGORY_KEYS.history,
        points:
          scorePoints.established30Days +
          scorePoints.established90Days +
          scorePoints.established180Days +
          scorePoints.established365Days,
        maxPoints: 25,
        signals: [
          {
            key: "established30Days",
            title: "30-day account history",
            points: scorePoints.established30Days,
            maxPoints: 5,
            verified: ageSignals.established30Days,
          },
          {
            key: "established90Days",
            title: "90-day account history",
            points: scorePoints.established90Days,
            maxPoints: 5,
            verified: ageSignals.established90Days,
          },
          {
            key: "established180Days",
            title: "180-day account history",
            points: scorePoints.established180Days,
            maxPoints: 5,
            verified: ageSignals.established180Days,
          },
          {
            key: "established365Days",
            title: "1-year account history",
            points: scorePoints.established365Days,
            maxPoints: 10,
            verified: ageSignals.established365Days,
          },
        ],
      },

      {
        key: "community",
        title: "Community",
        description: "Positive participation and community signals.",
        ...CATEGORY_KEYS.community,
        points:
          scorePoints.hasPosts +
          scorePoints.hasComments +
          scorePoints.hasLikes +
          scorePoints.hasReposts +
          scorePoints.hasFollowers,
        maxPoints: 17,
        signals: [
          {
            key: "hasPosts",
            title: "Published posts",
            points: scorePoints.hasPosts,
            maxPoints: 5,
            verified: activitySignals.hasPosts,
          },
          {
            key: "hasComments",
            title: "Community comments",
            points: scorePoints.hasComments,
            maxPoints: 5,
            verified: activitySignals.hasComments,
          },
          {
            key: "hasLikes",
            title: "Community likes",
            points: scorePoints.hasLikes,
            maxPoints: 2,
            verified: activitySignals.hasLikes,
          },
          {
            key: "hasReposts",
            title: "Community reposts",
            points: scorePoints.hasReposts,
            maxPoints: 2,
            verified: activitySignals.hasReposts,
          },
          {
            key: "hasFollowers",
            title: "Community connections",
            points: scorePoints.hasFollowers,
            maxPoints: 3,
            verified: activitySignals.hasFollowers,
          },
        ],
      },

      {
        key: "zrp",
        title: "ZRP",
        description: "ZRP platform verification signals.",
        ...CATEGORY_KEYS.zrp,
        points: scorePoints.zrpVerification,
        maxPoints: 8,
        signals: [
          {
            key: "zrpVerification",
            title: "ZRP verification",
            titleKey: SIGNAL_KEYS[BREAKDOWN_SIGNAL_KEY_ALIAS.zrpVerification].titleKey,
            points: scorePoints.zrpVerification,
            maxPoints: 8,
            verified: Boolean(user.badgeType),
          },
        ],
      },
    ];

    /*
     * ---------------------------------------------------------------
     * TRUST LEVEL
     * ---------------------------------------------------------------
     */

    let level: "LOW" | "MODERATE" | "GOOD" | "HIGH" | "EXCELLENT";
    let levelLabel: string;
    let levelLabelKey: string;

    if (score >= 90) {
      level = "EXCELLENT";
      levelLabel = "Excellent Trust";
      levelLabelKey = "trust.levelExcellent";
    } else if (score >= 75) {
      level = "HIGH";
      levelLabel = "High Trust";
      levelLabelKey = "trust.levelHigh";
    } else if (score >= 55) {
      level = "GOOD";
      levelLabel = "Good Trust";
      levelLabelKey = "trust.levelGood";
    } else if (score >= 35) {
      level = "MODERATE";
      levelLabel = "Moderate Trust";
      levelLabelKey = "trust.levelModerate";
    } else {
      level = "LOW";
      levelLabel = "Building Trust";
      levelLabelKey = "trust.levelLow";
    }

    /*
     * ---------------------------------------------------------------
     * PUBLIC TRUST SIGNALS
     * ---------------------------------------------------------------
     */

    const signals = [
      {
        key: "email",
        title: "Email verified",
        description: "The account has completed email verification.",
        ...SIGNAL_KEYS.email,
        verified: profileSignals.emailVerified,
        category: "SECURITY",
        categoryTitleKey: CATEGORY_KEYS.security.titleKey,
        points: scorePoints.emailVerified,
        maxPoints: 20,
      },

      {
        key: "avatar",
        title: "Profile photo added",
        description: "A profile photo has been added to the account.",
        ...SIGNAL_KEYS.avatar,
        verified: profileSignals.avatarAdded,
        category: "PROFILE",
        categoryTitleKey: CATEGORY_KEYS.profile.titleKey,
        points: scorePoints.avatarAdded,
        maxPoints: 10,
      },

      {
        key: "cover",
        title: "Profile banner added",
        description: "A profile banner has been added.",
        ...SIGNAL_KEYS.cover,
        verified: profileSignals.coverAdded,
        category: "PROFILE",
        categoryTitleKey: CATEGORY_KEYS.profile.titleKey,
        points: scorePoints.coverAdded,
        maxPoints: 5,
      },

      {
        key: "name",
        title: "Display name added",
        description: "The account has a configured display name.",
        ...SIGNAL_KEYS.name,
        verified: profileSignals.nameAdded,
        category: "PROFILE",
        categoryTitleKey: CATEGORY_KEYS.profile.titleKey,
        points: scorePoints.nameAdded,
        maxPoints: 5,
      },

      {
        key: "bio",
        title: "Profile bio added",
        description: "The account has provided profile information.",
        ...SIGNAL_KEYS.bio,
        verified: profileSignals.bioAdded,
        category: "PROFILE",
        categoryTitleKey: CATEGORY_KEYS.profile.titleKey,
        points: scorePoints.bioAdded,
        maxPoints: 5,
      },

      {
        key: "location",
        title: "Location added",
        description: "A location has been added to the public profile.",
        ...SIGNAL_KEYS.location,
        verified: profileSignals.locationAdded,
        category: "PROFILE",
        categoryTitleKey: CATEGORY_KEYS.profile.titleKey,
        points: scorePoints.locationAdded,
        maxPoints: 3,
      },

      {
        key: "website",
        title: "Website added",
        description: "A website has been added to the profile.",
        ...SIGNAL_KEYS.website,
        verified: profileSignals.websiteAdded,
        category: "PROFILE",
        categoryTitleKey: CATEGORY_KEYS.profile.titleKey,
        points: scorePoints.websiteAdded,
        maxPoints: 2,
      },

      {
        key: "account-age",
        title:
          accountAgeMonths >= 12
            ? "Established account"
            : "Account history",
        description:
          accountAgeMonths >= 12
            ? "This account has been active on ZRP for at least one year."
            : `This account has been on ZRP for ${accountAgeMonths} month${
                accountAgeMonths === 1 ? "" : "s"
              }.`,
        titleKey: accountAgeTitleKey,
        descriptionKey: accountAgeDescriptionKey,
        descriptionParams: accountAgeDescriptionParams,
        verified: accountAgeDays >= 30,
        category: "HISTORY",
        categoryTitleKey: CATEGORY_KEYS.history.titleKey,
        points:
          scorePoints.established30Days +
          scorePoints.established90Days +
          scorePoints.established180Days +
          scorePoints.established365Days,
        maxPoints: 25,
      },

      {
        key: "community",
        title: "Community activity",
        description:
          "The account has participated in the ZRP community.",
        ...SIGNAL_KEYS.community,
        verified:
          activitySignals.hasPosts ||
          activitySignals.hasComments ||
          activitySignals.hasLikes ||
          activitySignals.hasReposts,
        category: "COMMUNITY",
        categoryTitleKey: CATEGORY_KEYS.community.titleKey,
        points:
          scorePoints.hasPosts +
          scorePoints.hasComments +
          scorePoints.hasLikes +
          scorePoints.hasReposts,
        maxPoints: 14,
      },

      {
        key: "followers",
        title: "Community connections",
        description:
          "The account has established connections with other ZRP users.",
        ...SIGNAL_KEYS.followers,
        verified: activitySignals.hasFollowers,
        category: "COMMUNITY",
        categoryTitleKey: CATEGORY_KEYS.community.titleKey,
        points: scorePoints.hasFollowers,
        maxPoints: 3,
      },

      {
        key: "verified",
        title: "ZRP verification",
        description:
          "This account currently has a ZRP verification badge.",
        ...SIGNAL_KEYS.verified,
        verified: Boolean(user.badgeType),
        category: "ZRP",
        categoryTitleKey: CATEGORY_KEYS.zrp.titleKey,
        points: scorePoints.zrpVerification,
        maxPoints: 8,
      },
    ];

    /*
     * ---------------------------------------------------------------
     * ADDITIONAL SIGNALS (do not affect the score)
     * ---------------------------------------------------------------
     *
     * The scoring formula above is intentionally unchanged - these are
     * shown separately rather than folded into it. Wallet verification
     * uses the cryptographically verified wallet field only (proof of
     * on-chain ownership), never the unverified payout address, and
     * never the wallet address itself - only whether one is verified.
     */

    const additionalSignals = [
      {
        key: "walletVerified",
        title: "Wallet verified",
        description:
          "This account has a cryptographically verified crypto wallet linked to it.",
        titleKey: "trust.signalWalletVerifiedTitle",
        descriptionKey: "trust.signalWalletVerifiedDesc",
        verified: Boolean(user.verifiedSolanaWallet),
      },
    ];

    /*
     * ---------------------------------------------------------------
     * PRIVACY
     * ---------------------------------------------------------------
     *
     * We intentionally DO NOT expose:
     *
     * - email address
     * - IP address
     * - private moderation reports
     * - internal security signals
     * - private messages
     * - private account information
     * - the wallet address itself (only whether it is verified)
     */

    return NextResponse.json({
      passport: {
        score,
        level,
        levelLabel,
        levelLabelKey,
        generatedAt: new Date().toISOString(),

        /*
         * Explicit scoring information for the frontend.
         *
         * The frontend should never calculate the Trust Score itself.
         * It should display the backend result and this breakdown.
         */
        maxScore: 100,
        breakdown,
      },

      user: {
        username: user.username,
        name: user.name,
        avatarUrl: user.avatarUrl,
        badgeType: user.badgeType,
        createdAt: user.createdAt,
        accountAgeDays,
        accountAgeMonths,
        isPrivate: user.isPrivate,
        plan: user.plan,
      },

      signals,

      additionalSignals,

      counts: {
        posts: user._count.posts,
        followers: user._count.followers,
        following: user._count.following,
      },
    });
  } catch (error) {
    console.error("ZRP Trust Passport error:", error);

    return NextResponse.json(
      {
        error: "Unable to generate Trust Passport",
      },
      {
        status: 500,
      }
    );
  }
}
