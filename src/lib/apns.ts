import { connect, constants as h2 } from "node:http2";
import { createPrivateKey, sign as cryptoSign } from "node:crypto";
import { prisma } from "./db";

// A real, direct Apple Push Notification service sender - HTTP/2 with a
// JWT (ES256, signed by a .p8 auth key) provider token, per Apple's
// "token-based" APNs provider API. This is deliberately independent of
// src/lib/fcm.ts: FCM can only deliver to a device holding an *FCM*
// registration token, which on iOS only the Firebase iOS SDK can mint
// from a raw APNs device token - this app has no such SDK (see
// ios-native/PARITY.md's B3), so FcmToken rows with platform "ios" are
// otherwise never actually deliverable. This module talks to Apple
// directly from the raw device/VoIP token the iOS app registers via
// PKPushRegistry/UNUserNotificationCenter, with no Firebase dependency
// at all. PushKit VoIP pushes in particular *require* this: FCM cannot
// deliver to the "voip" APNs topic under any configuration.
//
// Configured via APNS_KEY_ID / APNS_TEAM_ID / APNS_BUNDLE_ID /
// APNS_PRIVATE_KEY / APNS_ENVIRONMENT - all optional, exactly like
// FIREBASE_SERVICE_ACCOUNT_JSON and VAPID_PRIVATE_KEY: every function
// here is a safe no-op if they are unset or malformed (see apns.test.ts),
// never throwing into a caller that's sending a best-effort push. As of
// this change there is no real Apple Developer account or APNs key for
// this project (see ZRPSocial.entitlements's own note on Sign in with
// Apple), so in every environment today these env vars are unset and
// this module is intentionally inert - the wiring is real and correct
// for when real credentials exist, but has not been exercised against
// Apple's servers.

interface ApnsConfig {
  keyId: string;
  teamId: string;
  bundleId: string;
  privateKeyPem: string;
  host: string;
}

let cachedConfig: ApnsConfig | null | undefined;
let cachedToken: { jwt: string; issuedAt: number } | null = null;

function getApnsConfig(): ApnsConfig | null {
  if (cachedConfig !== undefined) return cachedConfig;

  const keyId = process.env.APNS_KEY_ID?.trim();
  const teamId = process.env.APNS_TEAM_ID?.trim();
  const bundleId = process.env.APNS_BUNDLE_ID?.trim();
  const rawPrivateKey = process.env.APNS_PRIVATE_KEY?.trim();
  const environment = process.env.APNS_ENVIRONMENT?.trim().toLowerCase();

  const presentCount = [keyId, teamId, bundleId, rawPrivateKey].filter(Boolean).length;
  if (!keyId || !teamId || !bundleId || !rawPrivateKey) {
    // 0 of 4 set is the expected, documented state today (no Apple
    // Developer account exists yet - see this file's header comment) and
    // would be noise on every boot, so it stays silent. 1-3 of 4 set can
    // only be a misconfiguration (a typo'd var name, one left off a
    // deploy) that would otherwise fail exactly as silently as "none
    // configured" - push just never arrives, with no signal anywhere
    // pointing at why. That partial state is always worth a loud warning,
    // in every environment, not production-only.
    if (presentCount > 0) {
      console.error(
        `APNs: partially configured (${presentCount}/4 of APNS_KEY_ID, APNS_TEAM_ID, ` +
          "APNS_BUNDLE_ID, APNS_PRIVATE_KEY are set). All four are required together - " +
          "APNs push (including PushKit VoIP call signaling) will silently fail to send " +
          "until the rest are set.",
      );
    }
    cachedConfig = null;
    return null;
  }

  if (process.env.NODE_ENV === "production" && environment !== "production") {
    // Apple requires production-signed (App Store/TestFlight) builds to
    // receive push from the production APNs host, not sandbox - a real
    // device running a production build will simply never receive a push
    // sent to api.sandbox.push.apple.com. Defaulting to sandbox is correct
    // for local/dev use (see the ternary below) but silently doing the
    // same in a production deployment would misroute every push with no
    // error anywhere - the HTTP/2 POST to Apple still "succeeds".
    console.error(
      "APNs: running with NODE_ENV=production but APNS_ENVIRONMENT is not set to " +
        "'production' (got " +
        (environment ? `'${environment}'` : "unset") +
        "). Falling back to the sandbox APNs host - push will silently never reach " +
        "production-signed (App Store/TestFlight) devices. Set APNS_ENVIRONMENT=production.",
    );
  }

  try {
    // A .p8 key pasted into an env var commonly arrives with literal
    // "\n" sequences instead of real newlines (the same shape
    // FIREBASE_SERVICE_ACCOUNT_JSON's embedded private_key needs); a
    // value that already has real newlines is unaffected by this.
    const privateKeyPem = rawPrivateKey.replace(/\\n/g, "\n");
    // Fails fast here (rather than on first send) if the PEM is malformed.
    createPrivateKey({ key: privateKeyPem, format: "pem" });

    cachedConfig = {
      keyId,
      teamId,
      bundleId,
      privateKeyPem,
      host: environment === "production" ? "api.push.apple.com" : "api.sandbox.push.apple.com",
    };
    console.log("APNs: provider configured", { environment: cachedConfig.host });
  } catch (err) {
    console.error("APNs: APNS_PRIVATE_KEY is not a valid PEM key:", err);
    cachedConfig = null;
  }

  return cachedConfig;
}

