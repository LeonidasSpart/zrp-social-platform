import { Prisma, type LiveAudioParticipantRole, type LiveVideoRoom } from "@prisma/client";
import { prisma } from "@/lib/db";
import { isBlockedEitherWay } from "@/lib/auth-guards";
import { createNotification } from "@/lib/notifications";
import { sendPushNotification } from "@/lib/push-notifications";
import { emitToLiveVideoRoom, emitToUser, evictUserFromLiveVideoRoom } from "@/lib/socket-emit";
import { notifyReminderSubscribers } from "@/lib/live-reminders/reminder-service";
import { mintLiveKitToken, forceDisconnectParticipant, getLiveKitConfig } from "@/lib/live-audio/livekit";
import { canViewRoom, canPromoteSpeaker, isRoomAuthority } from "@/lib/live-audio/permissions";
import { rankAndPaginate } from "@/lib/live-audio/discovery-ranking";
import { requireLiveVideoAccess } from "./entitlement";
import { LiveVideoErrors } from "./errors";

/*
 * ============================================================
 * Live Video room service - the server-authoritative state machine
 * ============================================================
 *
 * A direct structural mirror of src/lib/live-audio/room-service.ts -
 * same architecture, same invariants (every exported function re-reads
 * the actor's real role/state from Postgres before acting; nothing
 * here trusts a role or roomId passed in by the client beyond "which
 * room/user are we talking about"). See that file's own top comment
 * and docs/live-audio-architecture.md for the shared design this
 * reuses; this file's comments only call out where Live Video
 * genuinely differs (camera moderation, join-request naming).
 *
 * Deliberately reuses live-audio/permissions.ts (canViewRoom,
 * canPromoteSpeaker, isRoomAuthority) and livekit.ts (mintLiveKitToken,
 * forceDisconnectParticipant, getLiveKitConfig) unchanged - both are
 * already generic over "room id / role / grant," not audio-specific.
 */

const ACTIVE_PARTICIPANT_WHERE = { leftAt: null, removedAt: null } as const;

function activeParticipantWhere(roomId: string, userId?: string) {
  return { roomId, ...(userId ? { userId } : {}), ...ACTIVE_PARTICIPANT_WHERE };
}

async function getRoomOrThrow(roomId: string): Promise<LiveVideoRoom> {
  const room = await prisma.liveVideoRoom.findUnique({ where: { id: roomId } });
  if (!room) throw LiveVideoErrors.roomNotFound();
  return room;
}

async function getMyRole(roomId: string, userId: string): Promise<LiveAudioParticipantRole | null> {
  const participant = await prisma.liveVideoParticipant.findFirst({
    where: activeParticipantWhere(roomId, userId),
    select: { role: true },
  });
  return participant?.role ?? null;
}

async function getVisibilityContext(room: LiveVideoRoom, userId: string) {
  const [participant, communityMembership] = await Promise.all([
    prisma.liveVideoParticipant.findUnique({
      where: { roomId_userId: { roomId: room.id, userId } },
      select: { id: true },
    }),
    room.communityId
      ? prisma.communityMember.findUnique({
          where: { communityId_userId: { communityId: room.communityId, userId } },
          select: { id: true },
        })
      : Promise.resolve(null),
  ]);
  return {
    visibility: room.visibility,
    isParticipant: !!participant,
    isCommunityMember: !!communityMembership,
  };
}

/**
 * Bumps peak participant/viewer counts if the room's current live
 * counts exceed the stored peak - see LiveAudioRoom's own identical
 * pattern for why this is a cheap COUNT run only on join/promote, not
 * on every realtime event.
 */
async function bumpPeakCounts(roomId: string): Promise<void> {
  const [participants, viewers] = await Promise.all([
    prisma.liveVideoParticipant.count({
      where: { roomId, role: { in: ["SPEAKER", "MODERATOR", "HOST"] }, ...ACTIVE_PARTICIPANT_WHERE },
    }),
    prisma.liveVideoParticipant.count({
      where: { roomId, role: { in: ["LISTENER", "SPEAKER", "MODERATOR", "HOST"] }, ...ACTIVE_PARTICIPANT_WHERE },
    }),
  ]);
  await prisma.liveVideoRoom.updateMany({
    where: { id: roomId, OR: [{ peakParticipantCount: { lt: participants } }, { peakViewerCount: { lt: viewers } }] },
    data: { peakParticipantCount: Math.max(0, participants), peakViewerCount: Math.max(0, viewers) },
  });
}

