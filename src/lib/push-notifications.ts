import webpush from "web-push";
import { prisma } from "./db";
// Initialize Web Push lazily.
// Do not initialize VAPID at module/build time.
function getWebPush() {
  const vapidPublicKey = process.env.VAPID_PUBLIC_KEY?.trim();
  const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY?.trim();
  if (!vapidPublicKey || !vapidPrivateKey) {
    throw new Error(
      "VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY are not configured"
    );
  }
  // Safe diagnostics. Never log the actual VAPID keys.
  console.log("VAPID diagnostics:", {
    publicLength: vapidPublicKey.length,
    privateLength: vapidPrivateKey.length,
    publicDecodedBytes: Buffer.from(vapidPublicKey, "base64url").length,
    privateDecodedBytes: Buffer.from(vapidPrivateKey, "base64url").length,
  });
  webpush.setVapidDetails(
    "mailto:support@zrp.one",
    vapidPublicKey,
    vapidPrivateKey
  );
  return webpush;
}
export async function sendPushNotification(
  userId: string,
  title: string,
  body: string,
  url: string = "/"
) {
  try {
    const push = getWebPush();
    const subscriptions = await prisma.pushSubscription.findMany({
      where: { userId },
    });
    if (subscriptions.length === 0) {
      return;
    }
    const payload = JSON.stringify({
      title,
      body,
      url,
    });
    for (const sub of subscriptions) {
      try {
        await push.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: sub.keys as any,
          },
          payload
        );
      } catch (err: any) {
        if (err?.statusCode === 404 || err?.statusCode === 410) {
          try {
            await prisma.pushSubscription.delete({
              where: {
                endpoint: sub.endpoint,
              },
            });
          } catch (deleteError) {
            console.error(
              "Failed to delete expired push subscription:",
              deleteError
            );
          }
        } else {
          console.error(
            "Push notification delivery error:",
            err
          );
        }
      }
    }
  } catch (error) {
    console.error("Push notification error:", error);
  }
}
