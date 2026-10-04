import { Prisma, type LiveAudioParticipantRole, type LiveAudioRoom } from "@prisma/client";
import { prisma } from "@/lib/db";
import { isBlockedEitherWay } from "@/lib/auth-guards";
import { createNotification } from "@/lib/notifications";
import { sendPushNotification } from "@/lib/push-notifications";
import { emitToLiveAudioRoom, emitToUser, evictUserFromLiveAudioRoom } from "@/lib/socket-emit";
import { notifyReminderSubscribers } from "@/lib/live-reminders/reminder-service";
import { mintLiveKitToken, forceDisconnectParticipant, getLiveKitConfig } from "./livekit";
import { canViewRoom, canPromoteSpeaker, isRoomAuthority } from "./permissions";
import { rankAndPaginate } from "./discovery-ranking";
import { requireLiveAudioAccess } from "./entitlement";
import { LiveAudioErrors } from "./errors";

/*
 * ============================================================
 * Live Audio room service - the server-authoritative state machine
 * ============================================================
 *
 * Every exported function here re-reads the actor's real role/state
 * from Postgres before acting - none of them trust a role or roomId
 * passed in by the client beyond "which room/user are we talking
 * about." See docs/live-audio-architecture.md for the full design.
 */

const ACTIVE_PARTICIPANT_WHERE = { leftAt: null, removedAt: null } as const;

function activeParticipantWhere(roomId: string, userId?: string) {
  return { roomId, ...(userId ? { userId } : {}), ...ACTIVE_PARTICIPANT_WHERE };
}

async function getRoomOrThrow(roomId: string): Promise<LiveAudioRoom> {
  const room = await prisma.liveAudioRoom.findUnique({ where: { id: roomId } });
  if (!room) throw LiveAudioErrors.roomNotFound();
  return room;
}

async function getMyRole(roomId: string, userId: string): Promise<LiveAudioParticipantRole | null> {
  const participant = await prisma.liveAudioParticipant.findFirst({
    where: activeParticipantWhere(roomId, userId),
    select: { role: true },
  });
  return participant?.role ?? null;
}