// ─── Create ──────────────────────────────────────────────────────────

export interface CreateRoomInput {
  hostId: string;
  title: string;
  description?: string;
  category?: string;
  visibility: "PUBLIC" | "COMMUNITY" | "PRIVATE";
  communityId?: string;
  scheduledAt?: Date;
}

export async function createRoom(input: CreateRoomInput): Promise<LiveVideoRoom> {
  await requireLiveVideoAccess(input.hostId);

  const title = input.title.trim();
  if (!title || title.length > 200) {
    throw LiveVideoErrors.validation("Title must be 1-200 characters.");
  }
  if (input.description && input.description.length > 2000) {
    throw LiveVideoErrors.validation("Description must be at most 2000 characters.");
  }

  if (input.visibility === "COMMUNITY") {
    if (!input.communityId) {
      throw LiveVideoErrors.validation("communityId is required for a COMMUNITY-visibility room.");
    }
    const membership = await prisma.communityMember.findUnique({
      where: { communityId_userId: { communityId: input.communityId, userId: input.hostId } },
      select: { id: true },
    });
    if (!membership) {
      throw LiveVideoErrors.forbidden("You must be a member of this community to create a room in it.");
    }
  }

  const isScheduled = !!input.scheduledAt && input.scheduledAt.getTime() > Date.now();

  const room = await prisma.$transaction(async (tx) => {
    const created = await tx.liveVideoRoom.create({
      data: {
        hostId: input.hostId,
        title,
        description: input.description?.trim() || null,
        category: input.category?.trim() || null,
        visibility: input.visibility,
        communityId: input.visibility === "COMMUNITY" ? input.communityId : null,
        status: isScheduled ? "SCHEDULED" : "LIVE",
        scheduledAt: isScheduled ? input.scheduledAt : null,
        startedAt: isScheduled ? null : new Date(),
      },
    });
    // The host is always an immediate, active participant - never
    // "joins" their own room through the join endpoint.
    await tx.liveVideoParticipant.create({
      data: { roomId: created.id, userId: input.hostId, role: "HOST" },
    });
    return created;
  });

  if (!isScheduled && room.visibility === "COMMUNITY" && room.communityId) {
    await notifyCommunityRoomStarted(room.communityId, room);
  }

  return room;
}

export async function startScheduledRoom(roomId: string, actorId: string): Promise<LiveVideoRoom> {
  const room = await getRoomOrThrow(roomId);
  if (room.hostId !== actorId) throw LiveVideoErrors.forbidden("Only the host can start this room.");
  await requireLiveVideoAccess(actorId);
  if (room.status !== "SCHEDULED") throw LiveVideoErrors.invalidState("This room is not scheduled.");

  const result = await prisma.liveVideoRoom.updateMany({
    where: { id: roomId, status: "SCHEDULED" },
    data: { status: "LIVE", startedAt: new Date() },
  });
  if (result.count !== 1) throw LiveVideoErrors.invalidState("This room is not scheduled.");

  const updated = await getRoomOrThrow(roomId);
  if (updated.visibility === "COMMUNITY" && updated.communityId) {
    await notifyCommunityRoomStarted(updated.communityId, updated);
  }
  await notifyReminderSubscribers("VIDEO", updated);
  return updated;
}

export async function cancelScheduledRoom(roomId: string, actorId: string): Promise<void> {
  const room = await getRoomOrThrow(roomId);
  if (room.hostId !== actorId) throw LiveVideoErrors.forbidden("Only the host can cancel this room.");

  const result = await prisma.liveVideoRoom.updateMany({
    where: { id: roomId, status: "SCHEDULED" },
    data: { status: "CANCELLED" },
  });
  if (result.count !== 1) throw LiveVideoErrors.invalidState("This room is not scheduled.");
}

