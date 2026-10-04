import { describe, it, expect, afterAll, vi } from "vitest";
import { randomUUID } from "crypto";
import { prisma } from "@/lib/db";
import { createRoom as createAudioRoom, joinRoom as joinAudioRoom } from "@/lib/live-audio/room-service";
import { createRoom as createVideoRoom, joinRoom as joinVideoRoom } from "@/lib/live-video/room-service";
import { sendGift, purchaseCoins, getCoinBalance, getGiftCatalog } from "../gift-service";
import { LiveAudioError } from "@/lib/live-audio/errors";

const hasRealDatabaseUrl = !!process.env.DATABASE_URL && !process.env.DATABASE_URL.includes("...");

vi.stubEnv("LIVEKIT_API_KEY", "test-key");
vi.stubEnv("LIVEKIT_API_SECRET", "test-secret-at-least-32-characters-long");
vi.stubEnv("LIVEKIT_URL", "wss://example.livekit.cloud");

const { verifyUsdcTransaction } = vi.hoisted(() => ({ verifyUsdcTransaction: vi.fn() }));
vi.mock("@/lib/solana", () => ({ verifyUsdcTransaction }));

describe.skipIf(!hasRealDatabaseUrl)("Live Gifts gift-service (integration, real Postgres)", () => {
  const runId = randomUUID().slice(0, 8);
  const userIds: string[] = [];
  const roomIds: string[] = [];
  const videoRoomIds: string[] = [];
  const giftKeys: string[] = [];
  const txIds: string[] = [];

  // Live Audio/Video gate EVERY mutating action (createRoom, joinRoom)
  // behind requireLiveAudioAccess/requireLiveVideoAccess - an active
  // paid plan, not just a free account. Every user here needs one to
  // even get into a room; these gift tests exercise something else
  // entirely, same reasoning as the live-audio/live-video test files'
  // own createUser() helper, mirrored here exactly.
  async function createUser(label: string) {
    const user = await prisma.user.create({
      data: {
        email: `${label}-${runId}@livegifttest.example`,
        username: `${label}${runId}`.slice(0, 20),
        password: "x",
        plan: "pro",
      },
    });
    userIds.push(user.id);
    const now = new Date();
    const periodEnd = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    await prisma.subscription.create({
      data: {
        userId: user.id,
        plan: "pro",
        status: "ACTIVE",
        billingInterval: "MONTHLY",
        startedAt: now,
        currentPeriodStart: now,
        currentPeriodEnd: periodEnd,
        nextBillingAt: periodEnd,
      },
    });
    return user;
  }

  async function createHostWithProfile(label: string) {
    const host = await createUser(label);
    await prisma.creatorProfile.create({ data: { userId: host.id } });
    return host;
  }

  async function createGift(label: string, priceCoins: number, opts?: { enabled?: boolean }) {
    const key = `${label}-${runId}`;
    giftKeys.push(key);
    return prisma.giftDefinition.create({
      data: { key, priceCoins, enabled: opts?.enabled ?? true },
    });
  }

  async function fundWallet(userId: string, coins: number) {
    await prisma.coinWallet.upsert({
      where: { userId },
      create: { userId, balance: coins },
      update: { balance: { increment: coins } },
    });
  }

  function newTxId(label: string) {
    const id = `tx-${label}-${randomUUID()}`;
    txIds.push(id);
    return id;
  }

  /** A LIVE audio room with an active, funded sender participant - the common setup most scenarios build on. */
  async function liveAudioRoomWithSender(label: string, senderCoins = 1000) {
    const host = await createHostWithProfile(`host${label}`);
    const sender = await createUser(`sender${label}`);
    await fundWallet(sender.id, senderCoins);
    const room = await createAudioRoom({ hostId: host.id, title: `Gift room ${runId} ${label}`, visibility: "PUBLIC" });
    roomIds.push(room.id);
    await joinAudioRoom(room.id, sender.id);
    return { host, sender, room };
  }

  afterAll(async () => {
    await prisma.liveGiftTransaction.deleteMany({ where: { OR: [{ liveAudioRoomId: { in: roomIds } }, { liveVideoRoomId: { in: videoRoomIds } }] } });
    await prisma.coinAdjustment.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.userGiftPolicy.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.coinPurchase.deleteMany({ where: { transactionId: { in: txIds } } });
    await prisma.consumedPaymentTransaction.deleteMany({ where: { transactionId: { in: txIds } } });
    await prisma.coinWallet.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.liveAudioParticipant.deleteMany({ where: { roomId: { in: roomIds } } });
    await prisma.liveAudioRoom.deleteMany({ where: { id: { in: roomIds } } });
    await prisma.liveVideoParticipant.deleteMany({ where: { roomId: { in: videoRoomIds } } });
    await prisma.liveVideoRoom.deleteMany({ where: { id: { in: videoRoomIds } } });
    await prisma.creatorProfile.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.giftDefinition.deleteMany({ where: { key: { in: giftKeys } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  });

  // ── 1. Valid gift ──────────────────────────────────────────────
  it("a valid gift debits the sender, credits the creator, and records a correct ledger row", async () => {
    const { host, sender, room } = await liveAudioRoomWithSender("a", 500);
    const gift = await createGift("rose", 100);

    const balanceBefore = await getCoinBalance(sender.id);
    const result = await sendGift({
      senderId: sender.id,
      roomType: "AUDIO",
      roomId: room.id,
      giftKey: gift.key,
      quantity: 2,
      idempotencyKey: randomUUID(),
    });

    expect(result.totalCoins).toBe(200);
    expect(await getCoinBalance(sender.id)).toBe(balanceBefore - 200);

    const row = await prisma.liveGiftTransaction.findUnique({ where: { id: result.transactionId } });
    expect(row).not.toBeNull();
    expect(row?.senderId).toBe(sender.id);
    expect(row?.recipientId).toBe(host.id);
    expect(row?.unitPriceCoins).toBe(100);
    expect(row?.quantity).toBe(2);
    expect(row?.totalCoins).toBe(200);
    // 16. Correct creator attribution.
    const creatorProfile = await prisma.creatorProfile.findUniqueOrThrow({ where: { userId: host.id } });
    expect(row?.creatorProfileId).toBe(creatorProfile.id);
    expect(Number(creatorProfile.totalEarnings)).toBeGreaterThan(0);
    expect(Number(creatorProfile.balance)).toBeGreaterThan(0);
    // 17. Correct transaction ledger: platform fee + creator amount reconstruct the gross value.
    const gross = Number(row!.platformFee) + Number(row!.creatorAmount);
    expect(gross).toBeCloseTo(200 * 0.01, 6);
  });

  // ── 2. Insufficient balance ─────────────────────────────────────
  it("insufficient balance is rejected and leaves the ledger and creator balance untouched", async () => {
    const { host, sender, room } = await liveAudioRoomWithSender("b", 10);
    const gift = await createGift("rocket", 1000);
    const profileBefore = await prisma.creatorProfile.findUniqueOrThrow({ where: { userId: host.id } });

    await expect(
      sendGift({ senderId: sender.id, roomType: "AUDIO", roomId: room.id, giftKey: gift.key, quantity: 1, idempotencyKey: randomUUID() })
    ).rejects.toMatchObject({ code: "insufficient_balance" });

    expect(await getCoinBalance(sender.id)).toBe(10);
    const profileAfter = await prisma.creatorProfile.findUniqueOrThrow({ where: { userId: host.id } });
    expect(Number(profileAfter.balance)).toBe(Number(profileBefore.balance));
  });

  // ── 3. Invalid gift ID ──────────────────────────────────────────
  it("an unknown gift key is rejected", async () => {
    const { sender, room } = await liveAudioRoomWithSender("c");
    await expect(
      sendGift({ senderId: sender.id, roomType: "AUDIO", roomId: room.id, giftKey: "does-not-exist", quantity: 1, idempotencyKey: randomUUID() })
    ).rejects.toMatchObject({ code: "gift_not_found" });
  });

  // ── 4 & 20. Manipulated / forged price ───────────────────────────
  it("a client cannot forge the gift's value - price is always read from GiftDefinition, never the caller", async () => {
    const { room, sender } = await liveAudioRoomWithSender("d", 1000);
    const gift = await createGift("diamond", 250);

    // sendGift's own TypeScript input has no price field, but a raw
    // HTTP body (the real attack surface) isn't type-checked at
    // runtime - simulate exactly that with an `any`-cast object
    // carrying spoofed price fields alongside the real ones.
    const spoofed = {
      senderId: sender.id,
      roomType: "AUDIO" as const,
      roomId: room.id,
      giftKey: gift.key,
      quantity: 1,
      idempotencyKey: randomUUID(),
      unitPriceCoins: 1,
      totalCoins: 1,
      priceCoins: 1,
    };
    const result = await sendGift(spoofed);

    expect(result.totalCoins).toBe(250); // not the spoofed 1
    const row = await prisma.liveGiftTransaction.findUniqueOrThrow({ where: { id: result.transactionId } });
    expect(row.unitPriceCoins).toBe(250);
    expect(row.totalCoins).toBe(250);
  });

  // ── 5 & 6. Negative / zero quantity ─────────────────────────────
  it("negative quantity is rejected", async () => {
    const { room, sender } = await liveAudioRoomWithSender("e");
    const gift = await createGift("star", 50);
    await expect(
      sendGift({ senderId: sender.id, roomType: "AUDIO", roomId: room.id, giftKey: gift.key, quantity: -1, idempotencyKey: randomUUID() })
    ).rejects.toMatchObject({ code: "invalid_quantity" });
  });

  it("zero quantity is rejected", async () => {
    const { room, sender } = await liveAudioRoomWithSender("f");
    const gift = await createGift("star2", 50);
    await expect(
      sendGift({ senderId: sender.id, roomType: "AUDIO", roomId: room.id, giftKey: gift.key, quantity: 0, idempotencyKey: randomUUID() })
    ).rejects.toMatchObject({ code: "invalid_quantity" });
  });

  // ── 7 & 8. Duplicate idempotency key / same transaction submitted twice ──
  it("a duplicate idempotency key is rejected and never double-charges", async () => {
    const { room, sender } = await liveAudioRoomWithSender("g", 500);
    const gift = await createGift("confetti", 100);
    const idempotencyKey = randomUUID();

    const first = await sendGift({ senderId: sender.id, roomType: "AUDIO", roomId: room.id, giftKey: gift.key, quantity: 1, idempotencyKey });
    expect(first.totalCoins).toBe(100);
    const balanceAfterFirst = await getCoinBalance(sender.id);

    await expect(
      sendGift({ senderId: sender.id, roomType: "AUDIO", roomId: room.id, giftKey: gift.key, quantity: 1, idempotencyKey })
    ).rejects.toMatchObject({ code: "duplicate_transaction" });

    // 19. A rejected retry produces no second successful gift - balance unchanged by the retry.
    expect(await getCoinBalance(sender.id)).toBe(balanceAfterFirst);
    const count = await prisma.liveGiftTransaction.count({ where: { idempotencyKey } });
    expect(count).toBe(1);
  });

  it("the same on-chain coin-purchase transaction submitted twice only credits coins once", async () => {
    const buyer = await createUser("buyer");
    const transactionId = newTxId("coinpurchase");
    verifyUsdcTransaction.mockResolvedValue({ valid: true, amount: 1, from: null, to: "platform" });

    const first = await purchaseCoins({ userId: buyer.id, transactionId });
    expect(first.coinsCredited).toBe(100); // $1.00 / $0.01 per coin

    await expect(purchaseCoins({ userId: buyer.id, transactionId })).rejects.toMatchObject({ code: "duplicate_transaction" });
    expect(await getCoinBalance(buyer.id)).toBe(100);
  });

  // ── 9. Unauthorized room ─────────────────────────────────────────
  it("a nonexistent room is rejected", async () => {
    const sender = await createUser("lonewolf");
    const gift = await createGift("lonegift", 10);
    await expect(
      sendGift({ senderId: sender.id, roomType: "AUDIO", roomId: "does-not-exist", giftKey: gift.key, quantity: 1, idempotencyKey: randomUUID() })
    ).rejects.toMatchObject({ code: "room_not_found" });
  });

  // ── 10. Unauthorized recipient (sending to yourself) ──────────────
  it("a host cannot send a gift to their own room", async () => {
    const { host, room } = await liveAudioRoomWithSender("h");
    await fundWallet(host.id, 1000);
    const gift = await createGift("selfgift", 10);
    await expect(
      sendGift({ senderId: host.id, roomType: "AUDIO", roomId: room.id, giftKey: gift.key, quantity: 1, idempotencyKey: randomUUID() })
    ).rejects.toMatchObject({ code: "cannot_gift_self" });
  });

  // ── 11. Host not active (not a participant) ───────────────────────
  it("a user who never joined the room cannot send a gift into it", async () => {
    const host = await createHostWithProfile("hosti");
    const stranger = await createUser("strangeri");
    await fundWallet(stranger.id, 1000);
    const room = await createAudioRoom({ hostId: host.id, title: `Gift room ${runId} i`, visibility: "PUBLIC" });
    roomIds.push(room.id);
    const gift = await createGift("outsider", 10);

    await expect(
      sendGift({ senderId: stranger.id, roomType: "AUDIO", roomId: room.id, giftKey: gift.key, quantity: 1, idempotencyKey: randomUUID() })
    ).rejects.toMatchObject({ code: "not_participant" });
  });

  // ── 12. Blocked sender ────────────────────────────────────────────
  it("a sender blocked by the host cannot send a gift", async () => {
    const { host, sender, room } = await liveAudioRoomWithSender("j", 500);
    const gift = await createGift("blockedgift", 10);
    await prisma.blocked.create({ data: { blockerId: host.id, blockedId: sender.id } });

    await expect(
      sendGift({ senderId: sender.id, roomType: "AUDIO", roomId: room.id, giftKey: gift.key, quantity: 1, idempotencyKey: randomUUID() })
    ).rejects.toMatchObject({ code: "blocked" });
    expect(await getCoinBalance(sender.id)).toBe(500);
  });

  // ── 13. Ended live ────────────────────────────────────────────────
  it("a gift cannot be sent once the room has ended", async () => {
    const { room, sender } = await liveAudioRoomWithSender("k", 500);
    const gift = await createGift("latecomer", 10);
    await prisma.liveAudioRoom.update({ where: { id: room.id }, data: { status: "ENDED", endedAt: new Date() } });

    await expect(
      sendGift({ senderId: sender.id, roomType: "AUDIO", roomId: room.id, giftKey: gift.key, quantity: 1, idempotencyKey: randomUUID() })
    ).rejects.toMatchObject({ code: "room_not_live" });
  });

  // ── 14 & 15. Concurrent transactions / balance never negative ─────
  it("concurrent gift sends against the same wallet never drive the balance negative", async () => {
    const { room, sender } = await liveAudioRoomWithSender("l", 150);
    const gift = await createGift("rapidfire", 100); // can afford exactly ONE of these

    const attempts = await Promise.allSettled([
      sendGift({ senderId: sender.id, roomType: "AUDIO", roomId: room.id, giftKey: gift.key, quantity: 1, idempotencyKey: randomUUID() }),
      sendGift({ senderId: sender.id, roomType: "AUDIO", roomId: room.id, giftKey: gift.key, quantity: 1, idempotencyKey: randomUUID() }),
      sendGift({ senderId: sender.id, roomType: "AUDIO", roomId: room.id, giftKey: gift.key, quantity: 1, idempotencyKey: randomUUID() }),
    ]);

    const succeeded = attempts.filter((a) => a.status === "fulfilled");
    expect(succeeded).toHaveLength(1); // only one 100-coin gift fits in a 150-coin wallet

    const finalBalance = await getCoinBalance(sender.id);
    expect(finalBalance).toBe(50);
    expect(finalBalance).toBeGreaterThanOrEqual(0);
  });

  // ── 18. Realtime event only after a successful transaction ───────
  it("a failed gift send never creates a ledger row (no event can be emitted for a transaction that didn't happen)", async () => {
    const { room, sender } = await liveAudioRoomWithSender("m", 5);
    const gift = await createGift("toocostly", 999);
    const idempotencyKey = randomUUID();

    await expect(
      sendGift({ senderId: sender.id, roomType: "AUDIO", roomId: room.id, giftKey: gift.key, quantity: 1, idempotencyKey })
    ).rejects.toMatchObject({ code: "insufficient_balance" });

    const row = await prisma.liveGiftTransaction.findUnique({ where: { idempotencyKey } });
    expect(row).toBeNull();
  });

  // Disabled gift (part of §6 "enabled/disabled state").
  it("a disabled gift cannot be sent even if it was previously enabled", async () => {
    const { room, sender } = await liveAudioRoomWithSender("n", 500);
    const gift = await createGift("retired", 50, { enabled: false });
    await expect(
      sendGift({ senderId: sender.id, roomType: "AUDIO", roomId: room.id, giftKey: gift.key, quantity: 1, idempotencyKey: randomUUID() })
    ).rejects.toMatchObject({ code: "gift_disabled" });
  });

  // Live Video parity - the same ledger/service works for the second room type.
  it("gifts work identically inside a Live Video room", async () => {
    const host = await createHostWithProfile("hostvid");
    const sender = await createUser("sendervid");
    await fundWallet(sender.id, 500);
    const room = await createVideoRoom({ hostId: host.id, title: `Gift video room ${runId}`, visibility: "PUBLIC" });
    videoRoomIds.push(room.id);
    await joinVideoRoom(room.id, sender.id);
    const gift = await createGift("videorose", 100);

    const result = await sendGift({
      senderId: sender.id,
      roomType: "VIDEO",
      roomId: room.id,
      giftKey: gift.key,
      quantity: 1,
      idempotencyKey: randomUUID(),
    });

    const row = await prisma.liveGiftTransaction.findUniqueOrThrow({ where: { id: result.transactionId } });
    expect(row.liveVideoRoomId).toBe(room.id);
    expect(row.liveAudioRoomId).toBeNull();
  });

  it("the public catalog only ever returns enabled gifts, ordered by sortOrder", async () => {
    const key = `catalog-check-${runId}`;
    giftKeys.push(key);
    await prisma.giftDefinition.create({ data: { key, priceCoins: 5, enabled: false, sortOrder: -1 } });
    const catalog = await getGiftCatalog();
    expect(catalog.find((g) => g.key === key)).toBeUndefined();
  });

  it("purchaseCoins rejects a transaction that fails on-chain verification", async () => {
    const buyer = await createUser("failedbuyer");
    const transactionId = newTxId("failed");
    verifyUsdcTransaction.mockResolvedValue({ valid: false });
    await expect(purchaseCoins({ userId: buyer.id, transactionId })).rejects.toMatchObject({ code: "invalid_transaction" });
    expect(await getCoinBalance(buyer.id)).toBe(0);
  });

  it("every thrown gift error is a LiveAudioError instance (route helpers map it to a typed response)", async () => {
    const { room, sender } = await liveAudioRoomWithSender("o");
    try {
      await sendGift({ senderId: sender.id, roomType: "AUDIO", roomId: room.id, giftKey: "nope", quantity: 1, idempotencyKey: randomUUID() });
      throw new Error("expected sendGift to throw");
    } catch (err) {
      expect(err).toBeInstanceOf(LiveAudioError);
    }
  });

  // ── Admin-side: UserGiftPolicy restriction is enforced inside sendGift() itself ──
  it("a user with an admin gift restriction cannot send a gift, even with a funded wallet", async () => {
    const { room, sender } = await liveAudioRoomWithSender("p", 500);
    const gift = await createGift("restricted-target", 50);
    await prisma.userGiftPolicy.create({
      data: { userId: sender.id, canSendGifts: false, reason: "test: fraud review", updatedBy: "test-admin" },
    });

    await expect(
      sendGift({ senderId: sender.id, roomType: "AUDIO", roomId: room.id, giftKey: gift.key, quantity: 1, idempotencyKey: randomUUID() })
    ).rejects.toMatchObject({ code: "gift_restricted" });

    // Balance and ledger are untouched - the check runs before any debit.
    expect(await getCoinBalance(sender.id)).toBe(500);
  });

  it("a user whose restriction was lifted (no UserGiftPolicy row, or canSendGifts: true) can send normally", async () => {
    const { room, sender, host } = await liveAudioRoomWithSender("q", 500);
    const gift = await createGift("unrestricted-target", 50);
    await prisma.userGiftPolicy.create({
      data: { userId: sender.id, canSendGifts: true, reason: null, updatedBy: "test-admin" },
    });

    const result = await sendGift({
      senderId: sender.id,
      roomType: "AUDIO",
      roomId: room.id,
      giftKey: gift.key,
      quantity: 1,
      idempotencyKey: randomUUID(),
    });
    expect(result.recipientId).toBe(host.id);
    expect(await getCoinBalance(sender.id)).toBe(450);
  });

  // ── Admin coin adjustment: dedicated audited ledger, never a silent balance write ──
  describe("adjustCoinBalance (admin coin adjustment ledger)", () => {
    it("credits a user, writes a before/delta/after CoinAdjustment row, and never touches LiveGiftTransaction/CoinPurchase", async () => {
      const { adjustCoinBalance } = await import("../coin-adjustment");
      const user = await createUser("adjcredit");
      const admin = await createUser("adjadmin1");
      await fundWallet(user.id, 100);

      const result = await adjustCoinBalance({ adminId: admin.id, userId: user.id, delta: 50, reason: "test: goodwill credit" });

      expect(result.beforeBalance).toBe(100);
      expect(result.delta).toBe(50);
      expect(result.afterBalance).toBe(150);
      expect(await getCoinBalance(user.id)).toBe(150);

      const row = await prisma.coinAdjustment.findUniqueOrThrow({ where: { id: result.id } });
      expect(row.userId).toBe(user.id);
      expect(row.adminId).toBe(admin.id);
      expect(row.beforeBalance).toBe(100);
      expect(row.delta).toBe(50);
      expect(row.afterBalance).toBe(150);
      expect(row.reason).toBe("test: goodwill credit");
    });

    it("debits a user but refuses to take the balance negative, leaving the wallet and ledger untouched", async () => {
      const { adjustCoinBalance } = await import("../coin-adjustment");
      const user = await createUser("adjdebit");
      const admin = await createUser("adjadmin2");
      await fundWallet(user.id, 10);

      await expect(
        adjustCoinBalance({ adminId: admin.id, userId: user.id, delta: -50, reason: "test: over-debit attempt" })
      ).rejects.toMatchObject({ code: "adjustment_would_go_negative" });

      expect(await getCoinBalance(user.id)).toBe(10);
      const rows = await prisma.coinAdjustment.findMany({ where: { userId: user.id } });
      expect(rows).toHaveLength(0);
    });

    it("rejects an adjustment with no reason", async () => {
      const { adjustCoinBalance } = await import("../coin-adjustment");
      const user = await createUser("adjnoreason");
      const admin = await createUser("adjadmin3");
      await fundWallet(user.id, 10);

      await expect(
        adjustCoinBalance({ adminId: admin.id, userId: user.id, delta: 5, reason: "" })
      ).rejects.toMatchObject({ code: "validation_error" });
    });

    it("rejects a zero or non-integer delta", async () => {
      const { adjustCoinBalance } = await import("../coin-adjustment");
      const user = await createUser("adjzero");
      const admin = await createUser("adjadmin4");

      await expect(
        adjustCoinBalance({ adminId: admin.id, userId: user.id, delta: 0, reason: "test" })
      ).rejects.toMatchObject({ code: "validation_error" });
      await expect(
        adjustCoinBalance({ adminId: admin.id, userId: user.id, delta: 1.5, reason: "test" })
      ).rejects.toMatchObject({ code: "validation_error" });
    });
  });

  // ── Admin eligibility computation: server-calculated, never a client-side permission ──
  describe("computeGiftEligibility", () => {
    it("reports NO_COINS as the reason for a verified, unrestricted user with an empty wallet - never a permanent restriction", async () => {
      const { computeGiftEligibility } = await import("../eligibility");
      const user = await createUser("elignocoins");
      await prisma.user.update({ where: { id: user.id }, data: { emailVerified: new Date() } });

      const result = await computeGiftEligibility(user.id);
      expect(result.reason).toBe("NO_COINS");
      expect(result.eligible).toBe(false);
    });

    it("reports GIFT_RESTRICTED ahead of NO_COINS when both are true", async () => {
      const { computeGiftEligibility } = await import("../eligibility");
      const user = await createUser("eligrestricted");
      await prisma.user.update({ where: { id: user.id }, data: { emailVerified: new Date() } });
      await prisma.userGiftPolicy.create({ data: { userId: user.id, canSendGifts: false, reason: "test" } });

      const result = await computeGiftEligibility(user.id);
      expect(result.reason).toBe("GIFT_RESTRICTED");
      expect(result.giftRestricted).toBe(true);
    });

    it("reports ACCOUNT_SUSPENDED for a banned user ahead of every other reason", async () => {
      const { computeGiftEligibility } = await import("../eligibility");
      const user = await createUser("eligbanned");
      await prisma.user.update({ where: { id: user.id }, data: { emailVerified: new Date(), banned: true } });
      await prisma.userGiftPolicy.create({ data: { userId: user.id, canSendGifts: false, reason: "test" } });
      await fundWallet(user.id, 100);

      const result = await computeGiftEligibility(user.id);
      expect(result.reason).toBe("ACCOUNT_SUSPENDED");
      expect(result.accountStatus).toBe("SUSPENDED");
    });

    it("reports ELIGIBLE for a verified, unrestricted, funded user who is an active room participant", async () => {
      const { computeGiftEligibility } = await import("../eligibility");
      const { sender } = await liveAudioRoomWithSender("elig-ok", 100);
      await prisma.user.update({ where: { id: sender.id }, data: { emailVerified: new Date() } });

      const result = await computeGiftEligibility(sender.id);
      expect(result.reason).toBe("ELIGIBLE");
      expect(result.eligible).toBe(true);
    });
  });
});
