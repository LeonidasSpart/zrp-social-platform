import { prisma } from "@/lib/db";
import { isBlockedEitherWay } from "@/lib/auth-guards";
import { checkRateLimitKey } from "@/lib/rate-limit";
import { emitToLiveAudioRoom, emitToLiveVideoRoom } from "@/lib/socket-emit";
import { LiveChatErrors } from "./errors";

export type LiveRoomType = "AUDIO" | "VIDEO";

const MAX_MESSAGE_LENGTH = 500;
// Anti-spam floor, independent of (and always at least as strict as) a
// host's slow mode - a host who sets slowModeSeconds: 0 still can't be
// flooded faster than this.
const RATE_LIMIT_MESSAGES = 10;
const RATE_LIMIT_WINDOW_SECONDS = 30;

async function getRoomAndParticipant(roomType: LiveRoomType, roomId: string, userId: string) {
  const room =
    roomType === "AUDIO"
      ? await prisma.liveAudioRoom.findUnique({ where: { id: roomId } })
      : await prisma.liveVideoRoom.findUnique({ where: { id: roomId } });
  if (!room) throw LiveChatErrors.roomNotFound();

  const participant =
    roomType === "AUDIO"
      ? await prisma.liveAudioParticipant.findFirst({ where: { roomId, userId, leftAt: null, removedAt: null } })
      : await prisma.liveVideoParticipant.findFirst({ where: { roomId, userId, leftAt: null, removedAt: null } });

  return { room, participant };
}

export interface SendMessageInput {
  authorId: string;
  roomType: LiveRoomType;
  roomId: string;
  body: string;
}

export interface ChatMessageResult {
  id: string;
  authorId: string;
  body: string;
  createdAt: Date;
}

/**
 * Posts a chat message into a LIVE room. Rate-limited two ways: a fixed
 * anti-spam ceiling (RATE_LIMIT_MESSAGES per RATE_LIMIT_WINDOW_SECONDS,
 * always in effect) and the room's own host-configurable slowModeSeconds
 * (0 = off), tracked via LiveAudio/VideoParticipant.lastChatMessageAt so
 * it costs one read, not a second rate-limit backend.
 */
export async function sendMessage(input: SendMessageInput): Promise<ChatMessageResult> {
  const { authorId, roomType, roomId, body } = input;

  const trimmed = typeof body === "string" ? body.trim() : "";
  if (!trimmed) throw LiveChatErrors.validation("Message body is required.");
  if (trimmed.length > MAX_MESSAGE_LENGTH) {
    throw LiveChatErrors.validation(`Message must be ${MAX_MESSAGE_LENGTH} characters or fewer.`);
  }

  const { room, participant } = await getRoomAndParticipant(roomType, roomId, authorId);
  if (room.status !== "LIVE") throw LiveChatErrors.roomNotLive();
  if (!participant) throw LiveChatErrors.notParticipant();
  if (participant.isChatMuted) throw LiveChatErrors.chatMuted();

  if (room.hostId !== authorId && (await isBlockedEitherWay(room.hostId, authorId))) {
    throw LiveChatErrors.blocked();
  }

  const rate = await checkRateLimitKey(`live-chat:${roomId}:${authorId}`, RATE_LIMIT_MESSAGES, RATE_LIMIT_WINDOW_SECONDS);
  if (!rate.success) throw LiveChatErrors.rateLimited(rate.retryAfter);

  if (room.slowModeSeconds > 0 && participant.lastChatMessageAt) {
    const elapsedMs = Date.now() - participant.lastChatMessageAt.getTime();
    const remainingSeconds = room.slowModeSeconds - Math.floor(elapsedMs / 1000);
    if (remainingSeconds > 0) throw LiveChatErrors.slowMode(remainingSeconds);
  }

  const data =
    roomType === "AUDIO"
      ? { authorId, body: trimmed, liveAudioRoomId: roomId }
      : { authorId, body: trimmed, liveVideoRoomId: roomId };

  const [message] = await prisma.$transaction([
    prisma.liveChatMessage.create({ data }),
    roomType === "AUDIO"
      ? prisma.liveAudioParticipant.update({ where: { id: participant.id }, data: { lastChatMessageAt: new Date() } })
      : prisma.liveVideoParticipant.update({ where: { id: participant.id }, data: { lastChatMessageAt: new Date() } }),
  ]);

  const emitToRoom = roomType === "AUDIO" ? emitToLiveAudioRoom : emitToLiveVideoRoom;
  emitToRoom(roomId, "live-chat:message", {
    id: message.id,
    authorId,
    body: message.body,
    createdAt: message.createdAt,
  });

  return { id: message.id, authorId, body: message.body, createdAt: message.createdAt };
}

