import { describe, it, expect, afterAll, vi } from "vitest";
import { randomUUID } from "crypto";
import { prisma } from "@/lib/db";
import {
  createRoom,
  joinRoom,
  leaveRoom,
  endRoom,
  promoteToParticipant,
  demoteToViewer,
  muteParticipant,
  setParticipantCamera,
  removeParticipant,
  requestToJoin,
  resolveJoinRequest,
  listDiscoverableRooms,
  listLiveRoomsForAdmin,
  adminForceEndRoom,
  cleanupAbandonedRooms,
  forceLeaveAllLiveVideoRooms,
} from "../room-service";
import { LiveVideoError } from "../errors";

/*
 * Direct structural mirror of
 * src/lib/live-audio/__tests__/room-service.integration.test.ts - see
 * that file for the full rationale (real Postgres, fake LiveKit
 * credentials exercising the real best-effort-failure fallback paths).
 * Trimmed to Live Video's own surface: the genuinely new behavior here
 * is independent camera moderation (setParticipantCamera) alongside
 * the mic; everything else mirrors Live Audio's already-covered
 * invariants one-for-one with renamed role-transition function names.
 */

const hasRealDatabaseUrl =
  !!process.env.DATABASE_URL && !process.env.DATABASE_URL.includes("...");

vi.stubEnv("LIVEKIT_API_KEY", "test-key");
vi.stubEnv("LIVEKIT_API_SECRET", "test-secret-at-least-32-characters-long");
vi.stubEnv("LIVEKIT_URL", "wss://example.livekit.cloud");

