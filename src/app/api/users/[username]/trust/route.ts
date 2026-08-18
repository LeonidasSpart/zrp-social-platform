import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

interface RouteContext {
  params: {
    username: string;
  };
}

export async function GET(
  _request: Request,
  { params }: RouteContext
) {
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
     */

    const now = Date.now();
    const accountAgeDays = Math.floor(
      (now - new Date(user.createdAt).getTime()) /
        (1000 * 60 * 60 * 24)
    );

    const accountAgeMonths = Math.floor(accountAgeDays / 30.44);

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
     * ACCOUNT AGE
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
     * SCORE
     * ---------------------------------------------------------------
     *
     * Maximum = 100
     *
     * We deliberately keep popularity relatively small.
     */

    let score = 0;

    // Security / account verification
    if (profileSignals.emailVerified) score += 20;

    // Profile authenticity/completeness
    if (profileSignals.avatarAdded) score += 10;
    if (profileSignals.coverAdded) score += 5;
    if (profileSignals.nameAdded) score += 5;
    if (profileSignals.bioAdded) score += 5;
    if (profileSignals.locationAdded) score += 3;
    if (profileSignals.websiteAdded) score += 2;

    // Account age
    if (ageSignals.established30Days) score += 5;
    if (ageSignals.established90Days) score += 5;
    if (ageSignals.established180Days) score += 5;
    if (ageSignals.established365Days) score += 10;

    // Healthy community activity
    if (activitySignals.hasPosts) score += 5;
    if (activitySignals.hasComments) score += 5;
    if (activitySignals.hasLikes) score += 2;
    if (activitySignals.hasReposts) score += 2;
    if (activitySignals.hasFollowers) score += 3;

    // ZRP verification
    if (user.badgeType) score += 8;

    // Hard cap
    score = Math.min(score, 100);

    /*
     * ---------------------------------------------------------------
     * TRUST LEVEL
     * ---------------------------------------------------------------
     */

    let level: "LOW" | "MODERATE" | "GOOD" | "HIGH" | "EXCELLENT";
    let levelLabel: string;

    if (score >= 90) {
      level = "EXCELLENT";
      levelLabel = "Excellent Trust";
    } else if (score >= 75) {
      level = "HIGH";
      levelLabel = "High Trust";
    } else if (score >= 55) {
      level = "GOOD";
      levelLabel = "Good Trust";
    } else if (score >= 35) {
      level = "MODERATE";
      levelLabel = "Moderate Trust";
    } else {
      level = "LOW";
      levelLabel = "Building Trust";
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
        verified: profileSignals.emailVerified,
        category: "SECURITY",
      },
      {
        key: "avatar",
        title: "Profile photo added",
        description: "A profile photo has been added to the account.",
        verified: profileSignals.avatarAdded,
        category: "PROFILE",
      },
      {
        key: "cover",
        title: "Profile banner added",
        description: "A profile banner has been added.",
        verified: profileSignals.coverAdded,
        category: "PROFILE",
      },
      {
        key: "name",
        title: "Display name added",
        description: "The account has a configured display name.",
        verified: profileSignals.nameAdded,
        category: "PROFILE",
      },
      {
        key: "bio",
        title: "Profile bio added",
        description: "The account has provided profile information.",
        verified: profileSignals.bioAdded,
        category: "PROFILE",
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
            : `This account has been on ZRP for ${Math.max(
                accountAgeMonths,
                0
              )} month${accountAgeMonths === 1 ? "" : "s"}.`,
        verified: accountAgeDays >= 30,
        category: "HISTORY",
      },
      {
        key: "community",
        title: "Community activity",
        description:
          "The account has participated in the ZRP community.",
        verified:
          activitySignals.hasPosts ||
          activitySignals.hasComments ||
          activitySignals.hasLikes ||
          activitySignals.hasReposts,
        category: "COMMUNITY",
      },
      {
        key: "followers",
        title: "Community connections",
        description:
          "The account has established connections with other ZRP users.",
        verified: activitySignals.hasFollowers,
        category: "COMMUNITY",
      },
      {
        key: "verified",
        title: "ZRP verification",
        description:
          "This account currently has a ZRP verification badge.",
        verified: Boolean(user.badgeType),
        category: "ZRP",
      },
    ];

    /*
     * We intentionally DO NOT expose:
     *
     * - email address
     * - IP address
     * - private moderation reports
     * - internal security signals
     * - private messages
     * - private account information
     */

    return NextResponse.json({
      passport: {
        score,
        level,
        levelLabel,
        generatedAt: new Date().toISOString(),
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
