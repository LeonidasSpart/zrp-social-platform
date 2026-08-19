import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { rateLimit } from "@/lib/rate-limit";

export async function GET(req: NextRequest, props: { params: Promise<{ username: string }> }) {
  const params = await props.params;
  // This is a public, unauthenticated-accessible profile lookup - it had
  // no rate limiting at all, leaving it open to username enumeration and
  // bulk profile scraping at volume.
  const limit = await rateLimit(req, { limit: 60, window: 60, type: "user-profile-get" });
  if (!limit.success) return limit.response;

  try {
    const session = await getServerSession(authOptions);
    const slug = params.username;

    // ─── 1. Try Prisma with OR condition (case‑insensitive) ─────
    let user = await prisma.user.findFirst({
      where: {
        OR: [
          {
            username: {
              equals: slug,
              mode: "insensitive",
            },
          },
          {
            customUrl: {
              equals: slug,
              mode: "insensitive",
            },
          },
        ],
      },
      select: {
        id: true,
        username: true,
        customUrl: true,
        name: true,
        bio: true,
        avatarUrl: true,
        coverUrl: true,
        location: true,
        country: true,
        website: true,
        createdAt: true,
        usernameChangedAt: true,
        isPrivate: true,
        badgeType: true,
        isAdmin: true,
        pinnedPostId: true,
        banned: true,
        publicLikes: true,
        publicFollowing: true,
        solanaWallet: true, // ✅ added
        category: true,
        showCategory: true,
        creatorProfile: {
          select: {
            tipsEnabled: true,
          },
        },
        _count: {
          select: {
            posts: true,
            followers: true,
            following: true,
          },
        },
      },
    });

    // ─── 2. If not found, try raw SQL with ILIKE on both fields ─
    if (!user) {
      console.log("🔍 Prisma OR returned null, trying raw SQL...");

      const users = await prisma.$queryRaw<Array<{
        id: string;
        username: string;
        customUrl: string | null;
        name: string | null;
        bio: string | null;
        avatarUrl: string | null;
        coverUrl: string | null;
        location: string | null;
        country: string | null;
        website: string | null;
        createdAt: Date;
        usernameChangedAt: Date | null;
        isPrivate: boolean;
        badgeType: string | null;
        isAdmin: boolean;
        pinnedPostId: string | null;
        banned: boolean;
        publicLikes: boolean;
        publicFollowing: boolean;
        solanaWallet: string | null; // ✅ added
        category: string | null;
        showCategory: boolean;
      }>>`
        SELECT 
          id, username, "customUrl", name, bio, "avatarUrl", "coverUrl", 
          location, country, website, "createdAt", "usernameChangedAt", 
          "isPrivate", "badgeType", "isAdmin", "pinnedPostId",
          "banned",
          "publicLikes", "publicFollowing",
          "solanaWallet", "category", "showCategory"
        FROM "User"
        WHERE username ILIKE ${slug} OR "customUrl" ILIKE ${slug}
        LIMIT 1
      `;

      console.log("🔍 Raw SQL result count:", users.length);
      if (users.length === 0) {
        return NextResponse.json({ error: "User not found" }, { status: 404 });
      }

      const raw = users[0];

      // ─── Fetch counts & creatorProfile separately ──────────────
      const [postsCount, followersCount, followingCount, creatorProfile] = await Promise.all([
        prisma.post.count({ where: { authorId: raw.id, status: "published" } }),
        prisma.follow.count({ where: { followingId: raw.id } }),
        prisma.follow.count({ where: { followerId: raw.id } }),
        prisma.creatorProfile.findUnique({
          where: { userId: raw.id },
          select: { tipsEnabled: true },
        }),
      ]);

      user = {
        id: raw.id,
        username: raw.username,
        customUrl: raw.customUrl,
        name: raw.name,
        bio: raw.bio,
        avatarUrl: raw.avatarUrl,
        coverUrl: raw.coverUrl,
        location: raw.location,
        country: raw.country,
        website: raw.website,
        createdAt: raw.createdAt,
        usernameChangedAt: raw.usernameChangedAt,
        isPrivate: raw.isPrivate,
        badgeType: raw.badgeType,
        isAdmin: raw.isAdmin,
        pinnedPostId: raw.pinnedPostId,
        banned: raw.banned,
        publicLikes: raw.publicLikes,
        publicFollowing: raw.publicFollowing,
        solanaWallet: raw.solanaWallet, // ✅ added
        category: raw.category,
        showCategory: raw.showCategory,
        creatorProfile,
        _count: {
          posts: postsCount,
          followers: followersCount,
          following: followingCount,
        },
      };
    }

    // ─── FOLLOW / BLOCK STATUS ──────────────────────────────────────
    let isFollowing = false;
    let isBlocked = false;

    if (session?.user?.id && session.user.id !== user.id) {
      // Independent lookups (no shared dependency), previously sequential.
      const [follow, block] = await Promise.all([
        prisma.follow.findUnique({
          where: {
            followerId_followingId: {
              followerId: session.user.id,
              followingId: user.id,
            },
          },
        }),
        prisma.blocked.findUnique({
          where: {
            blockerId_blockedId: {
              blockerId: session.user.id,
              blockedId: user.id,
            },
          },
        }),
      ]);
      isFollowing = !!follow;
      isBlocked = !!block;
    }

    return NextResponse.json({
      ...user,
      isFollowing,
      isBlocked,
    });
  } catch (error) {
    console.error("Error fetching user:", error);
    return NextResponse.json(
      { error: "Failed to fetch user" },
      { status: 500 }
    );
  }
}