describe.skipIf(!hasRealDatabaseUrl)(
  "Live Video room-service (integration, real Postgres)",
  () => {
    const runId = randomUUID().slice(0, 8);
    const userIds: string[] = [];
    const roomIds: string[] = [];

    async function createUser(label: string, opts?: { plan?: string; noSubscription?: boolean }) {
      const plan = opts?.plan ?? "pro";
      const user = await prisma.user.create({
        data: {
          email: `${label}-${runId}@livevideotest.example`,
          username: `${label}${runId}`.slice(0, 20),
          password: "x",
          plan,
        },
      });
      userIds.push(user.id);
      if (!opts?.noSubscription) {
        const now = new Date();
        const periodEnd = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
        await prisma.subscription.create({
          data: {
            userId: user.id,
            plan,
            status: "ACTIVE",
            billingInterval: "MONTHLY",
            startedAt: now,
            currentPeriodStart: now,
            currentPeriodEnd: periodEnd,
            nextBillingAt: periodEnd,
          },
        });
      }
      return user;
    }

    afterAll(async () => {
      await prisma.liveVideoModerationAction.deleteMany({ where: { roomId: { in: roomIds } } });
      await prisma.liveVideoSpeakerRequest.deleteMany({ where: { roomId: { in: roomIds } } });
      await prisma.liveVideoParticipant.deleteMany({ where: { roomId: { in: roomIds } } });
      await prisma.liveVideoRoom.deleteMany({ where: { id: { in: roomIds } } });
      await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    });

    it("full lifecycle: create, join, promote, mute, camera off/on, demote, remove, leave, end", async () => {
      const host = await createUser("hosta");
      const viewer = await createUser("viewera");
      const other = await createUser("othera");

      const room = await createRoom({ hostId: host.id, title: `Room ${runId} a`, visibility: "PUBLIC" });
      roomIds.push(room.id);
      expect(room.status).toBe("LIVE");
      expect(room.startedAt).not.toBeNull();

      const hostRow = await prisma.liveVideoParticipant.findUnique({
        where: { roomId_userId: { roomId: room.id, userId: host.id } },
      });
      expect(hostRow?.role).toBe("HOST");

      const joined = await joinRoom(room.id, viewer.id);
      expect(joined.participant.role).toBe("LISTENER");
      expect(joined.token).toBeTypeOf("string");
      expect(joined.livekitUrl).toBe("wss://example.livekit.cloud");

      await joinRoom(room.id, other.id);

      await promoteToParticipant(room.id, host.id, viewer.id);
      let viewerRow = await prisma.liveVideoParticipant.findUnique({
        where: { roomId_userId: { roomId: room.id, userId: viewer.id } },
      });
      expect(viewerRow?.role).toBe("SPEAKER");

      await muteParticipant(room.id, host.id, viewer.id, true);
      viewerRow = await prisma.liveVideoParticipant.findUnique({
        where: { roomId_userId: { roomId: room.id, userId: viewer.id } },
      });
      expect(viewerRow?.isMuted).toBe(true);

      // The one genuinely new moderation axis over Live Audio: camera
      // is independently togglable from mic.
      await setParticipantCamera(room.id, host.id, viewer.id, true);
      viewerRow = await prisma.liveVideoParticipant.findUnique({
        where: { roomId_userId: { roomId: room.id, userId: viewer.id } },
      });
      expect(viewerRow?.isCameraOff).toBe(true);
      expect(viewerRow?.isMuted).toBe(true); // mic state untouched by the camera toggle

      await setParticipantCamera(room.id, host.id, viewer.id, false);
      viewerRow = await prisma.liveVideoParticipant.findUnique({
        where: { roomId_userId: { roomId: room.id, userId: viewer.id } },
      });
      expect(viewerRow?.isCameraOff).toBe(false);

      await demoteToViewer(room.id, host.id, viewer.id);
      viewerRow = await prisma.liveVideoParticipant.findUnique({
        where: { roomId_userId: { roomId: room.id, userId: viewer.id } },
      });
      expect(viewerRow?.role).toBe("LISTENER");

      await removeParticipant(room.id, host.id, other.id, "spam");
      const otherRow = await prisma.liveVideoParticipant.findUnique({
        where: { roomId_userId: { roomId: room.id, userId: other.id } },
      });
      expect(otherRow?.removedAt).not.toBeNull();
      expect(otherRow?.leftAt).not.toBeNull();

      const moderationActions = await prisma.liveVideoModerationAction.findMany({ where: { roomId: room.id } });
      expect(moderationActions.map((a) => a.action).sort()).toEqual(
        ["MUTE", "PROMOTE_SPEAKER", "DEMOTE_SPEAKER", "REMOVE"].sort()
      );

      await leaveRoom(room.id, viewer.id);
      viewerRow = await prisma.liveVideoParticipant.findUnique({
        where: { roomId_userId: { roomId: room.id, userId: viewer.id } },
      });
      expect(viewerRow?.leftAt).not.toBeNull();

      await endRoom(room.id, host.id);
      const endedRoom = await prisma.liveVideoRoom.findUnique({ where: { id: room.id } });
      expect(endedRoom?.status).toBe("ENDED");
      expect(endedRoom?.endedAt).not.toBeNull();
      expect(endedRoom?.totalUniqueParticipants).toBe(3);
    });

    it("setParticipantCamera rejects an active viewer (not a publisher) - can't force a camera state on someone with no camera grant", async () => {
      const host = await createUser("hostb");
      const viewer = await createUser("viewerb");
      const room = await createRoom({ hostId: host.id, title: `Room ${runId} b`, visibility: "PUBLIC" });
      roomIds.push(room.id);
      await joinRoom(room.id, viewer.id);

      await expect(setParticipantCamera(room.id, host.id, viewer.id, true)).rejects.toMatchObject({
        code: "invalid_state",
      });
    });

    it("join-request flow: request -> approve promotes to SPEAKER; a separate request -> reject leaves them LISTENER", async () => {
      const host = await createUser("hostc");
      const approved = await createUser("approvedc");
      const rejected = await createUser("rejectedc");

      const room = await createRoom({ hostId: host.id, title: `Room ${runId} c`, visibility: "PUBLIC" });
      roomIds.push(room.id);
      await joinRoom(room.id, approved.id);
      await joinRoom(room.id, rejected.id);

      await requestToJoin(room.id, approved.id);
      await requestToJoin(room.id, rejected.id);

      await resolveJoinRequest(room.id, host.id, approved.id, true);
      await resolveJoinRequest(room.id, host.id, rejected.id, false);

      const approvedRole = await prisma.liveVideoParticipant.findUnique({
        where: { roomId_userId: { roomId: room.id, userId: approved.id } },
      });
      expect(approvedRole?.role).toBe("SPEAKER");

      const rejectedRole = await prisma.liveVideoParticipant.findUnique({
        where: { roomId_userId: { roomId: room.id, userId: rejected.id } },
      });
      expect(rejectedRole?.role).toBe("LISTENER");
    });

    it("a viewer cannot promote another viewer - forbidden, not silently ignored", async () => {
      const host = await createUser("hostd");
      const viewer1 = await createUser("viewer1d");
      const viewer2 = await createUser("viewer2d");
      const room = await createRoom({ hostId: host.id, title: `Room ${runId} d`, visibility: "PUBLIC" });
      roomIds.push(room.id);
      await joinRoom(room.id, viewer1.id);
      await joinRoom(room.id, viewer2.id);

      await expect(promoteToParticipant(room.id, viewer1.id, viewer2.id)).rejects.toMatchObject({
        code: "forbidden",
      });
    });

    it("a free-plan user is denied access with the Live Video paywall error, not a generic one", async () => {
      const freeUser = await createUser("freee", { plan: "free", noSubscription: true });
      await expect(
        createRoom({ hostId: freeUser.id, title: `Room ${runId} e`, visibility: "PUBLIC" })
      ).rejects.toMatchObject({ code: "live_video_paid_feature" });
    });

    it("cleanupAbandonedRooms ends a LIVE room whose only participant (the host) has left", async () => {
      const host = await createUser("hostf");
      const room = await createRoom({ hostId: host.id, title: `Room ${runId} f`, visibility: "PUBLIC" });
      roomIds.push(room.id);
      await leaveRoom(room.id, host.id);

      const { endedRoomIds } = await cleanupAbandonedRooms();
      expect(endedRoomIds).toContain(room.id);

      const updated = await prisma.liveVideoRoom.findUnique({ where: { id: room.id } });
      expect(updated?.status).toBe("ENDED");
    });

    it("adminForceEndRoom ends a LIVE room with an active host, bypassing the host-only check", async () => {
      const host = await createUser("hostg");
      const viewer = await createUser("viewerg");
      const room = await createRoom({ hostId: host.id, title: `Room ${runId} g`, visibility: "PUBLIC" });
      roomIds.push(room.id);
      await joinRoom(room.id, viewer.id);

      await adminForceEndRoom(room.id);

      const updated = await prisma.liveVideoRoom.findUnique({ where: { id: room.id } });
      expect(updated?.status).toBe("ENDED");
      const activeParticipants = await prisma.liveVideoParticipant.findMany({
        where: { roomId: room.id, leftAt: null },
      });
      expect(activeParticipants).toHaveLength(0);
    });

    it("listLiveRoomsForAdmin includes a PRIVATE live room (unlike listDiscoverableRooms) with a live viewer count", async () => {
      const host = await createUser("hosth");
      const viewer = await createUser("viewerh");
      const room = await createRoom({ hostId: host.id, title: `Room ${runId} h`, visibility: "PRIVATE" });
      roomIds.push(room.id);
      // A stranger can't join a PRIVATE room via joinRoom() (canViewRoom
      // requires isParticipant OR PUBLIC/community-member visibility,
      // which a brand-new participant never has for PRIVATE) - this
      // models the documented "host already put them in the room" case
      // by inserting the participant row directly, same as a real
      // host-added PRIVATE member would look in Postgres.
      await prisma.liveVideoParticipant.create({
        data: { roomId: room.id, userId: viewer.id, role: "LISTENER" },
      });

      const discoverable = await listDiscoverableRooms({ viewerId: null, cursor: null, limit: 20 });
      expect(discoverable.rooms.find((r) => r.id === room.id)).toBeUndefined();

      const adminRooms = await listLiveRoomsForAdmin();
      const found = adminRooms.find((r) => r.id === room.id);
      expect(found).toBeDefined();
      expect(found?.viewerCount).toBe(2); // host + viewer
      expect(found?.host.id).toBe(host.id);

      await adminForceEndRoom(room.id);
    });

    it("forceLeaveAllLiveVideoRooms ends a room where the banned user was HOST", async () => {
      const bannedHost = await createUser("bannedhosti");
      const viewer = await createUser("vieweri");
      const room = await createRoom({ hostId: bannedHost.id, title: `Room ${runId} i`, visibility: "PUBLIC" });
      roomIds.push(room.id);
      await joinRoom(room.id, viewer.id);

      await forceLeaveAllLiveVideoRooms(bannedHost.id);

      const updated = await prisma.liveVideoRoom.findUnique({ where: { id: room.id } });
      expect(updated?.status).toBe("ENDED");
    });

    it("forceLeaveAllLiveVideoRooms removes a banned non-host participant without ending the room", async () => {
      const host = await createUser("hostj");
      const bannedViewer = await createUser("bannedviewerj");
      const room = await createRoom({ hostId: host.id, title: `Room ${runId} j`, visibility: "PUBLIC" });
      roomIds.push(room.id);
      await joinRoom(room.id, bannedViewer.id);

      await forceLeaveAllLiveVideoRooms(bannedViewer.id);

      const stillLive = await prisma.liveVideoRoom.findUnique({ where: { id: room.id } });
      expect(stillLive?.status).toBe("LIVE");
      const participantRow = await prisma.liveVideoParticipant.findUnique({
        where: { roomId_userId: { roomId: room.id, userId: bannedViewer.id } },
      });
      expect(participantRow?.leftAt).not.toBeNull();

      await adminForceEndRoom(room.id);
    });

    it("LiveVideoError is the class every failure throws, matching the generic route-helpers catch", async () => {
      const host = await createUser("hostk");
      const room = await createRoom({ hostId: host.id, title: `Room ${runId} k`, visibility: "PUBLIC" });
      roomIds.push(room.id);
      await endRoom(room.id, host.id);

      await expect(endRoom(room.id, host.id)).rejects.toBeInstanceOf(LiveVideoError);
    });
  }
);
