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
  // Safe diagnostics: never log the actual VAPID keys.
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
        // 404/410 means the push subscription is no longer valid.
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

What changed

* Trims accidental whitespace from Railway variables.
* Adds safe VAPID diagnostics without exposing either key.
* Treats both 404 and 410 push subscriptions as expired.
* Keeps your existing VAPID key pair; it does not generate new keys.
* Keeps the rest of your notification logic unchanged.

After deploying, trigger one push notification and check Railway logs for:

VAPID diagnostics: {
  publicLength: ...,
  privateLength: ...,
  publicDecodedBytes: ...,
  privateDecodedBytes: ...
}

Send me those four values only. Do not send the VAPID keys themselves.
