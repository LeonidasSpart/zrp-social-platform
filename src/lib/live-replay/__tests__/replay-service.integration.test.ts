import { describe, it, expect, afterAll, afterEach, vi } from "vitest";
import { randomUUID } from "crypto";
import { prisma } from "@/lib/db";
import { createRoom as createAudioRoom, joinRoom as joinAudioRoom } from "@/lib/live-audio/room-service";
import { startRecording, stopRecording, listRecordings, deleteRecording, handleEgressEnded } from "../replay-service";

const hasRealDatabaseUrl = !!process.env.DATABASE_URL && !process.env.DATABASE_URL.includes("...");

vi.stubEnv("LIVEKIT_API_KEY", "test-key");
vi.stubEnv("LIVEKIT_API_SECRET", "test-secret-at-least-32-characters-long");
vi.stubEnv("LIVEKIT_URL", "wss://example.livekit.cloud");
// Deliberately never stubbed: LIVEKIT_EGRESS_S3_* - this environment has
// no S3-compatible bucket configured, exactly the real, current state
// of this deployment (see replay-service.ts's header comment). Every
// test below exercises the real fail-closed gate this produces, not a
// simulation of it.

describe.skipIf(!hasRealDatabaseUrl)("Live Replay replay-service (integration, real Postgres)", () => {
  const runId = randomUUID().slice(0, 8);
  const userIds: string[] = [];
  const roomIds: string[] = [];

  async function createUser(label: string) {
    const user = await prisma.user.create({
      data: {
        email: `${label}-${runId}@livereplaytest.example`,
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

  async function liveRoom(label: string) {
    const host = await createUser(`host${label}`);
    const viewer = await createUser(`viewer${label}`);
    const room = await createAudioRoom({ hostId: host.id, title: `Replay room ${runId} ${label}`, visibility: "PUBLIC" });
    roomIds.push(room.id);
    await joinAudioRoom(room.id, viewer.id);
    return { host, viewer, room };
  }

  afterAll(async () => {
    await prisma.liveRecording.deleteMany({ where: { liveAudioRoomId: { in: roomIds } } });
    await prisma.liveAudioParticipant.deleteMany({ where: { roomId: { in: roomIds } } });
    await prisma.liveAudioRoom.deleteMany({ where: { id: { in: roomIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  });

  // ── Fail-closed gate ──────────────────────────────────────────────
  it("startRecording fails closed with replay_not_configured when no Egress S3 destination is set up (the real current state of this environment)", async () => {
    const { host, room } = await liveRoom("a");
    await expect(
      startRecording({ actorId: host.id, roomType: "AUDIO", roomId: room.id })
    ).rejects.toMatchObject({ code: "replay_not_configured" });

    // No half-applied LiveRecording row from a failed attempt.
    const count = await prisma.liveRecording.count({ where: { liveAudioRoomId: room.id } });
    expect(count).toBe(0);
  });

  // ── Authorization (checked BEFORE the config gate, so these are real
  // assertions even though recording itself can't complete here) ─────
  it("a viewer (not host/moderator) cannot start a recording", async () => {
    const { viewer, room } = await liveRoom("b");
    await expect(
      startRecording({ actorId: viewer.id, roomType: "AUDIO", roomId: room.id })
    ).rejects.toMatchObject({ code: "forbidden" });
  });

  it("a viewer cannot stop a recording", async () => {
    const { viewer, room } = await liveRoom("c");
    await expect(
      stopRecording({ actorId: viewer.id, roomType: "AUDIO", roomId: room.id })
    ).rejects.toMatchObject({ code: "forbidden" });
  });

  it("a viewer cannot delete a recording", async () => {
    const { viewer, room } = await liveRoom("d");
    await expect(
      deleteRecording({ actorId: viewer.id, roomType: "AUDIO", roomId: room.id, recordingId: "does-not-exist" })
    ).rejects.toMatchObject({ code: "forbidden" });
  });

  it("recording cannot be started on a room that isn't live", async () => {
    const host = await createUser("hoste");
    const room = await createAudioRoom({
      hostId: host.id,
      title: `Replay room ${runId} e`,
      visibility: "PUBLIC",
      scheduledAt: new Date(Date.now() + 60 * 60_000),
    });
    roomIds.push(room.id);
    await expect(
      startRecording({ actorId: host.id, roomType: "AUDIO", roomId: room.id })
    ).rejects.toMatchObject({ code: "room_not_live" });
  });

  it("stopRecording on a room with no active recording is rejected", async () => {
    const { host, room } = await liveRoom("f");
    await expect(
      stopRecording({ actorId: host.id, roomType: "AUDIO", roomId: room.id })
    ).rejects.toMatchObject({ code: "not_recording" });
  });

  // ── Recordings list stays empty for an unconfigured environment,
  // never fabricated ──────────────────────────────────────────────────
  it("listRecordings returns nothing for a room that never had a real recording", async () => {
    const { room } = await liveRoom("g");
    const recordings = await listRecordings("AUDIO", room.id);
    expect(recordings).toEqual([]);
  });

  // ── Webhook completion handling (doesn't require LiveKit itself -
  // this is purely the DB-side update a real egress_ended would
  // trigger, seeded directly to exercise it) ──────────────────────────
  describe("handleEgressEnded", () => {
    afterEach(async () => {
      await prisma.liveRecording.deleteMany({ where: { egressId: { startsWith: `eg-${runId}` } } });
    });

    it("marks a recording complete with its real media URL and duration", async () => {
      const { room } = await liveRoom("h");
      const egressId = `eg-${runId}-h`;
      await prisma.liveRecording.create({
        data: { liveAudioRoomId: room.id, egressId, status: "EGRESS_ACTIVE" },
      });

      await handleEgressEnded({ egressId, status: "EGRESS_COMPLETE", mediaUrl: "s3://bucket/key.mp4", durationSeconds: 120 });

      const updated = await prisma.liveRecording.findUniqueOrThrow({ where: { egressId } });
      expect(updated.status).toBe("EGRESS_COMPLETE");
      expect(updated.mediaUrl).toBe("s3://bucket/key.mp4");
      expect(updated.durationSeconds).toBe(120);
      expect(updated.endedAt).not.toBeNull();
    });

    it("marks a recording failed with no media URL when Egress itself failed", async () => {
      const { room } = await liveRoom("i");
      const egressId = `eg-${runId}-i`;
      await prisma.liveRecording.create({
        data: { liveAudioRoomId: room.id, egressId, status: "EGRESS_ACTIVE" },
      });

      await handleEgressEnded({ egressId, status: "EGRESS_FAILED", mediaUrl: null, durationSeconds: null });

      const updated = await prisma.liveRecording.findUniqueOrThrow({ where: { egressId } });
      expect(updated.status).toBe("EGRESS_FAILED");
      expect(updated.mediaUrl).toBeNull();
    });

    it("is idempotent - a resent webhook for the same egressId re-applies the same result, not a duplicate row", async () => {
      const { room } = await liveRoom("j");
      const egressId = `eg-${runId}-j`;
      await prisma.liveRecording.create({
        data: { liveAudioRoomId: room.id, egressId, status: "EGRESS_ACTIVE" },
      });

      await handleEgressEnded({ egressId, status: "EGRESS_COMPLETE", mediaUrl: "s3://bucket/key.mp4", durationSeconds: 60 });
      await handleEgressEnded({ egressId, status: "EGRESS_COMPLETE", mediaUrl: "s3://bucket/key.mp4", durationSeconds: 60 });

      const count = await prisma.liveRecording.count({ where: { egressId } });
      expect(count).toBe(1);
    });
  });
});