function base64url(input: Buffer | string): string {
  return Buffer.from(input).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** APNs provider JWTs are valid up to 1h; refreshed well inside that. */
const TOKEN_LIFETIME_SECONDS = 55 * 60;

function getProviderToken(config: ApnsConfig): string {
  const now = Math.floor(Date.now() / 1000);
  if (cachedToken && now - cachedToken.issuedAt < TOKEN_LIFETIME_SECONDS) {
    return cachedToken.jwt;
  }

  const header = base64url(JSON.stringify({ alg: "ES256", kid: config.keyId }));
  const claims = base64url(JSON.stringify({ iss: config.teamId, iat: now }));
  const signingInput = `${header}.${claims}`;

  const key = createPrivateKey({ key: config.privateKeyPem, format: "pem" });
  // "ieee-p1363" gives the raw r||s signature JWS's ES256 requires
  // directly, avoiding a manual DER-to-raw conversion step.
  const signature = cryptoSign("sha256", Buffer.from(signingInput), {
    key,
    dsaEncoding: "ieee-p1363",
  });

  const jwt = `${signingInput}.${base64url(signature)}`;
  cachedToken = { jwt, issuedAt: now };
  return jwt;
}

interface ApnsSendOutcome {
  deviceToken: string;
  status: number;
  reason?: string;
}

/** One POST /3/device/{token} over HTTP/2. Never throws. */
function postToApns(
  config: ApnsConfig,
  deviceToken: string,
  pushType: "alert" | "voip",
  payload: unknown
): Promise<ApnsSendOutcome> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (outcome: ApnsSendOutcome) => {
      if (settled) return;
      settled = true;
      resolve(outcome);
    };

    let session;
    try {
      session = connect(`https://${config.host}`);
    } catch (err) {
      console.error("APNs: failed to open HTTP/2 session:", err);
      finish({ deviceToken, status: 0, reason: "session-open-error" });
      return;
    }

    session.on("error", (err) => {
      console.error("APNs: HTTP/2 session error:", err);
      finish({ deviceToken, status: 0, reason: "session-error" });
    });

    const topic = pushType === "voip" ? `${config.bundleId}.voip` : config.bundleId;
    const body = Buffer.from(JSON.stringify(payload));

    const req = session.request({
      [h2.HTTP2_HEADER_METHOD]: "POST",
      [h2.HTTP2_HEADER_PATH]: `/3/device/${deviceToken}`,
      authorization: `bearer ${getProviderToken(config)}`,
      "apns-topic": topic,
      "apns-push-type": pushType,
      // VoIP pushes must be delivered immediately, never queued.
      "apns-priority": pushType === "voip" ? "10" : "5",
      "apns-expiration": pushType === "voip" ? "0" : undefined,
      "content-type": "application/json",
    } as Record<string, string | undefined>);

    let status = 0;
    let responseBody = "";
    req.on("response", (headers) => {
      status = Number(headers[h2.HTTP2_HEADER_STATUS] ?? 0);
    });
    req.setEncoding("utf8");
    req.on("data", (chunk: string) => {
      responseBody += chunk;
    });
    req.on("end", () => {
      let reason: string | undefined;
      try {
        reason = responseBody ? (JSON.parse(responseBody).reason as string | undefined) : undefined;
      } catch {
        // Non-JSON or empty body - status code alone still tells the story.
      }
      session.close();
      finish({ deviceToken, status, reason });
    });
    req.on("error", (err) => {
      console.error("APNs: request error:", err);
      session.close();
      finish({ deviceToken, status: 0, reason: "request-error" });
    });

    req.write(body);
    req.end();
  });
}

