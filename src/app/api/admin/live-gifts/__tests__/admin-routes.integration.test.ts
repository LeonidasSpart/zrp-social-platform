import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import { NextRequest } from "next/server";
import { randomUUID } from "crypto";

vi.stubEnv("LIVEKIT_API_KEY", "test-key");
vi.stubEnv("LIVEKIT_API_SECRET", "test-secret-at-least-32-characters-long");
vi.stubEnv("LIVEKIT_URL", "wss://example.livekit.cloud");

const { requireAdmin } = vi.hoisted(() => ({ requireAdmin: vi.fn() }));
vi.mock("@/lib/admin", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/admin")>();
  return { ...actual, requireAdmin };
});

import { prisma } from "@/lib/db";
import { POST as createGiftRoute } from "../route";
import { PATCH as patchGiftRoute } from "../[id]/route";
import { GET as listWalletsRoute } from "../coin-wallets/route";
import { POST as adjustRoute } from "../coin-wallets/[userId]/adjust/route";
import { GET as getEligibilityRoute, PATCH as patchEligibilityRoute } from "../eligibility/[userId]/route";
import { GET as listTransactionsRoute } from "../transactions/route";
import { GET as listPurchasesRoute } from "../purchases/route";
import { sendGift } from "@/lib/live-gifts/gift-service";
import { createRoom as createAudioRoom, joinRoom as joinAudioRoom } from "@/lib/live-audio/room-service";

const hasRealDatabaseUrl = !!process.env.DATABASE_URL && !process.env.DATABASE_URL.includes("...");

