import { LiveAudioError } from "@/lib/live-audio/errors";

/** Reuses LiveAudioError - see live-gifts/errors.ts for why this is safe across every room-type route helper. */
export const LiveChatErrors = {
  roomNotFound: () => new LiveAudioError("room_not_found", "Room not found.", 404),
  roomNotLive: () => new LiveAudioError("room_not_live", "This room is not live.", 409),
  notParticipant: () => new LiveAudioError("not_participant", "You're not in this room.", 409),
  chatMuted: () => new LiveAudioError("chat_muted", "You've been muted in this room's chat.", 403),
  blocked: () => new LiveAudioError("blocked", "You can't post in this room.", 403),
  slowMode: (retryAfter: number) => {
    const err = new LiveAudioError("slow_mode", "Slow mode is on - please wait before sending another message.", 429);
    (err as LiveAudioError & { retryAfter: number }).retryAfter = retryAfter;
    return err;
  },
  rateLimited: (retryAfter: number) => {
    const err = new LiveAudioError("rate_limited", "Too many messages. Please slow down.", 429);
    (err as LiveAudioError & { retryAfter: number }).retryAfter = retryAfter;
    return err;
  },
  messageNotFound: () => new LiveAudioError("message_not_found", "Message not found.", 404),
  forbidden: (message = "You don't have permission to do that.") =>
    new LiveAudioError("forbidden", message, 403),
  validation: (message: string) => new LiveAudioError("validation_error", message, 400),
};
