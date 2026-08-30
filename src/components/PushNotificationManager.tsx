"use client";

import { useEffect } from "react";
import { useSession } from "next-auth/react";

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

        const subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: publicKey,
        });

        // No need to send userId: the server uses getServerSession
        await fetch("/api/push/subscribe", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ subscription }),
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
