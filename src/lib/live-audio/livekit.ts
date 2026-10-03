import { AccessToken, WebhookReceiver, type WebhookEvent } from "livekit-server-sdk";
import type { LiveAudioParticipantRole } from "@prisma/client";

/*
 * ============================================================
 * LiveKit integration - the media/SFU boundary
 * ============================================================
 *
 * See docs/live-audio-architecture.md §2 for why an SFU (LiveKit) was
 * chosen over ZRP's existing 1:1 mesh WebRTC stack.
 *
 * ⚠️ Everything in this file that does NOT require reaching a live
 * LiveKit server is real, production code: minting an access token is
 * pure local JWT signing (AccessToken.toJwt()), and verifying a webhook
 * signature is pure local crypto (WebhookReceiver.receive()). Neither
 * needs LIVEKIT_URL to be reachable. Actually connecting a client to a
 * room DOES need a running LiveKit deployment (self-hosted or Cloud) -
 * that is the genuine external-infrastructure boundary this codebase
 * cannot provision or test end-to-end. See the final report.
 *
 * Every function here fails closed (returns null / throws a typed
 * error) when the required env vars are unset, rather than minting a
 * fake token or skipping verification - "never fake an integration."
 */

export interface LiveKitConfig {
  apiKey: string;
  apiSecret: string;
  url: string;
}

/**
 * Reads the LiveKit config from the environment. Returns null (not a
 * throw) when unconfigured, so every call site can fail closed with a
 * clean "Live Audio is not configured" 503 instead of a stack trace.
 */
export function getLiveKitConfig(): LiveKitConfig | null {
  const apiKey = process.env.LIVEKIT_API_KEY;
  const apiSecret = process.env.LIVEKIT_API_SECRET;
  const url = process.env.LIVEKIT_URL;
  if (!apiKey || !apiSecret || !url) return null;
  return { apiKey, apiSecret, url };
}

/**
 * The webhook may be verified against a distinct key/secret pair (LiveKit
 * supports per-endpoint keys); falls back to the main pair when unset, so
 * a single-key deployment needs no extra configuration.
 */
function getWebhookConfig(): { apiKey: string; apiSecret: string } | null {
  const apiKey = process.env.LIVEKIT_WEBHOOK_API_KEY || process.env.LIVEKIT_API_KEY;
  const apiSecret = process.env.LIVEKIT_WEBHOOK_API_SECRET || process.env.LIVEKIT_API_SECRET;
  if (!apiKey || !apiSecret) return null;
  return { apiKey, apiSecret };
}

// A room join token is short-lived by mission requirement, but long
// enough that a participant who stays in a room for a while doesn't get
// silently disconnected mid-session - matches the existing call
// registry's own "active" TTL (6h, see socket-authz.js) rather than
// inventing a different number. The join route mints a brand-new token
// (with the participant's CURRENT, freshly-verified role) every time
// it's called, including on reconnect - so a promotion/demotion takes
// effect the next time the client reconnects or explicitly refreshes,
// never by mutating a token already in a client's hands.
const TOKEN_TTL = "6h";

export interface MintTokenParams {
  roomId: string;
  userId: string;
  /** Shown to other participants; never used for authorization. */
  displayName: string;
  role: LiveAudioParticipantRole;
}

/**
 * Mints a room-scoped, role-scoped LiveKit access token. The LiveKit
 * server enforces these grants at the media layer - a LISTENER's token
 * never carries canPublish, so no client-side tampering can turn a
 * listener into a publisher (see docs §7). identity is the ZRP userId
 * itself: stable, unique, and lets LiveKit's own participant list be
 * cross-referenced back to a real user without a second identity
 * mapping table.
 */
export async function mintLiveKitToken(params: MintTokenParams): Promise<string | null> {
  const config = getLiveKitConfig();
  if (!config) return null;

  const { roomId, userId, displayName, role } = params;
  const isElevated = role === "HOST" || role === "MODERATOR";
  const canPublish = isElevated || role === "SPEAKER";

  const token = new AccessToken(config.apiKey, config.apiSecret, {
    identity: userId,
    name: displayName,
    ttl: TOKEN_TTL,
  });

  token.addGrant({
    room: roomId,
    roomJoin: true,
    canPublish,
    canSubscribe: true,
    // Only a room-authority role may administer the room at the media
    // layer (LiveKit-level force-mute/remove) - defense in depth on top
    // of ZRP's own DB-driven moderation actions, never a substitute for
    // the server-side role check in permissions.ts.
    roomAdmin: isElevated,
    // Data-channel messages (e.g. reactions) are limited to publishers;
    // a listener's "request to speak" goes through the REST API instead
    // (POST /speak/request), which is auditable and rate-limited -
    // giving every listener a second, unaudited realtime channel for
    // the same intent isn't needed.
    canPublishData: canPublish,
  });

  return token.toJwt();
}