// ─── Read / discovery ────────────────────────────────────────────────

export async function getRoomForViewer(roomId: string, viewerId: string) {
  const room = await getRoomOrThrow(roomId);
  const ctx = await getVisibilityContext(room, viewerId);
  // A private room a viewer can't see returns exactly the same shape as
  // "doesn't exist" - no enumeration oracle, same rule as Live Audio.
  if (!canViewRoom(ctx)) throw LiveVideoErrors.roomNotFound();

  const [participants, pendingRequestCount, myRole] = await Promise.all([
    prisma.liveVideoParticipant.findMany({
      where: activeParticipantWhere(roomId),
      select: {
        role: true,
        isMuted: true,
        isCameraOff: true,
        joinedAt: true,
        user: { select: { id: true, username: true, name: true, avatarUrl: true, badgeType: true } },
      },
      orderBy: [{ role: "asc" }, { joinedAt: "asc" }],
    }),
    isRoomAuthority(await getMyRole(roomId, viewerId))
      ? prisma.liveVideoSpeakerRequest.count({ where: { roomId, status: "PENDING" } })
      : Promise.resolve(0),
    getMyRole(roomId, viewerId),
  ]);

  return { room, participants, pendingRequestCount, myRole };
}

export interface DiscoverRoomsParams {
  viewerId: string | null;
  cursor: string | null;
  limit: number;
}

export async function listDiscoverableRooms({ viewerId, cursor, limit }: DiscoverRoomsParams) {
  const memberCommunityIds = viewerId
    ? (
        await prisma.communityMember.findMany({ where: { userId: viewerId }, select: { communityId: true } })
      ).map((m) => m.communityId)
    : [];

  const where: Prisma.LiveVideoRoomWhereInput = {
    status: "LIVE",
    OR: [{ visibility: "PUBLIC" }, ...(memberCommunityIds.length > 0 ? [{ visibility: "COMMUNITY" as const, communityId: { in: memberCommunityIds } }] : [])],
  };

  // A larger candidate pool than one page - ranking (see
  // discovery-ranking.ts) needs enough rooms to actually compete on
  // score, not just the next `limit` by recency. Still bounded, never
  // the whole table.
  const CANDIDATE_POOL_SIZE = 200;
  const rooms = await prisma.liveVideoRoom.findMany({
    where,
    take: CANDIDATE_POOL_SIZE,
    orderBy: [{ startedAt: "desc" }],
    select: {
      id: true,
      title: true,
      description: true,
      category: true,
      visibility: true,
      startedAt: true,
      host: { select: { id: true, username: true, name: true, avatarUrl: true, badgeType: true } },
      community: { select: { id: true, name: true, slug: true } },
      _count: { select: { participants: true } },
    },
  });

  // Same re-derivation as listDiscoverableRooms (Live Audio): _count
  // includes every participant row ever created for the room, not just
  // currently-active ones.
  const withLiveCounts = await Promise.all(
    rooms.map(async (room) => {
      const viewerCount = await prisma.liveVideoParticipant.count({
        where: { roomId: room.id, ...ACTIVE_PARTICIPANT_WHERE },
      });
      const { _count, ...rest } = room;
      void _count;
      return { ...rest, viewerCount };
    })
  );

  const { page, nextCursor } = rankAndPaginate(withLiveCounts, cursor, limit);
  return { rooms: page, nextCursor };
}

// ─── Join / leave ────────────────────────────────────────────────────

export interface JoinResult {
  participant: { role: LiveAudioParticipantRole };
  token: string;
  livekitUrl: string;
}

async function displayNameFor(userId: string): Promise<string> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { name: true, username: true } });
  return user?.name || user?.username || "Someone";
}

