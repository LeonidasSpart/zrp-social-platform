import { LiveAudioError, LiveAudioErrors, liveAudioErrorResponseBody } from "@/lib/live-audio/errors";

/**
 * Live Video reuses LiveAudioError/liveAudioErrorResponseBody as-is -
 * the class is a generic (code, message, status) typed error with
 * nothing audio-specific about it, so route-helpers.ts's
 * `instanceof LiveAudioError` catch already works for a LiveVideoError
 * too. Only the one message that actually says "Live Audio" needs a
 * Live Video-flavored override.
 */
export { LiveAudioError as LiveVideoError, liveAudioErrorResponseBody as liveVideoErrorResponseBody };

export const LiveVideoErrors = {
  ...LiveAudioErrors,
  paidFeatureRequired: () =>
    new LiveAudioError(
      "live_video_paid_feature",
      "Live Video is available only to paid ZRP accounts. Upgrade your plan to access Live Video.",
      403
    ),
};