async function getVisibilityContext(room: LiveAudioRoom, userId: string) {
  const [participant, communityMembership] = await Promise.all([
    prisma.liveAudioParticipant.findUnique({
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
 * Bumps peak listener/speaker counts if the room's current live counts
 * exceed the stored peak - a cheap COUNT, only run on join/promote, not
 * on every realtime event (mission's own N+1/performance requirement).
 */
async function bumpPeakCounts(roomId: string): Promise<void> {
  const [listeners, speakers] = await Promise.all([
    prisma.liveAudioParticipant.count({
      where: { roomId, role: { in: ["LISTENER", "SPEAKER", "MODERATOR", "HOST"] }, ...ACTIVE_PARTICIPANT_WHERE },
    }),
    prisma.liveAudioParticipant.count({
      where: { roomId, role: { in: ["SPEAKER", "MODERATOR", "HOST"] }, ...ACTIVE_PARTICIPANT_WHERE },
    }),
  ]);
  await prisma.liveAudioRoom.updateMany({
    where: { id: roomId, OR: [{ peakListenerCount: { lt: listeners } }, { peakSpeakerCount: { lt: speakers } }] },
    data: { peakListenerCount: Math.max(0, listeners), peakSpeakerCount: Math.max(0, speakers) },
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

export async function createRoom(input: CreateRoomInput): Promise<LiveAudioRoom> {
  await requireLiveAudioAccess(input.hostId);

  const title = input.title.trim();
  if (!title || title.length > 200) {
    throw LiveAudioErrors.validation("Title must be 1-200 characters.");
  }
  if (input.description && input.description.length > 2000) {
    throw LiveAudioErrors.validation("Description must be at most 2000 characters.");
  }

  if (input.visibility === "COMMUNITY") {
    if (!input.communityId) {
      throw LiveAudioErrors.validation("communityId is required for a COMMUNITY-visibility room.");
    }
    const membership = await prisma.communityMember.findUnique({
      where: { communityId_userId: { communityId: input.communityId, userId: input.hostId } },
      select: { id: true },
    });
    if (!membership) {
      throw LiveAudioErrors.forbidden("You must be a member of this community to create a room in it.");
    }
  }

  const isScheduled = !!input.scheduledAt && input.scheduledAt.getTime() > Date.now();

  const room = await prisma.$transaction(async (tx) => {
    const created = await tx.liveAudioRoom.create({
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
    await tx.liveAudioParticipant.create({
      data: { roomId: created.id, userId: input.hostId, role: "HOST" },
    });
    return created;
  });

  if (!isScheduled && room.visibility === "COMMUNITY" && room.communityId) {
    await notifyCommunityRoomStarted(room.communityId, room);
  }

  return room;
}

export async function startScheduledRoom(roomId: string, actorId: string): Promise<LiveAudioRoom> {
  const room = await getRoomOrThrow(roomId);
  if (room.hostId !== actorId) throw LiveAudioErrors.forbidden("Only the host can start this room.");
  // Re-checked at start time, not just at scheduling time - the host's
  // paid period may have lapsed in between (mission requirement: an
  // expired subscription must not let a scheduled room go live).
  await requireLiveAudioAccess(actorId);
  if (room.status !== "SCHEDULED") throw LiveAudioErrors.invalidState("This room is not scheduled.");

  const result = await prisma.liveAudioRoom.updateMany({
    where: { id: roomId, status: "SCHEDULED" },
    data: { status: "LIVE", startedAt: new Date() },
  });
  if (result.count !== 1) throw LiveAudioErrors.invalidState("This room is not scheduled.");

  const updated = await getRoomOrThrow(roomId);
  if (updated.visibility === "COMMUNITY" && updated.communityId) {
    await notifyCommunityRoomStarted(updated.communityId, updated);
  }
  await notifyReminderSubscribers("AUDIO", updated);
  return updated;
}

export async function cancelScheduledRoom(roomId: string, actorId: string): Promise<void> {
  const room = await getRoomOrThrow(roomId);
  if (room.hostId !== actorId) throw LiveAudioErrors.forbidden("Only the host can cancel this room.");

  const result = await prisma.liveAudioRoom.updateMany({
    where: { id: roomId, status: "SCHEDULED" },
    data: { status: "CANCELLED" },
  });
  if (result.count !== 1) throw LiveAudioErrors.invalidState("This room is not scheduled.");
}

// ─── Read / discovery ────────────────────────────────────────────────

export async function getRoomForViewer(roomId: string, viewerId: string) {
  const room = await getRoomOrThrow(roomId);
  const ctx = await getVisibilityContext(room, viewerId);
  // A private room a viewer can't see returns exactly the same shape as
  // "doesn't exist" - no enumeration oracle (mission §7/§28).
  if (!canViewRoom(ctx)) throw LiveAudioErrors.roomNotFound();

  const [participants, pendingRequestCount, myRole] = await Promise.all([
    prisma.liveAudioParticipant.findMany({
      where: activeParticipantWhere(roomId),
      select: {
        role: true,
        isMuted: true,
        // Chat-mute is independent of mic-mute; exposed so the chat
        // panel can show moderators each participant's real state.
        isChatMuted: true,
        joinedAt: true,
        user: { select: { id: true, username: true, name: true, avatarUrl: true, badgeType: true } },
      },
      orderBy: [{ role: "asc" }, { joinedAt: "asc" }],
    }),
    isRoomAuthority(await getMyRole(roomId, viewerId))
      ? prisma.liveAudioSpeakerRequest.count({ where: { roomId, status: "PENDING" } })
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

  const where: Prisma.LiveAudioRoomWhereInput = {
    status: "LIVE",
    OR: [{ visibility: "PUBLIC" }, ...(memberCommunityIds.length > 0 ? [{ visibility: "COMMUNITY" as const, communityId: { in: memberCommunityIds } }] : [])],
  };

  // A larger candidate pool than one page - ranking (see
  // discovery-ranking.ts) needs enough rooms to actually compete on
  // score, not just the next `limit` by recency. Still bounded, never
  // the whole table.
  const CANDIDATE_POOL_SIZE = 200;
  const rooms = await prisma.liveAudioRoom.findMany({
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

  // _count.participants counts every row ever created for this room
  // (including departed ones), which is wrong for "how many people are
  // in this room right now" - re-derive the live count per room rather
  // than trust the relation count. Bounded by the candidate pool size
  // (never the whole table), so this stays a handful of extra queries,
  // not an N+1 across the platform.
  const withLiveCounts = await Promise.all(
    rooms.map(async (room) => {
      const listenerCount = await prisma.liveAudioParticipant.count({
        where: { roomId: room.id, ...ACTIVE_PARTICIPANT_WHERE },
      });
      const { _count, ...rest } = room;
      void _count;
      return { ...rest, viewerCount: listenerCount, listenerCount };
    })
  );

  const { page, nextCursor } = rankAndPaginate(withLiveCounts, cursor, limit);
  // viewerCount above exists only to feed the ranking score - the
  // public shape keeps its original listenerCount field, unchanged.
  return { rooms: page.map(({ viewerCount: _viewerCount, ...rest }) => rest), nextCursor };
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
  // exists - a free user gets the exact same paywall response for any
  // roomId, so this can never be used as an enumeration oracle for
  // room existence/visibility (mission §7/§28).
  await requireLiveAudioAccess(userId);

  const config = getLiveKitConfig();
  if (!config) throw LiveAudioErrors.notConfigured();

  const room = await getRoomOrThrow(roomId);
  if (room.status !== "LIVE") {
    throw room.status === "ENDED" || room.status === "CANCELLED"
      ? LiveAudioErrors.roomAlreadyEnded()
      : LiveAudioErrors.roomNotLive();
  }

  const ctx = await getVisibilityContext(room, userId);
  if (!canViewRoom(ctx)) throw LiveAudioErrors.roomNotFound();

  if (room.hostId !== userId && (await isBlockedEitherWay(userId, room.hostId))) {
    throw LiveAudioErrors.blocked();
  }

  const existing = await prisma.liveAudioParticipant.findUnique({
    where: { roomId_userId: { roomId, userId } },
  });
  if (existing?.removedAt) throw LiveAudioErrors.removed();

  const participant = await prisma.liveAudioParticipant.upsert({
    where: { roomId_userId: { roomId, userId } },
    // A first-time join is always a LISTENER (the host is seeded as
    // HOST at room creation and never goes through this path); a
    // rejoin keeps whatever role the row already had (e.g. a SPEAKER
    // whose connection dropped and reconnected keeps SPEAKER, does not
    // get silently demoted).
    create: { roomId, userId, role: "LISTENER" },
    update: { leftAt: null },
  });

  await bumpPeakCounts(roomId);

  const displayName = await displayNameFor(userId);
  const token = await mintLiveKitToken({ roomId, userId, displayName, role: participant.role });
  if (!token) throw LiveAudioErrors.notConfigured();

  emitToLiveAudioRoom(roomId, "live-audio:participant-joined", {
    userId,
    role: participant.role,
  });

  return { participant: { role: participant.role }, token, livekitUrl: config.url };
}

export async function leaveRoom(roomId: string, userId: string): Promise<void> {
  const result = await prisma.liveAudioParticipant.updateMany({
    where: activeParticipantWhere(roomId, userId),
    data: { leftAt: new Date() },
  });
  if (result.count === 0) return; // already left / never joined - idempotent, not an error

  emitToLiveAudioRoom(roomId, "live-audio:participant-left", { userId });
}

/**
 * Mints a fresh token for the caller's CURRENT role - called on initial
 * connect and again whenever a client is told (via the realtime event
 * below) that its role changed, since a token's grants are fixed at
 * mint time and are never mutated in place.
 */
export async function reissueToken(roomId: string, userId: string): Promise<{ token: string; livekitUrl: string }> {
  // The LiveKit token endpoint is the most security-critical Live Audio
  // entry point (mission §7): a lapsed subscriber already inside a room
  // must not be able to mint a FRESH token once their period ends, even
  // though their already-issued token remains valid for its own TTL
  // (see TOKEN_TTL in livekit.ts - a documented, bounded limitation).
  await requireLiveAudioAccess(userId);

  const config = getLiveKitConfig();
  if (!config) throw LiveAudioErrors.notConfigured();

  const room = await getRoomOrThrow(roomId);
  if (room.status !== "LIVE") throw LiveAudioErrors.roomNotLive();

  const role = await getMyRole(roomId, userId);
  if (!role) throw LiveAudioErrors.notParticipant();

  const displayName = await displayNameFor(userId);
  const token = await mintLiveKitToken({ roomId, userId, displayName, role });
  if (!token) throw LiveAudioErrors.notConfigured();
  return { token, livekitUrl: config.url };
}

// ─── End / cancel ────────────────────────────────────────────────────

export async function endRoom(roomId: string, actorId: string): Promise<void> {
  const role = await getMyRole(roomId, actorId);
  const room = await getRoomOrThrow(roomId);
  if (!isRoomAuthority(role)) {
    // Once a room ends, performEndRoom() clears leftAt on every
    // participant including the host, so the host's own active-role
    // lookup above comes back null - which must not surface as a
    // confusing "forbidden" to the one person who legitimately ended
    // it. room.hostId is a stable fact from the room row itself (not a
    // mutable participant role), so checking it here can only ever
    // produce the more accurate message for the actual host; anyone
    // else - including a moderator who has since been removed - still
    // gets the generic forbidden, so this can't be used to probe a
    // private/inaccessible room's status.
    if (room.hostId === actorId && room.status !== "LIVE") throw LiveAudioErrors.roomAlreadyEnded();
    throw LiveAudioErrors.forbidden("Only the host or a moderator can end this room.");
  }
  if (room.status !== "LIVE") throw LiveAudioErrors.roomAlreadyEnded();

  await performEndRoom(roomId);
}

/**
 * The actual "close a LIVE room" mechanics, deliberately separated from
 * the authorization check above: the cleanup cron (cleanupAbandonedRooms)
 * ends a room precisely BECAUSE it has zero active participants - which
 * means there is no longer any user, including the host, who could pass
 * endRoom()'s own "you must be a current active HOST/MODERATOR" check.
 * The cron is the system acting on the room's behalf, not impersonating
 * a user, so it calls this directly instead of endRoom().
 */
async function performEndRoom(roomId: string): Promise<void> {
  const activeParticipants = await prisma.liveAudioParticipant.findMany({
    where: activeParticipantWhere(roomId),
    select: { userId: true },
  });
  const totalUniqueParticipants = await prisma.liveAudioParticipant.count({ where: { roomId } });

  const updated = await prisma.$transaction(async (tx) => {
    const result = await tx.liveAudioRoom.updateMany({
      where: { id: roomId, status: "LIVE" },
      data: { status: "ENDED", endedAt: new Date(), totalUniqueParticipants },
    });
    if (result.count !== 1) throw LiveAudioErrors.roomAlreadyEnded();
    await tx.liveAudioParticipant.updateMany({
      where: activeParticipantWhere(roomId),
      data: { leftAt: new Date() },
    });
    return result;
  });
  void updated;

  await forceEndLiveKitRoom(roomId);
  emitToLiveAudioRoom(roomId, "live-audio:room-ended", { roomId });
  // Best-effort fan-out after the broadcast, using the pre-transaction
  // participant snapshot - a departure that raced with end() at worst
  // gets one extra (harmless) "room ended" ping.
  for (const p of activeParticipants) emitToUser(p.userId, "live-audio:room-ended", { roomId });
}

/**
 * Every currently-LIVE room, regardless of visibility - an admin must
 * be able to see and close a PRIVATE/COMMUNITY room a host forgot to
 * end, not just the PUBLIC ones listDiscoverableRooms() surfaces to
 * regular users.
 */
export async function listLiveRoomsForAdmin() {
  const rooms = await prisma.liveAudioRoom.findMany({
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
      const listenerCount = await prisma.liveAudioParticipant.count({
        where: activeParticipantWhere(room.id),
      });
      return { ...room, listenerCount };
    })
  );
}

/**
 * Admin force-close: an admin ends a LIVE room a host forgot to close,
 * bypassing the host/moderator-only check inside endRoom() entirely -
 * same pattern as cleanupAbandonedRooms(), which also calls
 * performEndRoom() directly because the acting party (the system, here
 * an admin) is not and need not be a participant in the room at all.
 * Caller (the admin route) is responsible for the requireAdmin() check
 * and for writing the audit log entry.
 */
export async function adminForceEndRoom(roomId: string): Promise<void> {
  const room = await getRoomOrThrow(roomId);
  if (room.status !== "LIVE") throw LiveAudioErrors.roomAlreadyEnded();
  await performEndRoom(roomId);
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
  await prisma.liveAudioModerationAction.create({
    data: { roomId, actorId, targetUserId, action, reason: reason?.trim() || null },
  });
}

export async function promoteToSpeaker(roomId: string, actorId: string, targetUserId: string): Promise<void> {
  await requireLiveAudioAccess(actorId);
  const actorRole = await getMyRole(roomId, actorId);
  if (!canPromoteSpeaker(actorRole)) throw LiveAudioErrors.forbidden();

  const result = await prisma.liveAudioParticipant.updateMany({
    where: { roomId, userId: targetUserId, role: "LISTENER", ...ACTIVE_PARTICIPANT_WHERE },
    data: { role: "SPEAKER" },
  });
  if (result.count !== 1) throw LiveAudioErrors.invalidState("That user is not an active listener in this room.");

  await bumpPeakCounts(roomId);
  await logModerationAction(roomId, actorId, targetUserId, "PROMOTE_SPEAKER");
  emitToLiveAudioRoom(roomId, "live-audio:role-changed", { userId: targetUserId, role: "SPEAKER" });

  await createNotification({ userId: targetUserId, type: "live_audio_speaker_invited", fromUserId: actorId });
}

export async function demoteToListener(roomId: string, actorId: string, targetUserId: string): Promise<void> {
  await requireLiveAudioAccess(actorId);
  const actorRole = await getMyRole(roomId, actorId);
  if (!canPromoteSpeaker(actorRole)) throw LiveAudioErrors.forbidden();

  const result = await prisma.liveAudioParticipant.updateMany({
    where: { roomId, userId: targetUserId, role: "SPEAKER", ...ACTIVE_PARTICIPANT_WHERE },
    data: { role: "LISTENER" },
  });
  if (result.count !== 1) throw LiveAudioErrors.invalidState("That user is not an active speaker in this room.");

  await logModerationAction(roomId, actorId, targetUserId, "DEMOTE_SPEAKER");
  emitToLiveAudioRoom(roomId, "live-audio:role-changed", { userId: targetUserId, role: "LISTENER" });
}

export async function muteParticipant(roomId: string, actorId: string, targetUserId: string, muted: boolean): Promise<void> {
  await requireLiveAudioAccess(actorId);
  const actorRole = await getMyRole(roomId, actorId);
  if (!canPromoteSpeaker(actorRole)) throw LiveAudioErrors.forbidden();

  const result = await prisma.liveAudioParticipant.updateMany({
    where: {
      roomId,
      userId: targetUserId,
      role: { in: ["SPEAKER", "MODERATOR", "HOST"] },
      ...ACTIVE_PARTICIPANT_WHERE,
    },
    data: { isMuted: muted },
  });
  if (result.count !== 1) throw LiveAudioErrors.invalidState("That user can't be muted (not an active publisher).");

  await logModerationAction(roomId, actorId, targetUserId, muted ? "MUTE" : "UNMUTE");
  emitToLiveAudioRoom(roomId, "live-audio:mute-changed", { userId: targetUserId, isMuted: muted });

  if (muted) await forceMuteAtMediaLayer(roomId, targetUserId);
}

async function forceMuteAtMediaLayer(roomId: string, userId: string): Promise<void> {
  const config = getLiveKitConfig();
  if (!config) return;
  try {
    const { RoomServiceClient } = await import("livekit-server-sdk");
    const client = new RoomServiceClient(config.url, config.apiKey, config.apiSecret);
    const { TrackType } = await import("@livekit/protocol");
    const { tracks } = await client.getParticipant(roomId, userId);
    for (const track of tracks) {
      if (track.type === TrackType.AUDIO) {
        await client.mutePublishedTrack(roomId, userId, track.sid, true);
      }
    }
  } catch (err) {
    // Best-effort - our own isMuted flag/notification-suppression is
    // the authoritative "should this person's audio be heard" signal
    // client-side; the SFU-level mute is defense in depth on top of it.
    console.error(`Failed to force-mute ${userId} in LiveKit room ${roomId}:`, err);
  }
}

export async function removeParticipant(roomId: string, actorId: string, targetUserId: string, reason?: string): Promise<void> {
  await requireLiveAudioAccess(actorId);
  const actorRole = await getMyRole(roomId, actorId);
  if (!isRoomAuthority(actorRole)) throw LiveAudioErrors.forbidden();

  const room = await getRoomOrThrow(roomId);
  if (targetUserId === room.hostId) {
    // A moderator removing the host is never valid - see the
    // architecture doc's security review checklist.
    throw LiveAudioErrors.forbidden("The host can't be removed.");
  }

  const result = await prisma.liveAudioParticipant.updateMany({
    where: activeParticipantWhere(roomId, targetUserId),
    data: { removedAt: new Date(), removedById: actorId, leftAt: new Date() },
  });
  if (result.count !== 1) throw LiveAudioErrors.notParticipant();

  await logModerationAction(roomId, actorId, targetUserId, "REMOVE", reason);
  emitToLiveAudioRoom(roomId, "live-audio:participant-removed", { userId: targetUserId });
  emitToUser(targetUserId, "live-audio:you-were-removed", { roomId });
  // Exclusion must not depend on the removed client cooperating: a
  // client that ignores the "you-were-removed" event above and never
  // reconnects would otherwise keep receiving this room's broadcasts
  // (who's speaking, mute/role changes) indefinitely even after the
  // actual LiveKit audio connection below is force-dropped.
  evictUserFromLiveAudioRoom(targetUserId, roomId);
  await forceDisconnectParticipant(roomId, targetUserId);
}

// ─── Speaker requests ────────────────────────────────────────────────

export async function requestToSpeak(roomId: string, userId: string): Promise<void> {
  await requireLiveAudioAccess(userId);
  const role = await getMyRole(roomId, userId);
  if (role !== "LISTENER") {
    throw LiveAudioErrors.invalidState("Only an active listener can request to speak.");
  }

  await prisma.liveAudioSpeakerRequest.upsert({
    where: { roomId_userId: { roomId, userId } },
    create: { roomId, userId, status: "PENDING" },
    update: { status: "PENDING", requestedAt: new Date(), resolvedAt: null, resolvedById: null },
  });

  // A realtime ping to every current room authority (host + moderators)
  // so their pending-requests queue updates live - never an email/push,
  // matching the mission's explicit anti-spam instruction for a signal
  // this frequent.
  const authorities = await prisma.liveAudioParticipant.findMany({
    where: { roomId, role: { in: ["HOST", "MODERATOR"] }, ...ACTIVE_PARTICIPANT_WHERE },
    select: { userId: true },
  });
  for (const a of authorities) emitToUser(a.userId, "live-audio:speaker-request", { roomId, userId });
}

export async function resolveSpeakerRequest(
  roomId: string,
  actorId: string,
  targetUserId: string,
  approve: boolean
): Promise<void> {
  await requireLiveAudioAccess(actorId);
  const actorRole = await getMyRole(roomId, actorId);
  if (!isRoomAuthority(actorRole)) throw LiveAudioErrors.forbidden();

  const request = await prisma.liveAudioSpeakerRequest.findUnique({
    where: { roomId_userId: { roomId, userId: targetUserId } },
  });
  if (!request || request.status !== "PENDING") throw LiveAudioErrors.requestNotFound();

  await prisma.$transaction(async (tx) => {
    const updated = await tx.liveAudioSpeakerRequest.updateMany({
      where: { roomId, userId: targetUserId, status: "PENDING" },
      data: { status: approve ? "APPROVED" : "REJECTED", resolvedAt: new Date(), resolvedById: actorId },
    });
    if (updated.count !== 1) throw LiveAudioErrors.requestNotFound();

    if (approve) {
      const promoted = await tx.liveAudioParticipant.updateMany({
        where: { roomId, userId: targetUserId, role: "LISTENER", ...ACTIVE_PARTICIPANT_WHERE },
        data: { role: "SPEAKER" },
      });
      if (promoted.count !== 1) {
        throw LiveAudioErrors.invalidState("That user is no longer an active listener in this room.");
      }
    }
  });

  if (approve) {
    await bumpPeakCounts(roomId);
    emitToLiveAudioRoom(roomId, "live-audio:role-changed", { userId: targetUserId, role: "SPEAKER" });
    await logModerationAction(roomId, actorId, targetUserId, "PROMOTE_SPEAKER", "via speaker request");
  }

  await createNotification({
    userId: targetUserId,
    type: approve ? "live_audio_speaker_approved" : "live_audio_speaker_rejected",
    fromUserId: actorId,
  });
}

// ─── Notifications ───────────────────────────────────────────────────

async function notifyCommunityRoomStarted(communityId: string, room: LiveAudioRoom): Promise<void> {
  const members = await prisma.communityMember.findMany({
    where: { communityId, userId: { not: room.hostId } },
    select: { userId: true },
  });
  const host = await prisma.user.findUnique({ where: { id: room.hostId }, select: { name: true, username: true } });
  const hostName = host?.name || host?.username || "Someone";

  // Fan-out is bounded by community size, matches the pattern
  // notifySubscribersOfNewPost already uses for a "someone you follow
  // did something" broadcast - each recipient's own createNotification
  // call independently checks their own block relationship with the
  // host, so a member who has blocked the host correctly gets nothing.
  await Promise.all(
    members.map((m) =>
      createNotification({ userId: m.userId, type: "live_audio_started", fromUserId: room.hostId })
    )
  );
  for (const m of members) {
    void sendPushNotification(m.userId, `${hostName} is live`, room.title, `/live-audio/${room.id}`);
  }
}

// ─── Cleanup (cron) ──────────────────────────────────────────────────

const MAX_ROOM_DURATION_MS = 24 * 60 * 60 * 1000;

/**
 * Ends any LIVE room that is genuinely abandoned - see
 * docs/live-audio-architecture.md §5 for why these two conditions
 * (zero active participants, or an absolute 24h cap) need no separate
 * Redis heartbeat to compute. Called only from
 * GET /api/cron/live-audio-cleanup (CRON_SECRET-gated). Returns how many
 * rooms it ended, for the cron's own response/observability.
 */
export async function cleanupAbandonedRooms(): Promise<{ endedRoomIds: string[] }> {
  const liveRooms = await prisma.liveAudioRoom.findMany({
    where: { status: "LIVE" },
    select: { id: true, hostId: true, startedAt: true },
  });
  if (liveRooms.length === 0) return { endedRoomIds: [] };

  const now = Date.now();
  const endedRoomIds: string[] = [];

  for (const room of liveRooms) {
    const activeCount = await prisma.liveAudioParticipant.count({
      where: { roomId: room.id, ...ACTIVE_PARTICIPANT_WHERE },
    });
    const expiredByDuration = room.startedAt ? now - room.startedAt.getTime() > MAX_ROOM_DURATION_MS : false;
    if (activeCount > 0 && !expiredByDuration) continue;

    // Calls performEndRoom() directly, NOT the public endRoom(): the
    // "zero active participants" trigger condition means the host's own
    // participant row is (by definition) no longer active, so
    // endRoom()'s own actor-authorization check would always reject a
    // host who has already left - correctly so for a real user, but
    // this is the system acting on an abandoned room's behalf, not a
    // user action.
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
 * Called from the existing admin ban route the moment a user is banned.
 * A banned user must not remain able to speak just because an old
 * realtime connection is still open (mission §15). Ends the user's
 * membership in every room they're currently active in; any room where
 * they were the sole HOST is ended outright rather than left ownerless.
 */
export async function forceLeaveAllLiveAudioRooms(userId: string): Promise<void> {
  const activeMemberships = await prisma.liveAudioParticipant.findMany({
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
    await prisma.liveAudioParticipant.updateMany({
      where: { roomId: membership.roomId, userId, ...ACTIVE_PARTICIPANT_WHERE },
      data: { leftAt: new Date() },
    });
    emitToLiveAudioRoom(membership.roomId, "live-audio:participant-left", { userId });
    evictUserFromLiveAudioRoom(userId, membership.roomId);
    await forceDisconnectParticipant(membership.roomId, userId);
  }
}
