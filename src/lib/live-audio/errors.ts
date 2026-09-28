/**
 * Predictable, typed errors for Live Audio - see
 * docs/live-audio-architecture.md and mission requirement "never leak
 * internal infrastructure details." Every route catches this exact
 * class and maps `status`/`code` to a response; anything else falls
 * through to a generic 500 with no detail exposed.
 */
export class LiveAudioError extends Error {
  code: string;
  status: number;

  constructor(code: string, message: string, status: number) {
    super(message);
    this.name = "LiveAudioError";
    this.code = code;
    this.status = status;
  }
}

export const LiveAudioErrors = {
  notConfigured: () =>
    new LiveAudioError("not_configured", "Live Audio is not configured.", 503),
  roomNotFound: () => new LiveAudioError("room_not_found", "Room not found.", 404),
  roomNotLive: () => new LiveAudioError("room_not_live", "This room is not live.", 409),
  roomAlreadyEnded: () => new LiveAudioError("room_already_ended", "This room has already ended.", 409),
  forbidden: (message = "You don't have permission to do that.") =>
    new LiveAudioError("forbidden", message, 403),
  banned: () => new LiveAudioError("banned", "Your account is banned.", 403),
  paidFeatureRequired: () =>
    new LiveAudioError(
      "live_audio_paid_feature",
      "Live Audio is available only to paid ZRP accounts. Upgrade your plan to access Live Audio.",
      403
    ),
  blocked: () => new LiveAudioError("blocked", "You can't join this room.", 403),
  removed: () =>
    new LiveAudioError("removed_from_room", "You were removed from this room.", 403),
  notParticipant: () => new LiveAudioError("not_participant", "You're not in this room.", 409),
  alreadyParticipant: () =>
    new LiveAudioError("already_participant", "You're already in this room.", 409),
  invalidState: (message: string) => new LiveAudioError("invalid_state", message, 409),
  requestNotFound: () =>
    new LiveAudioError("request_not_found", "No pending speaker request found.", 404),
  validation: (message: string) => new LiveAudioError("validation_error", message, 400),
  rateLimited: (retryAfter: number) => {
    const err = new LiveAudioError("rate_limited", "Too many requests. Please try again later.", 429);
    (err as LiveAudioError & { retryAfter: number }).retryAfter = retryAfter;
    return err;
  },
};

export function liveAudioErrorResponseBody(err: LiveAudioError): { error: string; code: string; retryAfter?: number } {
  const body: { error: string; code: string; retryAfter?: number } = {
    error: err.message,
    code: err.code,
  };
  const retryAfter = (err as LiveAudioError & { retryAfter?: number }).retryAfter;
  if (typeof retryAfter === "number") body.retryAfter = retryAfter;
  return body;
}
