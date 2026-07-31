import webpush from "web-push";
import { prisma } from "./db";

const vapidPublicKey = process.env.VAPID_PUBLIC_KEY!;
const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY!;

webpush.setVapidDetails(
  "mailto:support@zrp.one",
  vapidPublicKey,
  vapidPrivateKey
);

export async function sendPushNotification(
  userId: string,
  title: string,
  body: string,
  url: string = "/"
) {
  try {
    const subscriptions = await prisma.pushSubscription.findMany({
      where: { userId },
    });

    const payload = JSON.stringify({ title, body, url });

    for (const sub of subscriptions) {
      const pushSubscription = {
        endpoint: sub.endpoint,
        keys: sub.keys as any,
      };

      await webpush.sendNotification(pushSubscription, payload).catch((err) => {
        // If subscription expired, delete it
        if (err.statusCode === 410) {
          prisma.pushSubscription.delete({ where: { endpoint: sub.endpoint } });
        }
      });
    }
  } catch (error) {
    console.error("Push notification error:", error);
  }
}