export async function listMessages(params: { roomType: LiveRoomType; roomId: string; viewerId: string; cursor?: string | null; limit?: number }) {
  const { roomType, roomId, viewerId, cursor, limit = 50 } = params;

  const room =
    roomType === "AUDIO"
      ? await prisma.liveAudioRoom.findUnique({ where: { id: roomId }, select: { hostId: true } })
      : await prisma.liveVideoRoom.findUnique({ where: { id: roomId }, select: { hostId: true } });
  if (!room) throw LiveChatErrors.roomNotFound();

  if (await isBlockedEitherWay(room.hostId, viewerId)) throw LiveChatErrors.blocked();

  const take = Math.min(limit, 100);
  const messages = await prisma.liveChatMessage.findMany({
    where: {
      ...(roomType === "AUDIO" ? { liveAudioRoomId: roomId } : { liveVideoRoomId: roomId }),
      deletedAt: null,
    },
    orderBy: { createdAt: "desc" },
    take: take + 1,
    ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
    select: {
      id: true,
      body: true,
      createdAt: true,
      author: { select: { id: true, username: true, name: true, avatarUrl: true } },
    },
  });

  let nextCursor: string | null = null;
  if (messages.length > take) {
    const page = messages.slice(0, take);
    nextCursor = page[page.length - 1].id;
    return { messages: page, nextCursor };
  }
  return { messages, nextCursor };
}

/** Host/moderator OR the message's own author may delete it. Soft delete only - see schema.prisma's comment on why. */
export async function deleteMessage(params: { actorId: string; roomType: LiveRoomType; roomId: string; messageId: string }) {
  const { actorId, roomType, roomId, messageId } = params;

  const message = await prisma.liveChatMessage.findUnique({ where: { id: messageId } });
  if (!message || message.deletedAt) throw LiveChatErrors.messageNotFound();
  const matchesRoom = roomType === "AUDIO" ? message.liveAudioRoomId === roomId : message.liveVideoRoomId === roomId;
  if (!matchesRoom) throw LiveChatErrors.messageNotFound();

  if (message.authorId !== actorId) {
    const participant =
      roomType === "AUDIO"
        ? await prisma.liveAudioParticipant.findFirst({ where: { roomId, userId: actorId, leftAt: null, removedAt: null } })
        : await prisma.liveVideoParticipant.findFirst({ where: { roomId, userId: actorId, leftAt: null, removedAt: null } });
    if (!participant || !["HOST", "MODERATOR"].includes(participant.role)) {
      throw LiveChatErrors.forbidden("Only the message's author or a host/moderator can delete it.");
    }
  }

  await prisma.liveChatMessage.update({
    where: { id: messageId },
    data: { deletedAt: new Date(), deletedById: actorId },
  });

  const emitToRoom = roomType === "AUDIO" ? emitToLiveAudioRoom : emitToLiveVideoRoom;
  emitToRoom(roomId, "live-chat:message-deleted", { id: messageId });
}

async function requireHostOrModerator(roomType: LiveRoomType, roomId: string, actorId: string) {
  const participant =
    roomType === "AUDIO"
      ? await prisma.liveAudioParticipant.findFirst({ where: { roomId, userId: actorId, leftAt: null, removedAt: null } })
      : await prisma.liveVideoParticipant.findFirst({ where: { roomId, userId: actorId, leftAt: null, removedAt: null } });
  if (!participant || !["HOST", "MODERATOR"].includes(participant.role)) {
    throw LiveChatErrors.forbidden("Only a host or moderator can do that.");
  }
}

export async function setChatMute(params: { actorId: string; roomType: LiveRoomType; roomId: string; targetUserId: string; muted: boolean }) {
  const { actorId, roomType, roomId, targetUserId, muted } = params;
  await requireHostOrModerator(roomType, roomId, actorId);

  const target =
    roomType === "AUDIO"
      ? await prisma.liveAudioParticipant.findFirst({ where: { roomId, userId: targetUserId, leftAt: null, removedAt: null } })
      : await prisma.liveVideoParticipant.findFirst({ where: { roomId, userId: targetUserId, leftAt: null, removedAt: null } });
  if (!target) throw LiveChatErrors.notParticipant();

  if (roomType === "AUDIO") {
    await prisma.liveAudioParticipant.update({ where: { id: target.id }, data: { isChatMuted: muted } });
  } else {
    await prisma.liveVideoParticipant.update({ where: { id: target.id }, data: { isChatMuted: muted } });
  }

  const emitToRoom = roomType === "AUDIO" ? emitToLiveAudioRoom : emitToLiveVideoRoom;
  emitToRoom(roomId, "live-chat:mute-changed", { userId: targetUserId, isChatMuted: muted });
}

export async function setSlowMode(params: { actorId: string; roomType: LiveRoomType; roomId: string; seconds: number }) {
  const { actorId, roomType, roomId, seconds } = params;
  if (!Number.isInteger(seconds) || seconds < 0 || seconds > 3600) {
    throw LiveChatErrors.validation("Slow mode must be between 0 and 3600 seconds.");
  }
  await requireHostOrModerator(roomType, roomId, actorId);

  if (roomType === "AUDIO") {
    await prisma.liveAudioRoom.update({ where: { id: roomId }, data: { slowModeSeconds: seconds } });
  } else {
    await prisma.liveVideoRoom.update({ where: { id: roomId }, data: { slowModeSeconds: seconds } });
  }

  const emitToRoom = roomType === "AUDIO" ? emitToLiveAudioRoom : emitToLiveVideoRoom;
  emitToRoom(roomId, "live-chat:slow-mode-changed", { seconds });
}
