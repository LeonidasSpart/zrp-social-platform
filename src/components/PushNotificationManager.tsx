"use client";

import { useEffect } from "react";
import { useSession } from "next-auth/react";

// A browser push subscription is bound to the VAPID public key it was
// created with. When that key is rotated, the server starts signing with
// the new one and the push service rejects every delivery to a
// subscription created under the old key (403, not the 404/410 that
// prunes a dead subscription) - so the row lingers and the user silently
// stops receiving anything.
//
// The browser will not quietly fix this either: pushManager.subscribe()
// rejects with InvalidStateError when a subscription already exists
// under a different applicationServerKey. Re-subscribing requires
// unsubscribing first, which is what the two helpers below detect and do.
function toBase64Url(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

// The configured value should already be base64url, but normalise both
// sides so a key pasted in standard base64 doesn't read as "changed" on
// every single load and cause an endless resubscribe loop.
function normalizeKey(value: string): string {
  return value.trim().replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export default function PushNotificationManager() {
  const { data: session } = useSession();

  useEffect(() => {
    if (!session?.user) return;

    async function registerPush() {
      if (!("Notification" in window) || !("serviceWorker" in navigator)) {
        console.log("Push notifications not supported");
        return;
      }

      try {
        const permission = await Notification.requestPermission();
        if (permission !== "granted") {
          console.log("Notification permission denied");
          return;
        }

        const registration = await navigator.serviceWorker.register("/sw.js");
        console.log("Service Worker registered");

        const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
        if (!publicKey) {
          console.error("VAPID public key not set");
          return;
        }

        // If a subscription already exists under a different VAPID key,
        // drop it first - otherwise subscribe() below throws and this
        // browser never receives another notification.
        let previousEndpoint: string | null = null;
        const existing = await registration.pushManager.getSubscription();
        if (existing) {
          const existingKey = existing.options?.applicationServerKey;
          // applicationServerKey is null on some older browsers; in that
          // case leave the working subscription alone and let the
          // InvalidStateError path below handle a rotation instead of
          // unsubscribing on a guess.
          const keyChanged =
            !!existingKey &&
            toBase64Url(existingKey) !== normalizeKey(publicKey);
          if (keyChanged) {
            console.log("VAPID key changed - resubscribing");
            previousEndpoint = existing.endpoint;
            await existing.unsubscribe();
          }
        }

        let subscription: PushSubscription;
        try {
          subscription = await registration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: publicKey,
          });
        } catch (err) {
          // Covers the browsers that don't expose applicationServerKey:
          // the rotation is only detectable by subscribe() refusing.
          const current = await registration.pushManager.getSubscription();
          if ((err as Error)?.name !== "InvalidStateError" || !current) throw err;
          console.log("VAPID key changed - resubscribing");
          previousEndpoint = current.endpoint;
          await current.unsubscribe();
          subscription = await registration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: publicKey,
          });
        }

        // No need to send userId: the server uses getServerSession.
        // previousEndpoint lets the server drop exactly the one stale row
        // this browser just replaced - it is never a blanket delete.
        await fetch("/api/push/subscribe", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ subscription, previousEndpoint }),
        });

        console.log("Push subscription saved");
      } catch (error) {
        console.error("Push registration error:", error);
      }
    }

    registerPush();
  }, [session]);

  return null;
}
