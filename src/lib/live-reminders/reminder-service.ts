import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { createNotification } from "@/lib/notifications";
import { sendPushNotification } from "@/lib/push-notifications";
import { LiveAudioError } from "@/lib/live-audio/errors";

export type LiveRoomType = "AUDIO" | "VIDEO";

export const LiveReminderErrors = {
  roomNotFound: () => new LiveAudioError("room_not_found", "Room not found.", 404),
  notScheduled: () => new LiveAudioError("not_scheduled", "This room isn't a scheduled live - nothing to remind you about.", 409),
  cannotRemindSelf: () => new LiveAudioError("cannot_remind_self", "You can't set a reminder for your own room.", 400),
};

async function getScheduledRoom(roomType: LiveRoomType, roomId: string) {
  const room =
    roomType === "AUDIO"
      ? await prisma.liveAudioRoom.findUnique({ where: { id: roomId } })
      : await prisma.liveVideoRoom.findUnique({ where: { id: roomId } });
  if (!room) throw LiveReminderErrors.roomNotFound();
  return room;
}

/** "Remind me" - notified once when the host actually starts the room (see notifyReminderSubscribers). */
export async function createReminder(userId: string, roomType: LiveRoomType, roomId: string): Promise<void> {
  const room = await getScheduledRoom(roomType, roomId);
  if (room.status !== "SCHEDULED") throw LiveReminderErrors.notScheduled();
  if (room.hostId === userId) throw LiveReminderErrors.cannotRemindSelf();

  try {
    await prisma.liveReminder.create({
      data: {
        userId,
        liveAudioRoomId: roomType === "AUDIO" ? roomId : null,
        liveVideoRoomId: roomType === "VIDEO" ? roomId : null,
      },
    });
  } catch (err) {
    // Already subscribed - idempotent, not an error.
    if (!(err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002")) throw err;
  }
}

export async function cancelReminder(userId: string, roomType: LiveRoomType, roomId: string): Promise<void> {
  await prisma.liveReminder.deleteMany({
    where: {
      userId,
      ...(roomType === "AUDIO" ? { liveAudioRoomId: roomId } : { liveVideoRoomId: roomId }),
    },
  });
}

export async function hasReminder(userId: string, roomType: LiveRoomType, roomId: string): Promise<boolean> {
  const reminder = await prisma.liveReminder.findFirst({
    where: {
      userId,
      ...(roomType === "AUDIO" ? { liveAudioRoomId: roomId } : { liveVideoRoomId: roomId }),
    },
    select: { id: true },
  });
  return !!reminder;
}

/**
 * Fans out to every "remind me" subscriber the moment a host actually
 * starts a scheduled room - called from startScheduledRoom() in both
 * room-service.ts files, right alongside the existing
 * notifyCommunityRoomStarted() call. No cron/polling: starting is
 * already an explicit, real-time action, so this is strictly more
 * accurate than detecting "the scheduled time has passed."
 */
export async function notifyReminderSubscribers(
  roomType: LiveRoomType,
  room: { id: string; hostId: string; title: string }
): Promise<void> {
  const reminders = await prisma.liveReminder.findMany({
    where: roomType === "AUDIO" ? { liveAudioRoomId: room.id } : { liveVideoRoomId: room.id },
    select: { userId: true },
  });
  if (reminders.length === 0) return;

  const host = await prisma.user.findUnique({ where: { id: room.hostId }, select: { name: true, username: true } });
  const hostName = host?.name || host?.username || "Someone";
  const notificationType = roomType === "AUDIO" ? "live_audio_started" : "live_video_started";
  const path = roomType === "AUDIO" ? `/live-audio/${room.id}` : `/live-video/${room.id}`;

  await Promise.all(
    reminders.map((r) => createNotification({ userId: r.userId, type: notificationType, fromUserId: room.hostId }))
  );
  for (const r of reminders) {
    void sendPushNotification(r.userId, `${hostName} is live`, room.title, path);
  }
}
