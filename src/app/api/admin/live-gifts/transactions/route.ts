import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { prisma } from "@/lib/db";
import { Prisma } from "@prisma/client";

/**
 * Admin -> Live -> Gift Transactions (mission spec section 10), and also
 * powers section 15's "per room gift inspection" - filtering by
 * roomType + roomId here IS that room-inspection view, rather than a
 * second duplicate endpoint under live-audio/live-video.
 *
 * All money/coin fields returned are read straight off the authoritative
 * LiveGiftTransaction row written by gift-service.ts's sendGift() -
 * never recomputed or re-derived here.
 */
export async function GET(req: NextRequest) {
  const adminCheck = await requireAdmin();
  if (!adminCheck.authorized) return adminCheck.response;

  const sp = req.nextUrl.searchParams;
  const search = sp.get("search")?.trim() || "";
  const roomType = sp.get("roomType") || ""; // AUDIO | VIDEO
  const senderId = sp.get("senderId") || "";
  const recipientId = sp.get("recipientId") || "";
  const giftKey = sp.get("giftKey") || "";
  const roomId = sp.get("roomId") || "";
  const dateFrom = sp.get("dateFrom");
  const dateTo = sp.get("dateTo");
  const minCoins = sp.get("minCoins");
  const maxCoins = sp.get("maxCoins");
  const page = Math.max(1, parseInt(sp.get("page") || "1") || 1);
  const limit = Math.min(100, Math.max(1, parseInt(sp.get("limit") || "25") || 25));

  const where: Prisma.LiveGiftTransactionWhereInput = {};

  if (roomType === "AUDIO") where.liveAudioRoomId = { not: null };
  else if (roomType === "VIDEO") where.liveVideoRoomId = { not: null };

  if (roomId) where.OR = [{ liveAudioRoomId: roomId }, { liveVideoRoomId: roomId }];
  if (senderId) where.senderId = senderId;
  if (recipientId) where.recipientId = recipientId;
  if (giftKey) where.giftDefinition = { key: giftKey };

  if (dateFrom || dateTo) {
    where.createdAt = {};
    if (dateFrom) where.createdAt.gte = new Date(dateFrom);
    if (dateTo) where.createdAt.lte = new Date(dateTo);
  }
  if (minCoins || maxCoins) {
    where.totalCoins = {};
    if (minCoins) where.totalCoins.gte = parseInt(minCoins) || 0;
    if (maxCoins) where.totalCoins.lte = parseInt(maxCoins) || 0;
  }

  if (search) {
    where.AND = [
      ...(Array.isArray(where.AND) ? where.AND : where.AND ? [where.AND] : []),
      {
        OR: [
          { id: search },
          { liveAudioRoomId: search },
          { liveVideoRoomId: search },
          { sender: { username: { contains: search, mode: "insensitive" } } },
          { recipient: { username: { contains: search, mode: "insensitive" } } },
        ],
      },
    ];
  }

  const [rows, total] = await Promise.all([
    prisma.liveGiftTransaction.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
      include: {
        sender: { select: { id: true, username: true, name: true, avatarUrl: true } },
        recipient: { select: { id: true, username: true, name: true, avatarUrl: true } },
        giftDefinition: { select: { key: true, iconUrl: true, priceCoins: true } },
      },
    }),
    prisma.liveGiftTransaction.count({ where }),
  ]);

  const transactions = rows.map((r) => ({
    id: r.id,
    sender: r.sender,
    recipient: r.recipient,
    roomType: r.liveAudioRoomId ? "AUDIO" : "VIDEO",
    roomId: r.liveAudioRoomId ?? r.liveVideoRoomId,
    gift: r.giftDefinition,
    quantity: r.quantity,
    totalCoins: r.totalCoins,
    grossUsdc: Number(r.platformFee) + Number(r.creatorAmount),
    platformFee: Number(r.platformFee),
    charityAmount: Number(r.charityAmount),
    creatorAmount: Number(r.creatorAmount),
    createdAt: r.createdAt,
  }));

  return NextResponse.json({ transactions, total, page, limit });
}
