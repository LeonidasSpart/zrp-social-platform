"use client";

import { useEffect } from "react";
import { Capacitor } from "@capacitor/core";
import { Browser } from "@capacitor/browser";
import { App } from "@capacitor/app";

// Mounted once at the root layout, exactly like GoogleAnalytics/CookieConsent.
// Every effect below bails out immediately on the web - this is a complete
// no-op for the 300k+ existing browser users, and only does anything when
// actually running inside the Capacitor native shell.
export default function NativeAppBridge() {
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    // ─── Open external links in the system browser, not the app's
    // embedded WebView ───────────────────────────────────────────────
    // The web app has many <a target="_blank"> links across post/link
    // previews, ads, footer, admin panels, etc. Left alone, an embedded
    // WebView either fails to open these or hijacks the whole app into
    // showing a third-party site inside "ZRP" - a bad and confusing
    // experience. This intercepts anchor clicks once, app-wide, instead
    // of touching every component that renders an external link.
    const handleClick = (e: MouseEvent) => {
      const anchor = (e.target as HTMLElement | null)?.closest("a[href]") as HTMLAnchorElement | null;
      if (!anchor) return;

      let url: URL;
      try {
        url = new URL(anchor.href, window.location.href);
      } catch {
        return;
      }

      // Same-origin navigation (the actual ZRP app) stays in the WebView.
      if (url.origin === window.location.origin) return;
      // mailto:, tel:, sms:, etc. - let the OS handle these natively.
      if (url.protocol !== "http:" && url.protocol !== "https:") return;

      e.preventDefault();
      Browser.open({ url: anchor.href });
    };
    document.addEventListener("click", handleClick, true);

    // ─── Reload after returning from the system browser ─────────────
    // Best-effort: if the user just completed Google sign-in (or any
    // other external flow) in the system browser, this picks up the
    // resulting session as soon as they're back, instead of leaving
    // the WebView showing stale logged-out state until the next manual
    // navigation. See nativeAuth.ts for the sign-in flow itself.
    const browserFinishedHandle = Browser.addListener("browserFinished", () => {
      window.location.reload();
    });

    // ─── Deep links ───────────────────────────────────────────────────
    // Listens for the OS handing the app a URL (custom scheme or, once
    // Universal/App Links are verified - see release report - a real
    // https://zrp.one link). Navigates the existing WebView there
    // instead of doing nothing. Private routes stay protected by the
    // same middleware that already guards them on the web.
    const appUrlOpenHandle = App.addListener("appUrlOpen", (data) => {
      try {
        const url = new URL(data.url);
        if (url.origin === window.location.origin) {
          window.location.href = url.pathname + url.search + url.hash;
        }
      } catch {
        // Not a URL we recognize - ignore rather than navigate somewhere unexpected.
      }
    });

    return () => {
      document.removeEventListener("click", handleClick, true);
      browserFinishedHandle.then((h) => h.remove());
      appUrlOpenHandle.then((h) => h.remove());
    };
  }, []);

  return null;
}