export async function joinRoom(roomId: string, userId: string): Promise<JoinResult> {
  // Checked before anything else, including whether the room itself
  // exists - same anti-enumeration rule as Live Audio's joinRoom.
  await requireLiveVideoAccess(userId);

  const config = getLiveKitConfig();
  if (!config) throw LiveVideoErrors.notConfigured();

  const room = await getRoomOrThrow(roomId);
  if (room.status !== "LIVE") {
    throw room.status === "ENDED" || room.status === "CANCELLED"
      ? LiveVideoErrors.roomAlreadyEnded()
      : LiveVideoErrors.roomNotLive();
  }

  const ctx = await getVisibilityContext(room, userId);
  if (!canViewRoom(ctx)) throw LiveVideoErrors.roomNotFound();

  if (room.hostId !== userId && (await isBlockedEitherWay(userId, room.hostId))) {
    throw LiveVideoErrors.blocked();
  }

  const existing = await prisma.liveVideoParticipant.findUnique({
    where: { roomId_userId: { roomId, userId } },
  });
  if (existing?.removedAt) throw LiveVideoErrors.removed();

  const participant = await prisma.liveVideoParticipant.upsert({
    where: { roomId_userId: { roomId, userId } },
    // A first-time join is always a LISTENER (viewer, camera off) -
    // the host is seeded as HOST at room creation and never goes
    // through this path; a rejoin keeps whatever role the row already
    // had, same as Live Audio.
    create: { roomId, userId, role: "LISTENER" },
    update: { leftAt: null },
  });

  await bumpPeakCounts(roomId);

  const displayName = await displayNameFor(userId);
  // mintLiveKitToken is reused unchanged - its canPublish grant already
  // covers both audio AND video tracks, so a role that can publish in
  // a Live Audio room can equally publish camera+mic in a Live Video
  // room with no new token logic needed.
  const token = await mintLiveKitToken({ roomId, userId, displayName, role: participant.role });
  if (!token) throw LiveVideoErrors.notConfigured();

  emitToLiveVideoRoom(roomId, "live-video:participant-joined", {
    userId,
    role: participant.role,
  });

  return { participant: { role: participant.role }, token, livekitUrl: config.url };
}

export async function leaveRoom(roomId: string, userId: string): Promise<void> {
  const result = await prisma.liveVideoParticipant.updateMany({
    where: activeParticipantWhere(roomId, userId),
    data: { leftAt: new Date() },
  });
  if (result.count === 0) return; // already left / never joined - idempotent, not an error

  emitToLiveVideoRoom(roomId, "live-video:participant-left", { userId });
}

/** Mints a fresh token for the caller's CURRENT role - see Live Audio's reissueToken for the full rationale. */
export async function reissueToken(roomId: string, userId: string): Promise<{ token: string; livekitUrl: string }> {
  await requireLiveVideoAccess(userId);

  const config = getLiveKitConfig();
  if (!config) throw LiveVideoErrors.notConfigured();

  const room = await getRoomOrThrow(roomId);
  if (room.status !== "LIVE") throw LiveVideoErrors.roomNotLive();

  const role = await getMyRole(roomId, userId);
  if (!role) throw LiveVideoErrors.notParticipant();

  const displayName = await displayNameFor(userId);
  const token = await mintLiveKitToken({ roomId, userId, displayName, role });
  if (!token) throw LiveVideoErrors.notConfigured();
  return { token, livekitUrl: config.url };
}

// ─── End / cancel ────────────────────────────────────────────────────

export async function endRoom(roomId: string, actorId: string): Promise<void> {
  const role = await getMyRole(roomId, actorId);
  const room = await getRoomOrThrow(roomId);
  if (!isRoomAuthority(role)) {
    if (room.hostId === actorId && room.status !== "LIVE") throw LiveVideoErrors.roomAlreadyEnded();
    throw LiveVideoErrors.forbidden("Only the host or a moderator can end this room.");
  }
  if (room.status !== "LIVE") throw LiveVideoErrors.roomAlreadyEnded();

  await performEndRoom(roomId);
}

/**
 * Every currently-LIVE room, regardless of visibility - same rationale
 * as Live Audio's listLiveRoomsForAdmin: an admin must see and close a
 * PRIVATE/COMMUNITY room a host forgot to end, not just PUBLIC ones.
 */
