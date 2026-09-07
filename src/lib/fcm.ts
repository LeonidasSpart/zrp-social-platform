import { initializeApp, getApps, cert, type App } from "firebase-admin/app";
import { getMessaging } from "firebase-admin/messaging";
import { prisma } from "./db";

// Firebase Cloud Messaging for the native Android and iOS apps (FCM
// fans a message out to APNs itself for a token registered by an iOS
// client - see prisma/schema.prisma's FcmToken.platform and
// api/push/fcm's route) - separate from src/lib/push-notifications.ts's
// Web Push (VAPID) path, which only reaches browser tabs. Lazily
// initialized exactly like getWebPush()
// there, from the FIREBASE_SERVICE_ACCOUNT_JSON server secret
// (distinct from the client-side google-services.json the Android app
// ships with). Every call here is a safe no-op if that env var is ever
// unset or malformed - see fcm.test.ts - rather than throwing and
// taking down whatever caller triggered a push.
//
// Statically imported (like google-auth-library's OAuth2Client in
// api/mobile/auth/google) rather than required lazily inside the
// function - merely importing firebase-admin/app has no meaningful
// side effect (only initializeApp() does), and a static import is what
// lets fcm.test.ts mock these two modules at all: vi.mock only
// intercepts module resolution, not a plain runtime require() call.
let messagingApp: App | null = null;
let initAttempted = false;

function getFcmApp(): App | null {
  if (initAttempted) return messagingApp;
  initAttempted = true;

  const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON?.trim();
  if (!serviceAccountJson) return null;

  try {
    const serviceAccount = JSON.parse(serviceAccountJson);
    messagingApp = getApps().length
      ? getApps()[0]
      : initializeApp({ credential: cert(serviceAccount) });

    // Safe to log - project_id isn't sensitive on its own (it's
    // visible in google-services.json too), and nothing else here
    // touches the private key. This is the one signal that confirms
    // the credential parsed and the SDK initialized at all, without
    // waiting for an actual push send to find out.
    console.log("FCM: Firebase Admin SDK initialized", {
      projectId: serviceAccount?.project_id ?? "(missing)",
    });
  } catch (err) {
    console.error("Failed to initialize Firebase Admin SDK for FCM:", err);
    messagingApp = null;
  }
  return messagingApp;
}

export async function sendFcmPush(userId: string, title: string, body: string, url: string = "/") {
  const app = getFcmApp();
  if (!app) return;

  const tokens = await prisma.fcmToken.findMany({
    where: { userId },
    select: { token: true },
  });
  if (tokens.length === 0) return;

  try {
    const response = await getMessaging(app).sendEachForMulticast({
      tokens: tokens.map((t) => t.token),
      notification: { title, body },
      // `data` (unlike `notification`) always reaches the app itself,
      // foreground or not, on both Android and iOS - carrying the same
      // relative in-app path sendPushNotification already puts in Web
      // Push's payload (`{title,body,url}`) so a tap can navigate to the
      // right screen instead of just opening the app to wherever it was.
      // FCM delivers this identically regardless of whether the
      // registered token is Android or iOS; no platform branching needed
      // for this alone.
      data: { url },
    });

    const staleTokens: string[] = [];
    response.responses.forEach((result: { success: boolean; error?: { code?: string } }, i: number) => {
      if (!result.success && result.error?.code === "messaging/registration-token-not-registered") {
        staleTokens.push(tokens[i].token);
      }
    });
    if (staleTokens.length > 0) {
      await prisma.fcmToken.deleteMany({ where: { token: { in: staleTokens } } });
    }
  } catch (err) {
    console.error("FCM push delivery error:", err);
  }
}
