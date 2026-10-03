import { LiveAudioError } from "@/lib/live-audio/errors";

export const LiveReactionErrors = {
  roomNotFound: () => new LiveAudioError("room_not_found", "Room not found.", 404),
  roomNotLive: () => new LiveAudioError("room_not_live", "This room is not live.", 409),
  notParticipant: () => new LiveAudioError("not_participant", "You're not in this room.", 409),
  rateLimited: (retryAfter: number) => {
    const err = new LiveAudioError("rate_limited", "Too many reactions. Please slow down.", 429);
    (err as LiveAudioError & { retryAfter: number }).retryAfter = retryAfter;
    return err;
  },
  validation: (message: string) => new LiveAudioError("validation_error", message, 400),
};