export async function listLiveRoomsForAdmin() {
  const rooms = await prisma.liveVideoRoom.findMany({
    where: { status: "LIVE" },
    orderBy: [{ startedAt: "asc" }],
    select: {
      id: true,
      title: true,
      visibility: true,
      startedAt: true,
      host: { select: { id: true, username: true, name: true } },
    },
  });

  return Promise.all(
    rooms.map(async (room) => {
      const viewerCount = await prisma.liveVideoParticipant.count({
        where: activeParticipantWhere(room.id),
      });
      return { ...room, viewerCount };
    })
  );
}

/**
 * Admin force-close - same pattern as Live Audio's adminForceEndRoom:
 * bypasses the host/moderator-only check inside endRoom() entirely,
 * calling performEndRoom() directly. Caller (the admin route) is
 * responsible for the requireAdmin() check and the audit log entry.
 */
export async function adminForceEndRoom(roomId: string): Promise<void> {
  const room = await getRoomOrThrow(roomId);
  if (room.status !== "LIVE") throw LiveVideoErrors.roomAlreadyEnded();
  await performEndRoom(roomId);
}

async function performEndRoom(roomId: string): Promise<void> {
  const activeParticipants = await prisma.liveVideoParticipant.findMany({
    where: activeParticipantWhere(roomId),
    select: { userId: true },
  });
  const totalUniqueParticipants = await prisma.liveVideoParticipant.count({ where: { roomId } });

  const updated = await prisma.$transaction(async (tx) => {
    const result = await tx.liveVideoRoom.updateMany({
      where: { id: roomId, status: "LIVE" },
      data: { status: "ENDED", endedAt: new Date(), totalUniqueParticipants },
    });
    if (result.count !== 1) throw LiveVideoErrors.roomAlreadyEnded();
    await tx.liveVideoParticipant.updateMany({
      where: activeParticipantWhere(roomId),
      data: { leftAt: new Date() },
    });
    return result;
  });
  void updated;

  await forceEndLiveKitRoom(roomId);
  emitToLiveVideoRoom(roomId, "live-video:room-ended", { roomId });
  for (const p of activeParticipants) emitToUser(p.userId, "live-video:room-ended", { roomId });
}

async function forceEndLiveKitRoom(roomId: string): Promise<void> {
  const config = getLiveKitConfig();
  if (!config) return;
  try {
    const { RoomServiceClient } = await import("livekit-server-sdk");
    const client = new RoomServiceClient(config.url, config.apiKey, config.apiSecret);
    await client.deleteRoom(roomId);
  } catch (err) {
    console.error(`Failed to close LiveKit room ${roomId}:`, err);
  }
}

// ─── Moderation ──────────────────────────────────────────────────────

async function logModerationAction(
  roomId: string,
  actorId: string,
  targetUserId: string,
  action: "MUTE" | "UNMUTE" | "REMOVE" | "PROMOTE_SPEAKER" | "DEMOTE_SPEAKER",
  reason?: string
) {
  await prisma.liveVideoModerationAction.create({
    data: { roomId, actorId, targetUserId, action, reason: reason?.trim() || null },
  });
}

/** Promotes a viewer (LISTENER) to a participant (SPEAKER) - can now publish camera + mic. */
export async function promoteToParticipant(roomId: string, actorId: string, targetUserId: string): Promise<void> {
  await requireLiveVideoAccess(actorId);
  const actorRole = await getMyRole(roomId, actorId);
  if (!canPromoteSpeaker(actorRole)) throw LiveVideoErrors.forbidden();

  const result = await prisma.liveVideoParticipant.updateMany({
    where: { roomId, userId: targetUserId, role: "LISTENER", ...ACTIVE_PARTICIPANT_WHERE },
    data: { role: "SPEAKER" },
  });
  if (result.count !== 1) throw LiveVideoErrors.invalidState("That user is not an active viewer in this room.");

  await bumpPeakCounts(roomId);
  await logModerationAction(roomId, actorId, targetUserId, "PROMOTE_SPEAKER");
  emitToLiveVideoRoom(roomId, "live-video:role-changed", { userId: targetUserId, role: "SPEAKER" });

  await createNotification({ userId: targetUserId, type: "live_video_speaker_invited", fromUserId: actorId });
}

