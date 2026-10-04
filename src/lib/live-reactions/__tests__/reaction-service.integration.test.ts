import { describe, it, expect, afterAll, vi } from "vitest";
import { randomUUID } from "crypto";
import { prisma } from "@/lib/db";
import { createRoom as createAudioRoom, joinRoom as joinAudioRoom } from "@/lib/live-audio/room-service";
import { sendReaction } from "../reaction-service";

const hasRealDatabaseUrl = !!process.env.DATABASE_URL && !process.env.DATABASE_URL.includes("...");

vi.stubEnv("LIVEKIT_API_KEY", "test-key");
vi.stubEnv("LIVEKIT_API_SECRET", "test-secret-at-least-32-characters-long");
vi.stubEnv("LIVEKIT_URL", "wss://example.livekit.cloud");

describe.skipIf(!hasRealDatabaseUrl)("Live Reactions reaction-service (integration, real Postgres)", () => {
  const runId = randomUUID().slice(0, 8);
  const userIds: string[] = [];
  const roomIds: string[] = [];

  async function createUser(label: string) {
    const user = await prisma.user.create({
      data: {
        email: `${label}-${runId}@livereactiontest.example`,
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

  async function roomWithViewer(label: string) {
    const host = await createUser(`host${label}`);
    const viewer = await createUser(`viewer${label}`);
    const room = await createAudioRoom({ hostId: host.id, title: `Reaction room ${runId} ${label}`, visibility: "PUBLIC" });
    roomIds.push(room.id);
    await joinAudioRoom(room.id, viewer.id);
    return { host, viewer, room };
  }

  afterAll(async () => {
    await prisma.liveAudioParticipant.deleteMany({ where: { roomId: { in: roomIds } } });
    await prisma.liveAudioRoom.deleteMany({ where: { id: { in: roomIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  });

  it("a tap increments the room's aggregate reaction count - no per-tap row is created", async () => {
    const { viewer, room } = await roomWithViewer("a");
    const result = await sendReaction({ userId: viewer.id, roomType: "AUDIO", roomId: room.id });
    expect(result.roomReactionCount).toBe(1);

    const updated = await prisma.liveAudioRoom.findUniqueOrThrow({ where: { id: room.id } });
    expect(updated.reactionCount).toBe(1);
  });

  it("a batched tap count increments by the batch size in one write", async () => {
    const { viewer, room } = await roomWithViewer("b");
    const result = await sendReaction({ userId: viewer.id, roomType: "AUDIO", roomId: room.id, count: 5 });
    expect(result.roomReactionCount).toBe(5);
  });

  it("a non-participant cannot react", async () => {
    const { room } = await roomWithViewer("c");
    const stranger = await createUser("strangerc");
    await expect(
      sendReaction({ userId: stranger.id, roomType: "AUDIO", roomId: room.id })
    ).rejects.toMatchObject({ code: "not_participant" });
  });

  it("reactions cannot be sent once the room has ended", async () => {
    const { viewer, room } = await roomWithViewer("d");
    await prisma.liveAudioRoom.update({ where: { id: room.id }, data: { status: "ENDED", endedAt: new Date() } });
    await expect(
      sendReaction({ userId: viewer.id, roomType: "AUDIO", roomId: room.id })
    ).rejects.toMatchObject({ code: "room_not_live" });
  });

  it("an excessive batch count is capped, not applied verbatim", async () => {
    const { viewer, room } = await roomWithViewer("e");
    const result = await sendReaction({ userId: viewer.id, roomType: "AUDIO", roomId: room.id, count: 10_000 });
    expect(result.roomReactionCount).toBeLessThanOrEqual(20);
  });

  it("rapid taps past the rate limit are rejected", async () => {
    const { viewer, room } = await roomWithViewer("f");
    let rejected = false;
    for (let i = 0; i < 80; i++) {
      try {
        await sendReaction({ userId: viewer.id, roomType: "AUDIO", roomId: room.id });
      } catch (err) {
        expect(err).toMatchObject({ code: "rate_limited" });
        rejected = true;
        break;
      }
    }
    expect(rejected).toBe(true);
  });
});