/**
 * Verifies and parses an inbound LiveKit webhook. Returns null for a
 * missing/invalid signature or missing webhook config - callers must
 * treat null as "reject the request," never as "process with reduced
 * trust."
 */
export async function verifyLiveKitWebhook(
  body: string,
  authHeader: string | null
): Promise<WebhookEvent | null> {
  const config = getWebhookConfig();
  if (!config || !authHeader) return null;

  try {
    const receiver = new WebhookReceiver(config.apiKey, config.apiSecret);
    return await receiver.receive(body, authHeader);
  } catch (err) {
    console.error("LiveKit webhook verification failed:", err);
    return null;
  }
}

/**
 * Forcibly disconnects a participant at the media layer - used when a
 * user is banned mid-session (§7 of the architecture doc) or removed by
 * a moderator, so the SFU connection actually drops instead of only the
 * Postgres row going stale while an already-open media connection keeps
 * carrying their audio. Best-effort: a failure here must not block the
 * DB-side removal that already happened, since Postgres (not LiveKit)
 * is authoritative for "is this person still a participant."
 */
export async function forceDisconnectParticipant(roomId: string, userId: string): Promise<void> {
  const config = getLiveKitConfig();
  if (!config) return;

  try {
    const { RoomServiceClient } = await import("livekit-server-sdk");
    const client = new RoomServiceClient(config.url, config.apiKey, config.apiSecret);
    await client.removeParticipant(roomId, userId);
  } catch (err) {
    // Room may already be gone, participant may already have
    // disconnected, or LiveKit may be unreachable - none of these are
    // this function's caller's problem to handle differently.
    console.error(`Failed to force-disconnect ${userId} from LiveKit room ${roomId}:`, err);
  }
}

export type LiveKitHealthStatus = "not_configured" | "unauthorized" | "unreachable" | "healthy";

export interface LiveKitHealthResult {
  status: LiveKitHealthStatus;
  /** Plain-English diagnostic for an operator - never shown to end users. */
  detail: string;
}

/**
 * On-demand credential/connectivity check for ops - deliberately NOT
 * called from the join/token-mint path (mintLiveKitToken stays pure
 * local JWT signing, by design: see the file-level comment above on
 * why minting must never require LiveKit to be reachable). This is for
 * an operator to run after touching LIVEKIT_* env vars or rotating a
 * key in the LiveKit dashboard, to get a real yes/no answer - "the key
 * pair is configured but rejected by the server" vs. "the server isn't
 * reachable at all" - without having to reproduce the failure by
 * actually joining a live room (see docs/live-audio-architecture.md).
 *
 * Uses RoomServiceClient.listRooms(), the cheapest authenticated call
 * the server SDK exposes: it has to succeed against the real LiveKit
 * project to return anything, so a 401/403-shaped rejection can only
 * mean the configured key/secret don't match what that project has on
 * file, while a network-level failure (DNS, connection refused,
 * timeout) means the project/URL itself is unreachable - distinct
 * failure modes an operator needs to tell apart before deciding
 * whether to rotate a key or check the URL/network instead.
 */
export async function checkLiveKitHealth(): Promise<LiveKitHealthResult> {
  const config = getLiveKitConfig();
  if (!config) {
    return {
      status: "not_configured",
      detail: "LIVEKIT_API_KEY, LIVEKIT_API_SECRET and LIVEKIT_URL are not all set.",
    };
  }

  try {
    const { RoomServiceClient } = await import("livekit-server-sdk");
    const client = new RoomServiceClient(config.url, config.apiKey, config.apiSecret);
    await client.listRooms();
    return { status: "healthy", detail: "LiveKit accepted the configured API key/secret." };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const isAuthRejection =
      /\b(401|403)\b|unauthenticated|permission_denied|invalid api key|invalid token|invalid signature|jwt/i.test(
        message
      );
    return isAuthRejection
      ? {
          status: "unauthorized",
          detail: `LiveKit rejected the configured LIVEKIT_API_KEY/LIVEKIT_API_SECRET: ${message}`,
        }
      : {
          status: "unreachable",
          detail: `Could not reach the LiveKit server at the configured LIVEKIT_URL: ${message}`,
        };
  }
}