/** Demotes a participant (SPEAKER) back to a viewer (LISTENER) - camera/mic publish grant revoked on next token refresh. */
export async function demoteToViewer(roomId: string, actorId: string, targetUserId: string): Promise<void> {
  await requireLiveVideoAccess(actorId);
  const actorRole = await getMyRole(roomId, actorId);
  if (!canPromoteSpeaker(actorRole)) throw LiveVideoErrors.forbidden();

  const result = await prisma.liveVideoParticipant.updateMany({
    where: { roomId, userId: targetUserId, role: "SPEAKER", ...ACTIVE_PARTICIPANT_WHERE },
    data: { role: "LISTENER" },
  });
  if (result.count !== 1) throw LiveVideoErrors.invalidState("That user is not an active participant in this room.");

  await logModerationAction(roomId, actorId, targetUserId, "DEMOTE_SPEAKER");
  emitToLiveVideoRoom(roomId, "live-video:role-changed", { userId: targetUserId, role: "LISTENER" });
}

export async function muteParticipant(roomId: string, actorId: string, targetUserId: string, muted: boolean): Promise<void> {
  await requireLiveVideoAccess(actorId);
  const actorRole = await getMyRole(roomId, actorId);
  if (!canPromoteSpeaker(actorRole)) throw LiveVideoErrors.forbidden();

  const result = await prisma.liveVideoParticipant.updateMany({
    where: {
      roomId,
      userId: targetUserId,
      role: { in: ["SPEAKER", "MODERATOR", "HOST"] },
      ...ACTIVE_PARTICIPANT_WHERE,
    },
    data: { isMuted: muted },
  });
  if (result.count !== 1) throw LiveVideoErrors.invalidState("That user can't be muted (not an active publisher).");

  await logModerationAction(roomId, actorId, targetUserId, muted ? "MUTE" : "UNMUTE");
  emitToLiveVideoRoom(roomId, "live-video:mute-changed", { userId: targetUserId, isMuted: muted });

  if (muted) await forceMuteAtMediaLayer(roomId, targetUserId, "AUDIO");
}

/**
 * Forces a participant's camera off at the moderation layer - the one
 * real addition over Live Audio's moderation set: a camera and a mic
 * are two independently publishable LiveKit tracks, so "mute" (audio)
 * and "camera off" (video) are two separate, independently toggleable
 * flags/actions rather than one.
 */
export async function setParticipantCamera(
  roomId: string,
  actorId: string,
  targetUserId: string,
  cameraOff: boolean
): Promise<void> {
  await requireLiveVideoAccess(actorId);
  const actorRole = await getMyRole(roomId, actorId);
  if (!canPromoteSpeaker(actorRole)) throw LiveVideoErrors.forbidden();

  const result = await prisma.liveVideoParticipant.updateMany({
    where: {
      roomId,
      userId: targetUserId,
      role: { in: ["SPEAKER", "MODERATOR", "HOST"] },
      ...ACTIVE_PARTICIPANT_WHERE,
    },
    data: { isCameraOff: cameraOff },
  });
  if (result.count !== 1) {
    throw LiveVideoErrors.invalidState("That user's camera can't be changed (not an active publisher).");
  }

  emitToLiveVideoRoom(roomId, "live-video:camera-changed", { userId: targetUserId, isCameraOff: cameraOff });

  if (cameraOff) await forceMuteAtMediaLayer(roomId, targetUserId, "VIDEO");
}

