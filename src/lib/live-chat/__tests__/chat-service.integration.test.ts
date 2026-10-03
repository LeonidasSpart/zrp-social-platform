import { describe, it, expect, afterAll, vi } from "vitest";
import { randomUUID } from "crypto";
import { prisma } from "@/lib/db";
import { createRoom as createAudioRoom, joinRoom as joinAudioRoom } from "@/lib/live-audio/room-service";
import { createRoom as createVideoRoom, joinRoom as joinVideoRoom } from "@/lib/live-video/room-service";
import { sendMessage, listMessages, deleteMessage, setChatMute, setSlowMode } from "../chat-service";

const hasRealDatabaseUrl = !!process.env.DATABASE_URL && !process.env.DATABASE_URL.includes("...");

vi.stubEnv("LIVEKIT_API_KEY", "test-key");
vi.stubEnv("LIVEKIT_API_SECRET", "test-secret-at-least-32-characters-long");
vi.stubEnv("LIVEKIT_URL", "wss://example.livekit.cloud");

describe.skipIf(!hasRealDatabaseUrl)("Live Chat chat-service (integration, real Postgres)", () => {
  const runId = randomUUID().slice(0, 8);
  const userIds: string[] = [];
  const roomIds: string[] = [];

  async function createUser(label: string) {
    const user = await prisma.user.create({
      data: {
        email: `${label}-${runId}@livechattest.example`,
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

  async function roomWithTwoParticipants(label: string) {
    const host = await createUser(`host${label}`);
    const viewer = await createUser(`viewer${label}`);
    const room = await createAudioRoom({ hostId: host.id, title: `Chat room ${runId} ${label}`, visibility: "PUBLIC" });
    roomIds.push(room.id);
    await joinAudioRoom(room.id, viewer.id);
    return { host, viewer, room };
  }

  afterAll(async () => {
    await prisma.liveChatMessage.deleteMany({ where: { liveAudioRoomId: { in: roomIds } } });
    await prisma.liveAudioParticipant.deleteMany({ where: { roomId: { in: roomIds } } });
    await prisma.liveAudioRoom.deleteMany({ where: { id: { in: roomIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  });

  it("a participant can post a message and it's listed back", async () => {
    const { viewer, room } = await roomWithTwoParticipants("a");
    const message = await sendMessage({ authorId: viewer.id, roomType: "AUDIO", roomId: room.id, body: "Hello room!" });
    expect(message.body).toBe("Hello room!");

    const { messages } = await listMessages({ roomType: "AUDIO", roomId: room.id, viewerId: viewer.id });
    expect(messages.find((m) => m.id === message.id)?.body).toBe("Hello room!");
  });

  it("a non-participant cannot post", async () => {
    const { room } = await roomWithTwoParticipants("b");
    const stranger = await createUser("strangerb");
    await expect(
      sendMessage({ authorId: stranger.id, roomType: "AUDIO", roomId: room.id, body: "hi" })
    ).rejects.toMatchObject({ code: "not_participant" });
  });

  it("an empty message is rejected", async () => {
    const { viewer, room } = await roomWithTwoParticipants("c");
    await expect(
      sendMessage({ authorId: viewer.id, roomType: "AUDIO", roomId: room.id, body: "   " })
    ).rejects.toMatchObject({ code: "validation_error" });
  });

  it("a message over the length cap is rejected", async () => {
    const { viewer, room } = await roomWithTwoParticipants("d");
    await expect(
      sendMessage({ authorId: viewer.id, roomType: "AUDIO", roomId: room.id, body: "x".repeat(501) })
    ).rejects.toMatchObject({ code: "validation_error" });
  });

  it("a chat-muted participant cannot post", async () => {
    const { host, viewer, room } = await roomWithTwoParticipants("e");
    await setChatMute({ actorId: host.id, roomType: "AUDIO", roomId: room.id, targetUserId: viewer.id, muted: true });
    await expect(
      sendMessage({ authorId: viewer.id, roomType: "AUDIO", roomId: room.id, body: "can I talk?" })
    ).rejects.toMatchObject({ code: "chat_muted" });
  });

  it("only a host/moderator or the message's own author can delete it", async () => {
    const { host, viewer, room } = await roomWithTwoParticipants("f");
    const other = await createUser("otherf");
    await joinAudioRoom(room.id, other.id);
    const message = await sendMessage({ authorId: viewer.id, roomType: "AUDIO", roomId: room.id, body: "delete me?" });

    await expect(
      deleteMessage({ actorId: other.id, roomType: "AUDIO", roomId: room.id, messageId: message.id })
    ).rejects.toMatchObject({ code: "forbidden" });

    await deleteMessage({ actorId: host.id, roomType: "AUDIO", roomId: room.id, messageId: message.id });
    const { messages } = await listMessages({ roomType: "AUDIO", roomId: room.id, viewerId: viewer.id });
    expect(messages.find((m) => m.id === message.id)).toBeUndefined();
  });

  it("the message's own author can delete their own message", async () => {
    const { viewer, room } = await roomWithTwoParticipants("g");
    const message = await sendMessage({ authorId: viewer.id, roomType: "AUDIO", roomId: room.id, body: "oops" });
    await deleteMessage({ actorId: viewer.id, roomType: "AUDIO", roomId: room.id, messageId: message.id });
    const { messages } = await listMessages({ roomType: "AUDIO", roomId: room.id, viewerId: viewer.id });
    expect(messages.find((m) => m.id === message.id)).toBeUndefined();
  });

  it("slow mode blocks a second message from the same user before the cooldown elapses", async () => {
    const { host, viewer, room } = await roomWithTwoParticipants("h");
    await setSlowMode({ actorId: host.id, roomType: "AUDIO", roomId: room.id, seconds: 60 });
    await sendMessage({ authorId: viewer.id, roomType: "AUDIO", roomId: room.id, body: "first" });
    await expect(
      sendMessage({ authorId: viewer.id, roomType: "AUDIO", roomId: room.id, body: "second, too soon" })
    ).rejects.toMatchObject({ code: "slow_mode" });
  });

  it("only a host/moderator can change slow mode", async () => {
    const { viewer, room } = await roomWithTwoParticipants("i");
    await expect(
      setSlowMode({ actorId: viewer.id, roomType: "AUDIO", roomId: room.id, seconds: 30 })
    ).rejects.toMatchObject({ code: "forbidden" });
  });

  it("a blocked sender cannot post into the host's room", async () => {
    const { host, viewer, room } = await roomWithTwoParticipants("j");
    await prisma.blocked.create({ data: { blockerId: host.id, blockedId: viewer.id } });
    await expect(
      sendMessage({ authorId: viewer.id, roomType: "AUDIO", roomId: room.id, body: "let me in" })
    ).rejects.toMatchObject({ code: "blocked" });
  });

  it("a message can't be sent once the room has ended", async () => {
    const { viewer, room } = await roomWithTwoParticipants("k");
    await prisma.liveAudioRoom.update({ where: { id: room.id }, data: { status: "ENDED", endedAt: new Date() } });
    await expect(
      sendMessage({ authorId: viewer.id, roomType: "AUDIO", roomId: room.id, body: "too late" })
    ).rejects.toMatchObject({ code: "room_not_live" });
  });
});
