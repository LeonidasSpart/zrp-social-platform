import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

function startOfUtcDay(d: Date) {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

// Runs once daily (Railway cron): picks a new Today's Challenge and
// expires duel invites nobody responded to in time. Same fail-closed
// CRON_SECRET auth as publish-scheduled-posts.
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const secret = process.env.CRON_SECRET;
  if (!secret || authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const today = startOfUtcDay(new Date());

    const alreadyRotatedToday = await prisma.playChallenge.findFirst({
      where: { isDaily: true, activeDate: today },
    });

    let rotated = false;
    if (!alreadyRotatedToday) {
      // Retire yesterday's daily slot, then promote a fresh pick that
      // hasn't been a daily challenge before, favoring variety.
      await prisma.playChallenge.updateMany({
        where: { isDaily: true },
        data: { isDaily: false },
      });

      const candidates = await prisma.playChallenge.findMany({
        where: { status: "ACTIVE", isDaily: false, activeDate: null },
        select: { id: true },
        take: 200,
      });

      const pool =
        candidates.length > 0
          ? candidates
          : await prisma.playChallenge.findMany({
              where: { status: "ACTIVE" },
              select: { id: true },
              take: 200,
            });

      if (pool.length > 0) {
        const pick = pool[Math.floor(Math.random() * pool.length)];
        await prisma.playChallenge.update({
          where: { id: pick.id },
          data: { isDaily: true, activeDate: today },
        });
        rotated = true;
      }
    }

    const { count: expiredCount } = await prisma.playDuel.updateMany({
      where: { status: "PENDING", expiresAt: { lt: new Date() } },
      data: { status: "EXPIRED" },
    });

    return NextResponse.json({
      message: rotated ? "Rotated today's daily challenge." : "Daily challenge already set for today.",
      rotated,
      expiredDuels: expiredCount,
    });
  } catch (error) {
    console.error("PLAY daily rotation cron error:", error);
    return NextResponse.json({ error: "Failed to run PLAY daily rotation" }, { status: 500 });
  }
}