async function forceMuteAtMediaLayer(roomId: string, userId: string, kind: "AUDIO" | "VIDEO"): Promise<void> {
  const config = getLiveKitConfig();
  if (!config) return;
  try {
    const { RoomServiceClient } = await import("livekit-server-sdk");
    const client = new RoomServiceClient(config.url, config.apiKey, config.apiSecret);
    const { TrackType } = await import("@livekit/protocol");
    const { tracks } = await client.getParticipant(roomId, userId);
    const targetType = kind === "AUDIO" ? TrackType.AUDIO : TrackType.VIDEO;
    for (const track of tracks) {
      if (track.type === targetType) {
        await client.mutePublishedTrack(roomId, userId, track.sid, true);
      }
    }
  } catch (err) {
    // Best-effort - our own isMuted/isCameraOff flags are the
    // authoritative "should this person's track be rendered" signal
    // client-side; the SFU-level mute is defense in depth on top.
    console.error(`Failed to force-${kind.toLowerCase()}-mute ${userId} in LiveKit room ${roomId}:`, err);
  }
}

export async function removeParticipant(roomId: string, actorId: string, targetUserId: string, reason?: string): Promise<void> {
  await requireLiveVideoAccess(actorId);
  const actorRole = await getMyRole(roomId, actorId);
  if (!isRoomAuthority(actorRole)) throw LiveVideoErrors.forbidden();

  const room = await getRoomOrThrow(roomId);
  if (targetUserId === room.hostId) {
    throw LiveVideoErrors.forbidden("The host can't be removed.");
  }

  const result = await prisma.liveVideoParticipant.updateMany({
    where: activeParticipantWhere(roomId, targetUserId),
    data: { removedAt: new Date(), removedById: actorId, leftAt: new Date() },
  });
  if (result.count !== 1) throw LiveVideoErrors.notParticipant();

  await logModerationAction(roomId, actorId, targetUserId, "REMOVE", reason);
  emitToLiveVideoRoom(roomId, "live-video:participant-removed", { userId: targetUserId });
  emitToUser(targetUserId, "live-video:you-were-removed", { roomId });
  evictUserFromLiveVideoRoom(targetUserId, roomId);
  await forceDisconnectParticipant(roomId, targetUserId);
}

// ─── Join requests ("raise hand to go on camera") ───────────────────

export async function requestToJoin(roomId: string, userId: string): Promise<void> {
  await requireLiveVideoAccess(userId);
  const role = await getMyRole(roomId, userId);
  if (role !== "LISTENER") {
    throw LiveVideoErrors.invalidState("Only an active viewer can request to join on camera.");
  }

  await prisma.liveVideoSpeakerRequest.upsert({
    where: { roomId_userId: { roomId, userId } },
    create: { roomId, userId, status: "PENDING" },
    update: { status: "PENDING", requestedAt: new Date(), resolvedAt: null, resolvedById: null },
  });

  const authorities = await prisma.liveVideoParticipant.findMany({
    where: { roomId, role: { in: ["HOST", "MODERATOR"] }, ...ACTIVE_PARTICIPANT_WHERE },
    select: { userId: true },
  });
  for (const a of authorities) emitToUser(a.userId, "live-video:speaker-request", { roomId, userId });
}

export async function resolveJoinRequest(
  roomId: string,
  actorId: string,
  targetUserId: string,
  approve: boolean
): Promise<void> {
  await requireLiveVideoAccess(actorId);
  const actorRole = await getMyRole(roomId, actorId);
  if (!isRoomAuthority(actorRole)) throw LiveVideoErrors.forbidden();

  const request = await prisma.liveVideoSpeakerRequest.findUnique({
    where: { roomId_userId: { roomId, userId: targetUserId } },
  });
  if (!request || request.status !== "PENDING") throw LiveVideoErrors.requestNotFound();

  await prisma.$transaction(async (tx) => {
    const updated = await tx.liveVideoSpeakerRequest.updateMany({
      where: { roomId, userId: targetUserId, status: "PENDING" },
      data: { status: approve ? "APPROVED" : "REJECTED", resolvedAt: new Date(), resolvedById: actorId },
    });
    if (updated.count !== 1) throw LiveVideoErrors.requestNotFound();

    if (approve) {
      const promoted = await tx.liveVideoParticipant.updateMany({
        where: { roomId, userId: targetUserId, role: "LISTENER", ...ACTIVE_PARTICIPANT_WHERE },
        data: { role: "SPEAKER" },
      });
      if (promoted.count !== 1) {
        throw LiveVideoErrors.invalidState("That user is no longer an active viewer in this room.");
      }
    }
  });

  if (approve) {
    await bumpPeakCounts(roomId);
    emitToLiveVideoRoom(roomId, "live-video:role-changed", { userId: targetUserId, role: "SPEAKER" });
    await logModerationAction(roomId, actorId, targetUserId, "PROMOTE_SPEAKER", "via join request");
  }

  await createNotification({
    userId: targetUserId,
    type: approve ? "live_video_speaker_approved" : "live_video_speaker_rejected",
    fromUserId: actorId,
  });
}

