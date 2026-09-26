import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { verifyLiveKitWebhook } from "@/lib/live-audio/livekit";
import { emitToLiveAudioRoom } from "@/lib/socket-emit";

export const dynamic = "force-dynamic";

/*
 * LiveKit's own webhook - the SFU is the actual authority on "is anyone
 * still connected," which is what makes the room-lifecycle guarantee in
 * docs/live-audio-architecture.md §5 correct rather than a heuristic.
 *
 * ⚠️ SECURITY: every request's Authorize header is verified against
 * LIVEKIT_WEBHOOK_API_KEY/SECRET (or the main API key/secret pair) via
 * livekit-server-sdk's own WebhookReceiver before anything in the body
 * is trusted - an unverified request is rejected outright, never
 * processed "with reduced trust." The raw body is read as text
 * (req.text()) rather than req.json() because the signature is computed
 * over the exact byte sequence LiveKit sent; re-serializing a parsed
 * JSON object would not reproduce it.
 */
export async function POST(req: NextRequest) {
  const body = await req.text();
  const event = await verifyLiveKitWebhook(body, req.headers.get("Authorize"));
  if (!event) {
    return NextResponse.json({ error: "Invalid webhook signature" }, { status: 401 });
  }

  const roomId = event.room?.name;

  try {
    switch (event.event) {
      case "room_finished": {
        if (!roomId) break;
        // The SFU's own room emptied and closed. Only touches a room
        // still marked LIVE - an event that arrives after an explicit
        // end() or the cleanup cron already closed it is a no-op, not
        // an error (LiveKit may resend webhooks; this must be
        // idempotent).
        const now = new Date();
        await prisma.$transaction([
          prisma.liveAudioRoom.updateMany({
            where: { id: roomId, status: "LIVE" },
            data: { status: "ENDED", endedAt: now },
          }),
          prisma.liveAudioParticipant.updateMany({
            where: { roomId, leftAt: null, removedAt: null },
            data: { leftAt: now },
          }),
        ]);
        emitToLiveAudioRoom(roomId, "live-audio:room-ended", { roomId });
        break;
      }
      case "participant_left": {
        const identity = event.participant?.identity;
        if (!roomId || !identity) break;
        // Only marks a still-active row - a participant who already
        // left via the REST /leave route (or was removed by a
        // moderator) is untouched, so this can never resurrect a
        // deliberate removal's leftAt/removedAt timestamps.
        const updated = await prisma.liveAudioParticipant.updateMany({
          where: { roomId, userId: identity, leftAt: null, removedAt: null },
          data: { leftAt: new Date() },
        });
        if (updated.count > 0) {
          emitToLiveAudioRoom(roomId, "live-audio:participant-left", { userId: identity });
        }
        break;
      }
      default:
        // room_started/participant_joined/track_*/egress_*/ingress_* -
        // no action needed; our own REST routes are already the source
        // of truth for those transitions (they call LiveKit, not the
        // other way around, for the events this app currently cares
        // about).
        break;
    }
  } catch (err) {
    // A webhook processing failure must never surface to LiveKit as a
    // reason to keep retrying indefinitely with no visibility - log and
    // acknowledge; the cleanup cron is the backstop if room state ever
    // actually drifts from what this event would have corrected.
    console.error(`LiveKit webhook handling failed for event "${event.event}":`, err);
  }

  return NextResponse.json({ received: true });
}
