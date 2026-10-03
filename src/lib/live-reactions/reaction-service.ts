import { prisma } from "@/lib/db";
import { checkRateLimitKey } from "@/lib/rate-limit";
import { emitToLiveAudioRoom, emitToLiveVideoRoom } from "@/lib/socket-emit";
import { LiveReactionErrors } from "./errors";

export type LiveRoomType = "AUDIO" | "VIDEO";

const MAX_TAPS_PER_REQUEST = 20;
// Anti-spam ceiling: Redis-backed (falls back to the same in-process
// limiter rate-limit.ts already uses elsewhere), not a second counting
// mechanism - this is what keeps write volume to Postgres bounded.
const RATE_LIMIT_TAPS = 60;
const RATE_LIMIT_WINDOW_SECONDS = 10;

export interface SendReactionInput {
  userId: string;
  roomType: LiveRoomType;
  roomId: string;
  /** Lets a client batch several rapid taps into one request instead of one round trip each. */
  count?: number;
}

/**
 * Realtime "like" taps, aggregated - never one database row per tap
 * (see LiveAudioRoom.reactionCount's schema comment for why). A tap
 * batch is a single atomic UPDATE incrementing the room's own running
 * total, rate-limited per user per room so the write volume stays
 * bounded regardless of how fast someone taps; the broadcast happens
 * immediately so every viewer's animation is realtime even though the
 * database write is a cheap aggregate.
 */
export async function sendReaction(input: SendReactionInput): Promise<{ roomReactionCount: number }> {
  const { userId, roomType, roomId } = input;
  const rawCount = Math.trunc(input.count ?? 1);
  if (!Number.isFinite(rawCount) || rawCount < 1) throw LiveReactionErrors.validation("count must be a positive integer.");
  const count = Math.min(rawCount, MAX_TAPS_PER_REQUEST);

  const room =
    roomType === "AUDIO"
      ? await prisma.liveAudioRoom.findUnique({ where: { id: roomId }, select: { status: true } })
      : await prisma.liveVideoRoom.findUnique({ where: { id: roomId }, select: { status: true } });
  if (!room) throw LiveReactionErrors.roomNotFound();
  if (room.status !== "LIVE") throw LiveReactionErrors.roomNotLive();

  const participant =
    roomType === "AUDIO"
      ? await prisma.liveAudioParticipant.findFirst({ where: { roomId, userId, leftAt: null, removedAt: null } })
      : await prisma.liveVideoParticipant.findFirst({ where: { roomId, userId, leftAt: null, removedAt: null } });
  if (!participant) throw LiveReactionErrors.notParticipant();

  const rate = await checkRateLimitKey(`live-reaction:${roomId}:${userId}`, RATE_LIMIT_TAPS, RATE_LIMIT_WINDOW_SECONDS);
  if (!rate.success) throw LiveReactionErrors.rateLimited(rate.retryAfter);

  const updated =
    roomType === "AUDIO"
      ? await prisma.liveAudioRoom.update({
          where: { id: roomId },
          data: { reactionCount: { increment: count } },
          select: { reactionCount: true },
        })
      : await prisma.liveVideoRoom.update({
          where: { id: roomId },
          data: { reactionCount: { increment: count } },
          select: { reactionCount: true },
        });

  const emitToRoom = roomType === "AUDIO" ? emitToLiveAudioRoom : emitToLiveVideoRoom;
  emitToRoom(roomId, "live-reaction:tap", { userId, count, roomReactionCount: updated.reactionCount });

  return { roomReactionCount: updated.reactionCount };
}
