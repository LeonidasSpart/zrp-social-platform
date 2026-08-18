import webpush from "web-push";
import { prisma } from "./db";

// ─── Initialize Web Push lazily ──────────────────────────────────
// IMPORTANT:
// Do NOT initialize VAPID at module/build time.
//
// Next.js can evaluate imported server modules during `next build`.
// Railway may not provide VAPID environment variables during build.
//
// We therefore initialize Web Push only when a notification is
// actually being sent at runtime.

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
    // Initialize Web Push ONLY when the function is actually called.
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
        await push.sendNotification(
          pushSubscription,
          payload
        );
      } catch (err: any) {
        // Subscription expired or is no longer valid.
        if (err?.statusCode === 410) {
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
    // Push notification failure must NEVER prevent the
    // main action (message, like, follow, etc.) from succeeding.
    console.error(
      "Push notification error:",
      error
    );
  }
}
