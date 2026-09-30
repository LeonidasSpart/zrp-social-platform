"use client";

import { useEffect } from "react";

export default function ServiceWorkerRegistration() {
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker
        .register("/sw.js")
        .then((reg) => {
          console.log("✅ Service Worker registered:", reg);
        })
        .catch((err) => {
          console.error("❌ Service Worker registration failed:", err);
        });

      // sw.js calls self.skipWaiting() + clients.claim() on activate, so a
      // new SW takes over immediately after a deploy - including in a tab
      // that's already open and running the previous deploy's _next/static
      // chunk hashes. Without this listener, that tab has no signal the
      // controller changed and can hit a chunk-load error on its next
      // client-side navigation, with no way to recover but a manual
      // refresh. Reload once (guarded, since the browser can fire this
      // event more than once) to pick up the new deployment cleanly.
      let reloaded = false;
      navigator.serviceWorker.addEventListener("controllerchange", () => {
        if (reloaded) return;
        reloaded = true;
        window.location.reload();
      });
    }
  }, []);

  return null;
}