function jsonReq(url: string, body?: unknown, method = "POST") {
  return new NextRequest(url, {
    method,
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
}

function asAdmin(adminId = "admin-stub") {
  requireAdmin.mockResolvedValue({
    authorized: true,
    session: { user: { id: adminId, username: "admin" } },
  });
}

function asUnauthorized() {
  const response = new Response(JSON.stringify({ error: "Forbidden" }), { status: 403 });
  requireAdmin.mockResolvedValue({ authorized: false, response });
}

describe.skipIf(!hasRealDatabaseUrl)("Admin Live Gifts routes (integration, real Postgres)", () => {
  const suffix = randomUUID().slice(0, 8);
  const userIds: string[] = [];
  const giftKeys: string[] = [];
  const roomIds: string[] = [];

  async function createUser(label: string) {
    const user = await prisma.user.create({
      data: { email: `${label}-${suffix}@admingifttest.example`, username: `${label}${suffix}`.slice(0, 20), password: "x", plan: "pro" },
    });
    userIds.push(user.id);
    return user;
  }

  afterAll(async () => {
    await prisma.liveGiftTransaction.deleteMany({ where: { liveAudioRoomId: { in: roomIds } } });
    await prisma.coinAdjustment.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.userGiftPolicy.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.coinWallet.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.liveAudioParticipant.deleteMany({ where: { roomId: { in: roomIds } } });
    await prisma.liveAudioRoom.deleteMany({ where: { id: { in: roomIds } } });
    await prisma.creatorProfile.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.giftDefinition.deleteMany({ where: { key: { in: giftKeys } } });
    await prisma.auditLog.deleteMany({ where: { actorId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  });

  it("rejects every route when requireAdmin says unauthorized", async () => {
    asUnauthorized();
    const res1 = await createGiftRoute(jsonReq("https://zrp.one/api/admin/live-gifts", { key: "x", priceCoins: 1 }));
    expect(res1.status).toBe(403);

    const res2 = await listWalletsRoute(new NextRequest("https://zrp.one/api/admin/live-gifts/coin-wallets"));
    expect(res2.status).toBe(403);
  });

  it("validates key format, price, and icon/animation URLs on gift creation", async () => {
    asAdmin();
    const badKey = await createGiftRoute(jsonReq("https://zrp.one/api/admin/live-gifts", { key: "Not Valid!", priceCoins: 10 }));
    expect(badKey.status).toBe(400);

    const badPrice = await createGiftRoute(
      jsonReq("https://zrp.one/api/admin/live-gifts", { key: `gift-${suffix}-a`, priceCoins: 0 })
    );
    expect(badPrice.status).toBe(400);

    const badUrl = await createGiftRoute(
      jsonReq("https://zrp.one/api/admin/live-gifts", { key: `gift-${suffix}-b`, priceCoins: 10, iconUrl: "javascript:alert(1)" })
    );
    expect(badUrl.status).toBe(400);
  });

  it("creates a gift, rejects a duplicate key, then disables it via PATCH (never DELETE)", async () => {
    asAdmin();
    const key = `gift-${suffix}-dup`;
    giftKeys.push(key);
    const created = await createGiftRoute(jsonReq("https://zrp.one/api/admin/live-gifts", { key, priceCoins: 25 }));
    expect(created.status).toBe(201);
    const giftBody = await created.json();

    const dup = await createGiftRoute(jsonReq("https://zrp.one/api/admin/live-gifts", { key, priceCoins: 25 }));
    expect(dup.status).toBe(409);

    const disabled = await patchGiftRoute(
      jsonReq(`https://zrp.one/api/admin/live-gifts/${giftBody.gift.id}`, { enabled: false }, "PATCH"),
      { params: Promise.resolve({ id: giftBody.gift.id }) }
    );
    expect(disabled.status).toBe(200);
    const disabledBody = await disabled.json();
    expect(disabledBody.gift.enabled).toBe(false);

    const auditRows = await prisma.auditLog.findMany({ where: { action: "live_gifts.update", targetId: giftBody.gift.id } });
    expect(auditRows.length).toBeGreaterThan(0);
  });

  it("restricting a user via the eligibility PATCH route actually blocks sendGift, and unrestricting un-blocks it", async () => {
    asAdmin();
    const admin = await createUser("eligadmin");
    const host = await createUser("elighost");
    await prisma.creatorProfile.create({ data: { userId: host.id } });
    const sender = await createUser("eligsender");
    await prisma.user.update({ where: { id: sender.id }, data: { emailVerified: new Date() } });
    await prisma.coinWallet.create({ data: { userId: sender.id, balance: 500 } });

    const room = await createAudioRoom({ hostId: host.id, title: `Admin gift test room ${suffix}`, visibility: "PUBLIC" });
    roomIds.push(room.id);
    await joinAudioRoom(room.id, sender.id);

    const key = `gift-${suffix}-elig`;
    giftKeys.push(key);
    const gift = await prisma.giftDefinition.create({ data: { key, priceCoins: 10 } });

    requireAdmin.mockResolvedValue({ authorized: true, session: { user: { id: admin.id, username: "eligadmin" } } });
    const restrictRes = await patchEligibilityRoute(
      jsonReq(`https://zrp.one/api/admin/live-gifts/eligibility/${sender.id}`, { canSendGifts: false, reason: "test restriction" }, "PATCH"),
      { params: Promise.resolve({ userId: sender.id }) }
    );
    expect(restrictRes.status).toBe(200);

    await expect(
      sendGift({ senderId: sender.id, roomType: "AUDIO", roomId: room.id, giftKey: gift.key, quantity: 1, idempotencyKey: randomUUID() })
    ).rejects.toMatchObject({ code: "gift_restricted" });

    const getRes = await getEligibilityRoute(new NextRequest(`https://zrp.one/api/admin/live-gifts/eligibility/${sender.id}`), {
      params: Promise.resolve({ userId: sender.id }),
    });
    const getBody = await getRes.json();
    expect(getBody.reason).toBe("GIFT_RESTRICTED");
    expect(getBody.eligible).toBe(false);

    const unrestrictRes = await patchEligibilityRoute(
      jsonReq(`https://zrp.one/api/admin/live-gifts/eligibility/${sender.id}`, { canSendGifts: true }, "PATCH"),
      { params: Promise.resolve({ userId: sender.id }) }
    );
    expect(unrestrictRes.status).toBe(200);

    const result = await sendGift({
      senderId: sender.id,
      roomType: "AUDIO",
      roomId: room.id,
      giftKey: gift.key,
      quantity: 1,
      idempotencyKey: randomUUID(),
    });
    expect(result.recipientId).toBe(host.id);
  });

  it("the coin adjustment route writes an audited ledger row and rejects a reason-less request", async () => {
    const admin = await createUser("adjrouteadmin");
    const user = await createUser("adjrouteuser");
    await prisma.coinWallet.create({ data: { userId: user.id, balance: 20 } });

    requireAdmin.mockResolvedValue({ authorized: true, session: { user: { id: admin.id, username: "adjrouteadmin" } } });

    const noReason = await adjustRoute(jsonReq(`https://zrp.one/api/admin/live-gifts/coin-wallets/${user.id}/adjust`, { delta: 10, reason: "" }), {
      params: Promise.resolve({ userId: user.id }),
    });
    expect(noReason.status).toBe(400);

    const ok = await adjustRoute(
      jsonReq(`https://zrp.one/api/admin/live-gifts/coin-wallets/${user.id}/adjust`, { delta: 30, reason: "test: support credit" }),
      { params: Promise.resolve({ userId: user.id }) }
    );
    expect(ok.status).toBe(200);
    const okBody = await ok.json();
    expect(okBody.adjustment.beforeBalance).toBe(20);
    expect(okBody.adjustment.afterBalance).toBe(50);

    const wallet = await prisma.coinWallet.findUniqueOrThrow({ where: { userId: user.id } });
    expect(wallet.balance).toBe(50);

    const auditRows = await prisma.auditLog.findMany({ where: { action: "live_gifts.coin_adjustment", targetId: user.id } });
    expect(auditRows.length).toBe(1);
  });

  it("lists coin wallets filtered by status and balance", async () => {
    asAdmin();
    const user = await createUser("walletlistuser");
    await prisma.coinWallet.create({ data: { userId: user.id, balance: 0 } });

    const res = await listWalletsRoute(new NextRequest(`https://zrp.one/api/admin/live-gifts/coin-wallets?status=ZERO&search=${user.username}`));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.wallets.some((w: { userId: string }) => w.userId === user.id)).toBe(true);
  });

  it("lists gift transactions filtered by room type, and coin purchases filtered by status", async () => {
    asAdmin();
    const txRes = await listTransactionsRoute(new NextRequest("https://zrp.one/api/admin/live-gifts/transactions?roomType=AUDIO&limit=5"));
    expect(txRes.status).toBe(200);
    const txBody = await txRes.json();
    expect(Array.isArray(txBody.transactions)).toBe(true);

    const purchaseRes = await listPurchasesRoute(new NextRequest("https://zrp.one/api/admin/live-gifts/purchases?status=COMPLETED&limit=5"));
    expect(purchaseRes.status).toBe(200);
    const purchaseBody = await purchaseRes.json();
    expect(Array.isArray(purchaseBody.purchases)).toBe(true);
  });
});
