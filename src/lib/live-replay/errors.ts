import { LiveAudioError } from "@/lib/live-audio/errors";

export const LiveReplayErrors = {
  roomNotFound: () => new LiveAudioError("room_not_found", "Room not found.", 404),
  roomNotLive: () => new LiveAudioError("room_not_live", "This room is not live.", 409),
  forbidden: (message = "Only a host or moderator can do that.") => new LiveAudioError("forbidden", message, 403),
  /**
   * The real, production code path exists (see replay-service.ts) - this
   * is the fail-closed response when the LiveKit Egress S3 destination
   * isn't configured, same "typed not_configured error, never a fake
   * success" pattern getLiveKitConfig()/checkLiveKitHealth() already use
   * for the base LiveKit connection itself.
   */
  notConfigured: () =>
    new LiveAudioError(
      "replay_not_configured",
      "Live replay isn't configured on this server yet.",
      503
    ),
  recordingNotFound: () => new LiveAudioError("recording_not_found", "Recording not found.", 404),
  alreadyRecording: () => new LiveAudioError("already_recording", "This room is already being recorded.", 409),
  notRecording: () => new LiveAudioError("not_recording", "This room isn't currently being recorded.", 409),
};
