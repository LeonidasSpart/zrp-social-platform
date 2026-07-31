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

      // Request permission
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        console.log("Notification permission denied");
        return;
      }

      // Register service worker
      const registration = await navigator.serviceWorker.register("/sw.js");
      console.log("Service Worker registered");

      // Subscribe to push
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
      });

      // Send subscription to server
      await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subscription,
          userId: session.user.id,
        }),
      });
    }

    registerPush();
  }, [session]);

  return null;
}
