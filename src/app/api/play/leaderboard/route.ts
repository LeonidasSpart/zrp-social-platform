export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { prisma } from "@/lib/db";
import type { Prisma } from "@prisma/client";

const LEADERBOARD_SIZE = 50;

const USER_SELECT = {
  id: true,
  username: true,
  name: true,
  avatarUrl: true,
  badgeType: true,
  country: true,
} as const;

// ─── GET: leaderboard - global | country | friends ──────────────────
// "friends" ranks the accounts the caller follows (plus themselves),
// reusing the existing Follow graph rather than a separate friends
// system, per the reuse-don't-duplicate instruction.
export async function GET(req: NextRequest) {
  try {
    const scope = req.nextUrl.searchParams.get("scope") || "global";
    const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });

    const where: Prisma.PlayProfileWhereInput = {};

    if (scope === "country") {
      if (!token) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
      const me = await prisma.user.findUnique({ where: { id: token.id as string }, select: { country: true } });
      if (!me?.country) {
        return NextResponse.json({ leaderboard: [], myRank: null });
      }
      where.user = { country: me.country };
    } else if (scope === "friends") {
      if (!token) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
      const following = await prisma.follow.findMany({
        where: { followerId: token.id as string },
        select: { followingId: true },
      });
      const ids = [...following.map((f) => f.followingId), token.id as string];
      where.userId = { in: ids };
    }

    const profiles = await prisma.playProfile.findMany({
      where,
      orderBy: { totalXp: "desc" },
      take: LEADERBOARD_SIZE,
      select: {
        userId: true,
        totalXp: true,
        level: true,
        currentStreak: true,
        challengesCompleted: true,
        duelsWon: true,
        user: { select: USER_SELECT },
      },
    });

    const leaderboard = profiles.map((p, i) => ({ rank: i + 1, ...p }));

    let myRank: number | null = null;
    if (token) {
      const myEntry = leaderboard.find((p) => p.userId === token.id);
      if (myEntry) {
        myRank = myEntry.rank;
      } else {
        const myProfile = await prisma.playProfile.findUnique({ where: { userId: token.id as string } });
        if (myProfile) {
          myRank = (await prisma.playProfile.count({ where: { ...where, totalXp: { gt: myProfile.totalXp } } })) + 1;
        }
      }
    }

    return NextResponse.json({ leaderboard, myRank });
  } catch (error) {
    console.error("Error fetching PLAY leaderboard:", error);
    return NextResponse.json({ error: "Failed to fetch leaderboard" }, { status: 500 });
  }
}
