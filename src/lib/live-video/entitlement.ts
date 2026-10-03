import { checkLiveAudioAccess } from "@/lib/live-audio/entitlement";
import { LiveVideoErrors } from "./errors";

/*
 * Live Video is bundled under the exact same paid entitlement as Live
 * Audio (the "liveAudio" plan feature flag in limits.ts, checked by
 * checkLiveAudioAccess) rather than a brand-new plan limit: both are
 * the same "real-time ZRP room" capability tier, and a user who
 * already pays for Live Audio should not need a second upgrade to
 * also get Live Video. See checkLiveAudioAccess's own doc comment for
 * the full subscription-lifecycle rules this inherits unchanged.
 */
export { checkLiveAudioAccess as checkLiveVideoAccess };

export async function requireLiveVideoAccess(userId: string): Promise<void> {
  const result = await checkLiveAudioAccess(userId);
  if (!result.allowed) {
    console.info(`Live Video access denied (${result.reason ?? "unknown"}) for user ${userId}`);
    throw LiveVideoErrors.paidFeatureRequired();
  }
}
