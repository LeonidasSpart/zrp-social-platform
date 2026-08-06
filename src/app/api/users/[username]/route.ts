import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function GET(
  req: NextRequest,
  { params }: { params: { username: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    const slug = params.username; // can be username or customUrl

    console.log("🔍 Looking for slug:", slug);

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
        customUrl: true,           // ✅ added
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
      }>>`
        SELECT 
          id, username, "customUrl", name, bio, "avatarUrl", "coverUrl", 
          location, country, website, "createdAt", "usernameChangedAt", 
          "isPrivate", "badgeType", "isAdmin", "pinnedPostId",
          "banned",
          "publicLikes", "publicFollowing"
        FROM "User"
        WHERE username ILIKE ${slug} OR "customUrl" ILIKE ${slug}
        LIMIT 1
      `;

      console.log("🔍 Raw SQL result count:", users.length);
      if (users.length === 0) {
        // Optionally log all usernames for debugging
        const allUsers = await prisma.$queryRaw<Array<{ username: string }>>`
          SELECT username FROM "User"
        `;
        console.log("🔍 All usernames in database:", allUsers.map(u => u.username));
        return NextResponse.json({ error: "User not found" }, { status: 404 });
      }

      const raw = users[0];

      // ─── Fetch counts separately ──────────────────────────────
      const [postsCount, followersCount, followingCount] = await Promise.all([
        prisma.post.count({ where: { authorId: raw.id, status: "published" } }),
        prisma.follow.count({ where: { followingId: raw.id } }),
        prisma.follow.count({ where: { followerId: raw.id } }),
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
      const follow = await prisma.follow.findUnique({
        where: {
          followerId_followingId: {
            followerId: session.user.id,
            followingId: user.id,
          },
        },
      });
      isFollowing = !!follow;

      const block = await prisma.blocked.findUnique({
        where: {
          blockerId_blockedId: {
            blockerId: session.user.id,
            blockedId: user.id,
          },
        },
      });
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
