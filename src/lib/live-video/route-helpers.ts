/**
 * withLiveAudioAuth/checkRateLimit are generic (auth + LiveAudioError
 * catch + rate-limit wrapper, nothing audio-specific) - reused as-is.
 * liveAudioErrorResponseBody checks `instanceof LiveAudioError`, and
 * LiveVideoError (errors.ts) IS LiveAudioError, so a thrown
 * LiveVideoErrors.xxx() is caught and mapped correctly here too.
 */
export { withLiveAudioAuth, checkRateLimit } from "@/lib/live-audio/route-helpers";
