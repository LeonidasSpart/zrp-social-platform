import { prisma } from "./db";

// Firebase Cloud Messaging for the native Android app - separate from
// src/lib/push-notifications.ts's Web Push (VAPID) path, which only
// reaches browser tabs. Lazily initialized exactly like getWebPush()
// there: sending real pushes needs a Firebase service-account
// credential, which is a server secret distinct from the client-side
// google-services.json the Android app ships with, and isn't
// configured yet. Every call here is a safe no-op until
// FIREBASE_SERVICE_ACCOUNT_JSON is set, so this activates the moment
// that secret is added - no further code changes needed.
let messagingApp: import("firebase-admin/app").App | null = null;
let initAttempted = false;

function getFcmApp(): import("firebase-admin/app").App | null {
  if (initAttempted) return messagingApp;
  initAttempted = true;

  const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON?.trim();
  if (!serviceAccountJson) return null;

  try {
    const { initializeApp, getApps, cert } = require("firebase-admin/app");
    const serviceAccount = JSON.parse(serviceAccountJson);
    messagingApp = getApps().length
      ? getApps()[0]
      : initializeApp({ credential: cert(serviceAccount) });
  } catch (err) {
    console.error("Failed to initialize Firebase Admin SDK for FCM:", err);
    messagingApp = null;
  }
  return messagingApp;
}

export async function sendFcmPush(userId: string, title: string, body: string) {
  const app = getFcmApp();
  if (!app) return;

  const tokens = await prisma.fcmToken.findMany({
    where: { userId },
    select: { token: true },
  });
  if (tokens.length === 0) return;

  try {
    const { getMessaging } = require("firebase-admin/messaging");
    const response = await getMessaging(app).sendEachForMulticast({
      tokens: tokens.map((t) => t.token),
      notification: { title, body },
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
