import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { prisma } from "@/lib/db";
import { Prisma } from "@prisma/client";
import { COIN_VALUE_USDC } from "@/lib/live-gifts/constants";

/**
 * Admin -> Live -> Gift Analytics (mission spec section 13), and -
 * via the `creatorId` query param - the creator drill-down in section 14
 * (gifts received / coin value / creator amount / rooms / dates for one
 * creator), so a second dedicated creator-analytics page/route doesn't
 * need to duplicate this aggregation logic.
 *
 * Every number here is computed straight from LiveGiftTransaction (the
 * authoritative ledger gift-service.ts's sendGift() writes inside its one
 * commit) via real aggregate/groupBy queries - never a client-supplied or
 * precomputed/cached figure.
 */
export async function GET(req: NextRequest) {
  const adminCheck = await requireAdmin();
  if (!adminCheck.authorized) return adminCheck.response;

  const creatorId = req.nextUrl.searchParams.get("creatorId") || undefined;
  const days = Math.min(365, Math.max(1, parseInt(req.nextUrl.searchParams.get("days") || "30") || 30));
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const where: Prisma.LiveGiftTransactionWhereInput = creatorId
    ? { recipientId: creatorId }
    : {};

  const [totals, audioCount, videoCount, topGiftsRaw, topSendersRaw, topCreatorsRaw, dailyRaw, rooms] =
    await Promise.all([
      prisma.liveGiftTransaction.aggregate({
        where,
        _count: { _all: true },
        _sum: { totalCoins: true, platformFee: true, charityAmount: true, creatorAmount: true },
      }),
      prisma.liveGiftTransaction.count({ where: { ...where, liveAudioRoomId: { not: null } } }),
      prisma.liveGiftTransaction.count({ where: { ...where, liveVideoRoomId: { not: null } } }),
      prisma.liveGiftTransaction.groupBy({
        by: ["giftDefinitionId"],
        where,
        _sum: { totalCoins: true, quantity: true },
        orderBy: { _sum: { totalCoins: "desc" } },
        take: 10,
      }),
      prisma.liveGiftTransaction.groupBy({
        by: ["senderId"],
        where,
        _sum: { totalCoins: true },
        orderBy: { _sum: { totalCoins: "desc" } },
        take: 10,
      }),
      creatorId
        ? Promise.resolve([])
        : prisma.liveGiftTransaction.groupBy({
            by: ["recipientId"],
            _sum: { creatorAmount: true, totalCoins: true },
            orderBy: { _sum: { creatorAmount: "desc" } },
            take: 10,
          }),
      prisma.liveGiftTransaction.findMany({
        where: { ...where, createdAt: { gte: since } },
        select: { createdAt: true, totalCoins: true },
      }),
      creatorId
        ? prisma.liveGiftTransaction.findMany({
            where,
            distinct: ["liveAudioRoomId", "liveVideoRoomId"],
            select: { liveAudioRoomId: true, liveVideoRoomId: true, createdAt: true },
            orderBy: { createdAt: "desc" },
            take: 50,
          })
        : Promise.resolve([]),
    ]);

  const giftIds = topGiftsRaw.map((g) => g.giftDefinitionId);
  const senderIds = topSendersRaw.map((s) => s.senderId);
  const creatorIds = topCreatorsRaw.map((c) => c.recipientId);

  const [giftDefs, senders, creators] = await Promise.all([
    giftIds.length
      ? prisma.giftDefinition.findMany({ where: { id: { in: giftIds } }, select: { id: true, key: true, iconUrl: true } })
      : Promise.resolve([]),
    senderIds.length
      ? prisma.user.findMany({ where: { id: { in: senderIds } }, select: { id: true, username: true, name: true, avatarUrl: true } })
      : Promise.resolve([]),
    creatorIds.length
      ? prisma.user.findMany({ where: { id: { in: creatorIds } }, select: { id: true, username: true, name: true, avatarUrl: true } })
      : Promise.resolve([]),
  ]);
  const giftById = new Map(giftDefs.map((g) => [g.id, g]));
  const userById = new Map([...senders, ...creators].map((u) => [u.id, u]));

  // Daily trend: bucket by UTC calendar day.
  const byDay = new Map<string, { gifts: number; coins: number }>();
  for (const row of dailyRaw) {
    const day = row.createdAt.toISOString().slice(0, 10);
    const bucket = byDay.get(day) ?? { gifts: 0, coins: 0 };
    bucket.gifts += 1;
    bucket.coins += row.totalCoins;
    byDay.set(day, bucket);
  }
  const dailyTrend = Array.from(byDay.entries())
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([date, v]) => ({ date, ...v }));

  const totalCoinsSpent = totals._sum.totalCoins ?? 0;
  const totalPlatformFee = Number(totals._sum.platformFee ?? 0);
  const totalCharity = Number(totals._sum.charityAmount ?? 0);
  const totalCreatorAmount = Number(totals._sum.creatorAmount ?? 0);

  const payload = {
    totalGifts: totals._count._all,
    totalCoinsSpent,
    totalUsdcValue: totalCoinsSpent * COIN_VALUE_USDC,
    totalPlatformFee,
    totalCharity,
    totalCreatorAmount,
    audioCount,
    videoCount,
    topGifts: topGiftsRaw.map((g) => ({
      gift: giftById.get(g.giftDefinitionId) ?? null,
      totalCoins: g._sum.totalCoins ?? 0,
      quantity: g._sum.quantity ?? 0,
    })),
    topSenders: topSendersRaw.map((s) => ({
      user: userById.get(s.senderId) ?? null,
      totalCoins: s._sum.totalCoins ?? 0,
    })),
    topCreators: creatorId
      ? []
      : topCreatorsRaw.map((c) => ({
          user: userById.get(c.recipientId) ?? null,
          creatorAmount: Number(c._sum.creatorAmount ?? 0),
          totalCoins: c._sum.totalCoins ?? 0,
        })),
    dailyTrend,
    ...(creatorId
      ? {
          creatorRooms: Array.from(
            new Map(
              rooms.map((r) => [
                r.liveAudioRoomId ?? r.liveVideoRoomId,
                {
                  roomType: r.liveAudioRoomId ? "AUDIO" : "VIDEO",
                  roomId: r.liveAudioRoomId ?? r.liveVideoRoomId,
                  lastGiftAt: r.createdAt,
                },
              ])
            ).values()
          ),
        }
      : {}),
  };

  return NextResponse.json(payload);
}
