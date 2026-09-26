import { describe, it, expect, afterAll, beforeAll, vi } from "vitest";
import { randomUUID } from "crypto";
import { prisma } from "@/lib/db";
import {
  createRoom,
  joinRoom,
  leaveRoom,
  endRoom,
  promoteToSpeaker,
  demoteToListener,
  muteParticipant,
  removeParticipant,
  requestToSpeak,
  resolveSpeakerRequest,
  getRoomForViewer,
  listDiscoverableRooms,
  cleanupAbandonedRooms,
  forceLeaveAllLiveAudioRooms,
} from "../room-service";
import { LiveAudioError } from "../errors";

const hasRealDatabaseUrl =
  !!process.env.DATABASE_URL && !process.env.DATABASE_URL.includes("...");

// Token minting is real, local JWT signing (see livekit.test.ts) - a
// fake key/secret pair here exercises the real code path end to end
// without needing a reachable LiveKit server, exactly the boundary
// docs/live-audio-architecture.md §2 describes.
vi.stubEnv("LIVEKIT_API_KEY", "test-key");
vi.stubEnv("LIVEKIT_API_SECRET", "test-secret-at-least-32-characters-long");
vi.stubEnv("LIVEKIT_URL", "wss://example.livekit.cloud");

describe.skipIf(!hasRealDatabaseUrl)(
  "Live Audio room-service (integration, real Postgres)",
  () => {
    const runId = randomUUID().slice(0, 8);
    const userIds: string[] = [];
    const roomIds: string[] = [];
    const communityIds: string[] = [];

    async function createUser(label: string) {
      const user = await prisma.user.create({
        data: {
          email: `${label}-${runId}@liveaudiotest.example`,
          username: `${label}${runId}`.slice(0, 20),
          password: "x",
        },
      });
      userIds.push(user.id);
      return user;
    }

    beforeAll(async () => {
      // LiveKit's RoomServiceClient calls (deleteRoom/removeParticipant/
      // mutePublishedTrack) are network calls to LIVEKIT_URL, which is a
      // fake host in this test env - every one of them is designed to
      // be best-effort/non-blocking in room-service.ts (wrapped in its
      // own try/catch, logged, never thrown), so letting them actually
      // attempt and fail is a real exercise of that fallback path, not
      // something that needs mocking out.
    });

    afterAll(async () => {
      await prisma.liveAudioModerationAction.deleteMany({ where: { roomId: { in: roomIds } } });
      await prisma.liveAudioSpeakerRequest.deleteMany({ where: { roomId: { in: roomIds } } });
      await prisma.liveAudioParticipant.deleteMany({ where: { roomId: { in: roomIds } } });
      await prisma.liveAudioRoom.deleteMany({ where: { id: { in: roomIds } } });
      await prisma.communityMember.deleteMany({ where: { communityId: { in: communityIds } } });
      await prisma.community.deleteMany({ where: { id: { in: communityIds } } });
      await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    });

    it("full lifecycle: create, join, promote via direct action, mute, demote, remove, leave, end", async () => {
      const host = await createUser("hosta");
      const listener = await createUser("listenera");
      const other = await createUser("othera");

      const room = await createRoom({ hostId: host.id, title: `Room ${runId} a`, visibility: "PUBLIC" });
      roomIds.push(room.id);
      expect(room.status).toBe("LIVE");
      expect(room.startedAt).not.toBeNull();

      const hostRow = await prisma.liveAudioParticipant.findUnique({
        where: { roomId_userId: { roomId: room.id, userId: host.id } },
      });
      expect(hostRow?.role).toBe("HOST");

      const joined = await joinRoom(room.id, listener.id);
      expect(joined.participant.role).toBe("LISTENER");
      expect(joined.token).toBeTypeOf("string");
      expect(joined.livekitUrl).toBe("wss://example.livekit.cloud");

      await joinRoom(room.id, other.id);

      // Direct promotion (host invites, no prior request).
      await promoteToSpeaker(room.id, host.id, listener.id);
      let listenerRow = await prisma.liveAudioParticipant.findUnique({
        where: { roomId_userId: { roomId: room.id, userId: listener.id } },
      });
      expect(listenerRow?.role).toBe("SPEAKER");

      await muteParticipant(room.id, host.id, listener.id, true);
      listenerRow = await prisma.liveAudioParticipant.findUnique({
        where: { roomId_userId: { roomId: room.id, userId: listener.id } },
      });
      expect(listenerRow?.isMuted).toBe(true);

      await demoteToListener(room.id, host.id, listener.id);
      listenerRow = await prisma.liveAudioParticipant.findUnique({
        where: { roomId_userId: { roomId: room.id, userId: listener.id } },
      });
      expect(listenerRow?.role).toBe("LISTENER");

      await removeParticipant(room.id, host.id, other.id, "spam");
      const otherRow = await prisma.liveAudioParticipant.findUnique({
        where: { roomId_userId: { roomId: room.id, userId: other.id } },
      });
      expect(otherRow?.removedAt).not.toBeNull();
      expect(otherRow?.leftAt).not.toBeNull();

      const moderationActions = await prisma.liveAudioModerationAction.findMany({ where: { roomId: room.id } });
      expect(moderationActions.map((a) => a.action).sort()).toEqual(
        ["MUTE", "PROMOTE_SPEAKER", "DEMOTE_SPEAKER", "REMOVE"].sort()
      );

      await leaveRoom(room.id, listener.id);
      listenerRow = await prisma.liveAudioParticipant.findUnique({
        where: { roomId_userId: { roomId: room.id, userId: listener.id } },
      });
      expect(listenerRow?.leftAt).not.toBeNull();

      await endRoom(room.id, host.id);
      const endedRoom = await prisma.liveAudioRoom.findUnique({ where: { id: room.id } });
      expect(endedRoom?.status).toBe("ENDED");
      expect(endedRoom?.endedAt).not.toBeNull();
      expect(endedRoom?.totalUniqueParticipants).toBe(3); // host + listener + other

      const hostRowAfterEnd = await prisma.liveAudioParticipant.findUnique({
        where: { roomId_userId: { roomId: room.id, userId: host.id } },
      });
      expect(hostRowAfterEnd?.leftAt).not.toBeNull();
    });

    it("speaker request flow: request -> approve promotes; a separate request -> reject leaves them a listener", async () => {
      const host = await createUser("hostb");
      const requesterApproved = await createUser("reqapprovedb");
      const requesterRejected = await createUser("reqrejectedb");

      const room = await createRoom({ hostId: host.id, title: `Room ${runId} b`, visibility: "PUBLIC" });
      roomIds.push(room.id);
      await joinRoom(room.id, requesterApproved.id);
      await joinRoom(room.id, requesterRejected.id);

      await requestToSpeak(room.id, requesterApproved.id);
      await requestToSpeak(room.id, requesterRejected.id);

      let requests = await prisma.liveAudioSpeakerRequest.findMany({ where: { roomId: room.id } });
      expect(requests).toHaveLength(2);
      expect(requests.every((r) => r.status === "PENDING")).toBe(true);

      await resolveSpeakerRequest(room.id, host.id, requesterApproved.id, true);
      await resolveSpeakerRequest(room.id, host.id, requesterRejected.id, false);

      const approvedRole = await prisma.liveAudioParticipant.findUnique({
        where: { roomId_userId: { roomId: room.id, userId: requesterApproved.id } },
      });
      expect(approvedRole?.role).toBe("SPEAKER");

      const rejectedRole = await prisma.liveAudioParticipant.findUnique({
        where: { roomId_userId: { roomId: room.id, userId: requesterRejected.id } },
      });
      expect(rejectedRole?.role).toBe("LISTENER");

      requests = await prisma.liveAudioSpeakerRequest.findMany({ where: { roomId: room.id } });
      const approvedReq = requests.find((r) => r.userId === requesterApproved.id);
      const rejectedReq = requests.find((r) => r.userId === requesterRejected.id);
      expect(approvedReq?.status).toBe("APPROVED");
      expect(rejectedReq?.status).toBe("REJECTED");

      // Re-requesting after rejection updates the same row back to
      // PENDING rather than accumulating a second one.
      await requestToSpeak(room.id, requesterRejected.id);
      const afterReRequest = await prisma.liveAudioSpeakerRequest.findMany({
        where: { roomId: room.id, userId: requesterRejected.id },
      });
      expect(afterReRequest).toHaveLength(1);
      expect(afterReRequest[0].status).toBe("PENDING");
    });

    it("re-requesting to speak after already being a speaker is rejected (canRequestToSpeak gate, not just UI)", async () => {
      const host = await createUser("hostc");
      const speaker = await createUser("speakerc");
      const room = await createRoom({ hostId: host.id, title: `Room ${runId} c`, visibility: "PUBLIC" });
      roomIds.push(room.id);
      await joinRoom(room.id, speaker.id);
      await promoteToSpeaker(room.id, host.id, speaker.id);

      await expect(requestToSpeak(room.id, speaker.id)).rejects.toThrow(LiveAudioError);
    });

    describe("security", () => {
      it("a listener cannot promote another listener - forbidden, not silently ignored", async () => {
        const host = await createUser("hostd");
        const listenerA = await createUser("listenerda");
        const listenerB = await createUser("listenerdb");
        const room = await createRoom({ hostId: host.id, title: `Room ${runId} d`, visibility: "PUBLIC" });
        roomIds.push(room.id);
        await joinRoom(room.id, listenerA.id);
        await joinRoom(room.id, listenerB.id);

        await expect(promoteToSpeaker(room.id, listenerA.id, listenerB.id)).rejects.toMatchObject({
          code: "forbidden",
        });

        const untouched = await prisma.liveAudioParticipant.findUnique({
          where: { roomId_userId: { roomId: room.id, userId: listenerB.id } },
        });
        expect(untouched?.role).toBe("LISTENER");
      });

      it("a moderator cannot remove the host - explicit protection, not an oversight", async () => {
        const host = await createUser("hoste");
        const moderator = await createUser("moderatore");
        const room = await createRoom({ hostId: host.id, title: `Room ${runId} e`, visibility: "PUBLIC" });
        roomIds.push(room.id);
        await joinRoom(room.id, moderator.id);
        await promoteToSpeaker(room.id, host.id, moderator.id);
        // Promote further to MODERATOR directly via Prisma (no dedicated
        // "promote to moderator" endpoint exists in this MVP - see the
        // architecture doc's deferred list) to exercise the guard
        // against the role it actually protects against.
        await prisma.liveAudioParticipant.update({
          where: { roomId_userId: { roomId: room.id, userId: moderator.id } },
          data: { role: "MODERATOR" },
        });

        await expect(removeParticipant(room.id, moderator.id, host.id)).rejects.toMatchObject({
          code: "forbidden",
        });

        const hostRow = await prisma.liveAudioParticipant.findUnique({
          where: { roomId_userId: { roomId: room.id, userId: host.id } },
        });
        expect(hostRow?.removedAt).toBeNull();
      });

      it("a removed participant cannot simply rejoin", async () => {
        const host = await createUser("hostf");
        const removedUser = await createUser("removedf");
        const room = await createRoom({ hostId: host.id, title: `Room ${runId} f`, visibility: "PUBLIC" });
        roomIds.push(room.id);
        await joinRoom(room.id, removedUser.id);
        await removeParticipant(room.id, host.id, removedUser.id);

        await expect(joinRoom(room.id, removedUser.id)).rejects.toMatchObject({ code: "removed_from_room" });
      });

      it("a PRIVATE room is invisible (404, not 403) to a non-participant - no enumeration oracle", async () => {
        const host = await createUser("hostg");
        const outsider = await createUser("outsiderg");
        const room = await createRoom({ hostId: host.id, title: `Room ${runId} g`, visibility: "PRIVATE" });
        roomIds.push(room.id);

        await expect(getRoomForViewer(room.id, outsider.id)).rejects.toMatchObject({ code: "room_not_found" });
        await expect(joinRoom(room.id, outsider.id)).rejects.toMatchObject({ code: "room_not_found" });

        // The host themselves can still see it.
        const seenByHost = await getRoomForViewer(room.id, host.id);
        expect(seenByHost.room.id).toBe(room.id);
      });

      it("a COMMUNITY room is visible only to a member of that community", async () => {
        const host = await createUser("hosth");
        const member = await createUser("memberh");
        const nonMember = await createUser("nonmemberh");

        const community = await prisma.community.create({
          data: {
            slug: `live-audio-test-${runId}-h`,
            name: `Live Audio Test ${runId} h`,
            description: "test",
            hashtag: `liveaudiotest${runId}h`,
            createdById: host.id,
          },
        });
        communityIds.push(community.id);
        await prisma.communityMember.create({ data: { communityId: community.id, userId: host.id, role: "OWNER" } });
        await prisma.communityMember.create({ data: { communityId: community.id, userId: member.id, role: "MEMBER" } });

        const room = await createRoom({
          hostId: host.id,
          title: `Room ${runId} h`,
          visibility: "COMMUNITY",
          communityId: community.id,
        });
        roomIds.push(room.id);

        await expect(getRoomForViewer(room.id, nonMember.id)).rejects.toMatchObject({ code: "room_not_found" });
        const seenByMember = await getRoomForViewer(room.id, member.id);
        expect(seenByMember.room.id).toBe(room.id);
      });

      it("a blocked relationship with the host prevents joining", async () => {
        const host = await createUser("hosti");
        const blocker = await createUser("blockeri");
        await prisma.blocked.create({ data: { blockerId: blocker.id, blockedId: host.id } });

        const room = await createRoom({ hostId: host.id, title: `Room ${runId} i`, visibility: "PUBLIC" });
        roomIds.push(room.id);

        await expect(joinRoom(room.id, blocker.id)).rejects.toMatchObject({ code: "blocked" });
      });

      it("cannot join an ENDED room", async () => {
        const host = await createUser("hostj");
        const latecomer = await createUser("latecomerj");
        const room = await createRoom({ hostId: host.id, title: `Room ${runId} j`, visibility: "PUBLIC" });
        roomIds.push(room.id);
        await endRoom(room.id, host.id);

        await expect(joinRoom(room.id, latecomer.id)).rejects.toMatchObject({ code: "room_already_ended" });
      });

      it("cannot end an already-ended room twice", async () => {
        const host = await createUser("hostk");
        const room = await createRoom({ hostId: host.id, title: `Room ${runId} k`, visibility: "PUBLIC" });
        roomIds.push(room.id);
        await endRoom(room.id, host.id);
        await expect(endRoom(room.id, host.id)).rejects.toMatchObject({ code: "room_already_ended" });
      });
    });

    describe("concurrency", () => {
      it("two simultaneous promote calls for the same listener: exactly one succeeds", async () => {
        const host = await createUser("hostl");
        const moderator = await createUser("moderatorl");
        const listener = await createUser("listenerl");
        const room = await createRoom({ hostId: host.id, title: `Room ${runId} l`, visibility: "PUBLIC" });
        roomIds.push(room.id);
        await joinRoom(room.id, moderator.id);
        await promoteToSpeaker(room.id, host.id, moderator.id);
        await prisma.liveAudioParticipant.update({
          where: { roomId_userId: { roomId: room.id, userId: moderator.id } },
          data: { role: "MODERATOR" },
        });
        await joinRoom(room.id, listener.id);

        const results = await Promise.allSettled([
          promoteToSpeaker(room.id, host.id, listener.id),
          promoteToSpeaker(room.id, moderator.id, listener.id),
        ]);

        const fulfilled = results.filter((r) => r.status === "fulfilled");
        const rejected = results.filter((r) => r.status === "rejected");
        expect(fulfilled).toHaveLength(1);
        expect(rejected).toHaveLength(1);

        const finalRole = await prisma.liveAudioParticipant.findUnique({
          where: { roomId_userId: { roomId: room.id, userId: listener.id } },
        });
        expect(finalRole?.role).toBe("SPEAKER");

        // Exactly one PROMOTE_SPEAKER action logged, not two - the loser
        // never got far enough to log anything.
        const actions = await prisma.liveAudioModerationAction.findMany({
          where: { roomId: room.id, targetUserId: listener.id, action: "PROMOTE_SPEAKER" },
        });
        expect(actions).toHaveLength(1);
      });

      it("duplicate join is idempotent - never creates a second participant row", async () => {
        const host = await createUser("hostm");
        const listener = await createUser("listenerm");
        const room = await createRoom({ hostId: host.id, title: `Room ${runId} m`, visibility: "PUBLIC" });
        roomIds.push(room.id);

        await Promise.all([joinRoom(room.id, listener.id), joinRoom(room.id, listener.id)]);

        const rows = await prisma.liveAudioParticipant.findMany({
          where: { roomId: room.id, userId: listener.id },
        });
        expect(rows).toHaveLength(1);
      });
    });

    describe("cleanup and banned-user sweep", () => {
      it("cleanupAbandonedRooms ends a LIVE room whose only participant (the host) has left", async () => {
        const host = await createUser("hostn");
        const room = await createRoom({ hostId: host.id, title: `Room ${runId} n`, visibility: "PUBLIC" });
        roomIds.push(room.id);
        await leaveRoom(room.id, host.id);

        const { endedRoomIds } = await cleanupAbandonedRooms();
        expect(endedRoomIds).toContain(room.id);

        const updated = await prisma.liveAudioRoom.findUnique({ where: { id: room.id } });
        expect(updated?.status).toBe("ENDED");
      });

      it("cleanupAbandonedRooms leaves a room with an active participant untouched", async () => {
        const host = await createUser("hosto");
        const room = await createRoom({ hostId: host.id, title: `Room ${runId} o`, visibility: "PUBLIC" });
        roomIds.push(room.id);

        const { endedRoomIds } = await cleanupAbandonedRooms();
        expect(endedRoomIds).not.toContain(room.id);

        const stillLive = await prisma.liveAudioRoom.findUnique({ where: { id: room.id } });
        expect(stillLive?.status).toBe("LIVE");
      });

      it("forceLeaveAllLiveAudioRooms ends a room where the banned user was HOST", async () => {
        const bannedHost = await createUser("bannedhostp");
        const listener = await createUser("listenerp");
        const room = await createRoom({ hostId: bannedHost.id, title: `Room ${runId} p`, visibility: "PUBLIC" });
        roomIds.push(room.id);
        await joinRoom(room.id, listener.id);

        await forceLeaveAllLiveAudioRooms(bannedHost.id);

        const updated = await prisma.liveAudioRoom.findUnique({ where: { id: room.id } });
        expect(updated?.status).toBe("ENDED");
      });

      it("forceLeaveAllLiveAudioRooms removes a banned non-host participant without ending the room", async () => {
        const host = await createUser("hostq");
        const bannedListener = await createUser("bannedlistenerq");
        const room = await createRoom({ hostId: host.id, title: `Room ${runId} q`, visibility: "PUBLIC" });
        roomIds.push(room.id);
        await joinRoom(room.id, bannedListener.id);

        await forceLeaveAllLiveAudioRooms(bannedListener.id);

        const stillLive = await prisma.liveAudioRoom.findUnique({ where: { id: room.id } });
        expect(stillLive?.status).toBe("LIVE");

        const participantRow = await prisma.liveAudioParticipant.findUnique({
          where: { roomId_userId: { roomId: room.id, userId: bannedListener.id } },
        });
        expect(participantRow?.leftAt).not.toBeNull();
      });
    });

    describe("discovery", () => {
      it("listDiscoverableRooms returns PUBLIC LIVE rooms but not PRIVATE ones", async () => {
        const host = await createUser("hostr");
        const publicRoom = await createRoom({ hostId: host.id, title: `Discover Public ${runId} r`, visibility: "PUBLIC" });
        const privateRoom = await createRoom({ hostId: host.id, title: `Discover Private ${runId} r`, visibility: "PRIVATE" });
        roomIds.push(publicRoom.id, privateRoom.id);

        const { rooms } = await listDiscoverableRooms({ viewerId: null, cursor: null, limit: 50 });
        const ids = rooms.map((r) => r.id);
        expect(ids).toContain(publicRoom.id);
        expect(ids).not.toContain(privateRoom.id);
      });

      it("listDiscoverableRooms excludes a COMMUNITY room for a non-member viewer", async () => {
        const host = await createUser("hosts");
        const community = await prisma.community.create({
          data: {
            slug: `live-audio-test-${runId}-s`,
            name: `Live Audio Test ${runId} s`,
            description: "test",
            hashtag: `liveaudiotest${runId}s`,
            createdById: host.id,
          },
        });
        communityIds.push(community.id);
        await prisma.communityMember.create({ data: { communityId: community.id, userId: host.id, role: "OWNER" } });

        const room = await createRoom({
          hostId: host.id,
          title: `Room ${runId} s`,
          visibility: "COMMUNITY",
          communityId: community.id,
        });
        roomIds.push(room.id);

        const nonMember = await createUser("nonmembers");
        const { rooms: forNonMember } = await listDiscoverableRooms({ viewerId: nonMember.id, cursor: null, limit: 50 });
        expect(forNonMember.map((r) => r.id)).not.toContain(room.id);

        const { rooms: forHost } = await listDiscoverableRooms({ viewerId: host.id, cursor: null, limit: 50 });
        expect(forHost.map((r) => r.id)).toContain(room.id);
      });
    });
  }
);