/** Apple's own signal that the token is permanently dead, per token type. */
function isPermanentFailure(outcome: ApnsSendOutcome): boolean {
  if (outcome.status === 410) return true; // Unregistered
  if (outcome.status === 400 && outcome.reason === "BadDeviceToken") return true;
  return false;
}

/**
 * The iOS-alert analogue of sendFcmPush(userId, title, body, url):
 * exact same three-field payload contract (see fcm.ts / Android's
 * ZrpFirebaseMessagingService.onMessageReceived) so a notification tap
 * routes identically regardless of which transport delivered it.
 */
export async function sendApnsAlert(userId: string, title: string, body: string, url: string = "/"): Promise<void> {
  const config = getApnsConfig();
  if (!config) return;

  const tokens = await prisma.fcmToken.findMany({
    where: { userId, platform: "ios" },
    select: { token: true },
  });
  if (tokens.length === 0) return;

  const payload = {
    aps: { alert: { title, body }, sound: "default" },
    url,
  };

  const outcomes = await Promise.all(
    tokens.map((t) => postToApns(config, t.token, "alert", payload))
  );

  const staleTokens = outcomes.filter(isPermanentFailure).map((o) => o.deviceToken);
  if (staleTokens.length > 0) {
    await prisma.fcmToken.deleteMany({ where: { token: { in: staleTokens } } });
  }
}

export interface ApnsIncomingCall {
  callerId: string;
  callId: string;
  callerName: string;
  callerUsername: string;
  isVideo: boolean;
}

/**
 * PushKit VoIP push: structured, machine-actionable data only (no
 * human-readable alert - CallKit builds its own UI from this data via
 * CXProvider, it never shows a system notification banner). Carries
 * exactly what CallViewModel's existing handleIncomingCall(_:) already
 * parses from the "incoming-call" socket event, so the woken app can
 * report the call to CXProvider immediately without a network
 * round-trip first (a hard PushKit requirement - see
 * PKPushRegistryDelegate).
 */
export async function sendApnsVoip(userId: string, call: ApnsIncomingCall): Promise<void> {
  const config = getApnsConfig();
  if (!config) return;

  const tokens = await prisma.voipToken.findMany({
    where: { userId, platform: "ios" },
    select: { token: true },
  });
  if (tokens.length === 0) return;

  const payload = {
    aps: { "content-available": 1 },
    type: "incoming_call",
    callerId: call.callerId,
    callId: call.callId,
    callerName: call.callerName,
    callerUsername: call.callerUsername,
    isVideo: call.isVideo,
  };

  const outcomes = await Promise.all(
    tokens.map((t) => postToApns(config, t.token, "voip", payload))
  );

  const staleTokens = outcomes.filter(isPermanentFailure).map((o) => o.deviceToken);
  if (staleTokens.length > 0) {
    await prisma.voipToken.deleteMany({ where: { token: { in: staleTokens } } });
  }
}

/** Test-only: reset the module-level config/token cache between cases. */
export function __resetApnsCacheForTests(): void {
  cachedConfig = undefined;
  cachedToken = null;
}
