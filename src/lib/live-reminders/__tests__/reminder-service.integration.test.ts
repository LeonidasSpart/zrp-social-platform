import { describe, it, expect, afterAll, vi } from "vitest";
import { randomUUID } from "crypto";
import { prisma } from "@/lib/db";
import { createRoom, startScheduledRoom } from "@/lib/live-audio/room-service";
import { createReminder, cancelReminder, hasReminder } from "../reminder-service";

const hasRealDatabaseUrl = !!process.env.DATABASE_URL && !process.env.DATABASE_URL.includes("...");

vi.stubEnv("LIVEKIT_API_KEY", "test-key");
vi.stubEnv("LIVEKIT_API_SECRET", "test-secret-at-least-32-characters-long");
vi.stubEnv("LIVEKIT_URL", "wss://example.livekit.cloud");

describe.skipIf(!hasRealDatabaseUrl)("Live Reminders reminder-service (integration, real Postgres)", () => {
  const runId = randomUUID().slice(0, 8);
  const userIds: string[] = [];
  const roomIds: string[] = [];

  async function createUser(label: string) {
    const user = await prisma.user.create({
      data: {
        email: `${label}-${runId}@livereminder.example`,
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

  async function scheduledRoom(label: string, inMinutes = 60) {
    const host = await createUser(`host${label}`);
    const room = await createRoom({
      hostId: host.id,
      title: `Scheduled ${runId} ${label}`,
      visibility: "PUBLIC",
      scheduledAt: new Date(Date.now() + inMinutes * 60_000),
    });
    roomIds.push(room.id);
    return { host, room };
  }

  afterAll(async () => {
    await prisma.liveReminder.deleteMany({ where: { liveAudioRoomId: { in: roomIds } } });
    await prisma.liveAudioParticipant.deleteMany({ where: { roomId: { in: roomIds } } });
    await prisma.liveAudioRoom.deleteMany({ where: { id: { in: roomIds } } });
    await prisma.notification.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  });

  it("subscribing twice is idempotent, not an error", async () => {
    const { room } = await scheduledRoom("a");
    const fan = await createUser("fana");
    await createReminder(fan.id, "AUDIO", room.id);
    await createReminder(fan.id, "AUDIO", room.id);
    expect(await hasReminder(fan.id, "AUDIO", room.id)).toBe(true);

    const count = await prisma.liveReminder.count({ where: { userId: fan.id, liveAudioRoomId: room.id } });
    expect(count).toBe(1);
  });

  it("canceling a reminder removes it", async () => {
    const { room } = await scheduledRoom("b");
    const fan = await createUser("fanb");
    await createReminder(fan.id, "AUDIO", room.id);
    await cancelReminder(fan.id, "AUDIO", room.id);
    expect(await hasReminder(fan.id, "AUDIO", room.id)).toBe(false);
  });

  it("a host cannot set a reminder for their own room", async () => {
    const { host, room } = await scheduledRoom("c");
    await expect(createReminder(host.id, "AUDIO", room.id)).rejects.toMatchObject({ code: "cannot_remind_self" });
  });

  it("a reminder can't be set on a room that isn't scheduled (already live)", async () => {
    const { host, room } = await scheduledRoom("d");
    await startScheduledRoom(room.id, host.id);
    const fan = await createUser("fand");
    await expect(createReminder(fan.id, "AUDIO", room.id)).rejects.toMatchObject({ code: "not_scheduled" });
  });

  it("starting the scheduled room notifies every subscriber exactly once", async () => {
    const { host, room } = await scheduledRoom("e");
    const fan1 = await createUser("fane1");
    const fan2 = await createUser("fane2");
    await createReminder(fan1.id, "AUDIO", room.id);
    await createReminder(fan2.id, "AUDIO", room.id);

    await startScheduledRoom(room.id, host.id);

    const notifications = await prisma.notification.findMany({
      where: { type: "live_audio_started", fromUserId: host.id, userId: { in: [fan1.id, fan2.id] } },
    });
    expect(notifications).toHaveLength(2);
  });

  it("a user who never subscribed gets no notification when the room starts", async () => {
    const { host, room } = await scheduledRoom("f");
    const bystander = await createUser("bystanderf");
    await startScheduledRoom(room.id, host.id);

    const notifications = await prisma.notification.findMany({
      where: { type: "live_audio_started", fromUserId: host.id, userId: bystander.id },
    });
    expect(notifications).toHaveLength(0);
  });
});
