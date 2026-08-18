import webpush from "web-push";
import { prisma } from "./db";

// ─── Initialize Web Push lazily ──────────────────────────────────
// IMPORTANT:
// Do not call webpush.setVapidDetails() at module/build time.
// Next.js may evaluate this module during `next build`, when
// VAPID environment variables may not be available yet.
//
// VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY are required only when
// an actual push notification is sent.

function getWebPush() {
  const vapidPublicKey = process.env.VAPID_PUBLIC_KEY;
  const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY;

  if (!vapidPublicKey || !vapidPrivateKey) {
    throw new Error(
      "VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY are not configured"
    );
  }

  webpush.setVapidDetails(
    "mailto:support@zrp.one",
    vapidPublicKey,
    vapidPrivateKey
  );

  return webpush;
}

// ─── Send Push Notification ──────────────────────────────────────

export async function sendPushNotification(
  userId: string,
  title: string,
  body: string,
  url: string = "/"
) {
  try {
    // Initialize Web Push ONLY when actually sending.
    // This prevents Next.js build-time failures.
    const push = getWebPush();

    const subscriptions =
      await prisma.pushSubscription.findMany({
        where: {
          userId,
        },
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
      const pushSubscription = {
        endpoint: sub.endpoint,
        keys: sub.keys as any,
      };

      try {
        await push
          .sendNotification(
            pushSubscription,
            payload
          )
          .catch(async (err) => {
            // If the subscription has expired or is no
            // longer valid, remove it from the database.
            if (err.statusCode === 410) {
              await prisma.pushSubscription.delete({
                where: {
                  endpoint: sub.endpoint,
                },
              });
            } else {
              console.error(
                "Push notification delivery error:",
                err
              );
            }
          });
      } catch (err) {
        console.error(
          "Push notification send error:",
          err
        );
      }
    }
  } catch (error) {
    // Push notification failure must never prevent the
    // main action (message, like, follow, etc.) from succeeding.
    console.error(
      "Push notification error:",
      error
    );
  }
}