// ─── Notifications ───────────────────────────────────────────────────

async function notifyCommunityRoomStarted(communityId: string, room: LiveVideoRoom): Promise<void> {
  const members = await prisma.communityMember.findMany({
    where: { communityId, userId: { not: room.hostId } },
    select: { userId: true },
  });
  const host = await prisma.user.findUnique({ where: { id: room.hostId }, select: { name: true, username: true } });
  const hostName = host?.name || host?.username || "Someone";

  await Promise.all(
    members.map((m) =>
      createNotification({ userId: m.userId, type: "live_video_started", fromUserId: room.hostId })
    )
  );
  for (const m of members) {
    void sendPushNotification(m.userId, `${hostName} is live`, room.title, `/live-video/${room.id}`);
  }
}

// ─── Cleanup (cron) ──────────────────────────────────────────────────

const MAX_ROOM_DURATION_MS = 24 * 60 * 60 * 1000;

/**
 * Ends any LIVE room that is genuinely abandoned - same two conditions
 * as Live Audio's cleanupAbandonedRooms (zero active participants, or
 * an absolute 24h cap). Called only from
 * GET /api/cron/live-video-cleanup (CRON_SECRET-gated).
 */
export async function cleanupAbandonedRooms(): Promise<{ endedRoomIds: string[] }> {
  const liveRooms = await prisma.liveVideoRoom.findMany({
    where: { status: "LIVE" },
    select: { id: true, hostId: true, startedAt: true },
  });
  if (liveRooms.length === 0) return { endedRoomIds: [] };

  const now = Date.now();
  const endedRoomIds: string[] = [];

  for (const room of liveRooms) {
    const activeCount = await prisma.liveVideoParticipant.count({
      where: { roomId: room.id, ...ACTIVE_PARTICIPANT_WHERE },
    });
    const expiredByDuration = room.startedAt ? now - room.startedAt.getTime() > MAX_ROOM_DURATION_MS : false;
    if (activeCount > 0 && !expiredByDuration) continue;

    try {
      await performEndRoom(room.id);
      endedRoomIds.push(room.id);
    } catch (err) {
      console.error(`Cleanup failed to end abandoned room ${room.id}:`, err);
    }
  }

  return { endedRoomIds };
}

// ─── Banned-user sweep ───────────────────────────────────────────────

/**
 * Called from the admin ban route the moment a user is banned - see
 * forceLeaveAllLiveAudioRooms's own doc comment for the full rationale,
 * identical here.
 */
export async function forceLeaveAllLiveVideoRooms(userId: string): Promise<void> {
  const activeMemberships = await prisma.liveVideoParticipant.findMany({
    where: { userId, ...ACTIVE_PARTICIPANT_WHERE },
    select: { roomId: true, role: true },
  });
  if (activeMemberships.length === 0) return;

  for (const membership of activeMemberships) {
    if (membership.role === "HOST") {
      try {
        await endRoom(membership.roomId, userId);
        continue;
      } catch {
        // Room may have already ended independently - fall through to
        // the plain leave below so the participant row is still closed.
      }
    }
    await prisma.liveVideoParticipant.updateMany({
      where: { roomId: membership.roomId, userId, ...ACTIVE_PARTICIPANT_WHERE },
      data: { leftAt: new Date() },
    });
    emitToLiveVideoRoom(membership.roomId, "live-video:participant-left", { userId });
    evictUserFromLiveVideoRoom(userId, membership.roomId);
    await forceDisconnectParticipant(membership.roomId, userId);
  }
}
