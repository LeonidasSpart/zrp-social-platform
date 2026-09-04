"use client";

import { useState, useEffect } from "react";

// NextAuth's own /api/auth/providers endpoint always reflects exactly
// which providers are actually registered - src/lib/auth.ts only adds
// AppleProvider to the providers array when APPLE_TEAM_ID/APPLE_KEY_ID/
// APPLE_CLIENT_ID/APPLE_PRIVATE_KEY are all present and the client
// secret signs successfully. Reusing this instead of a second,
// separately-maintained "is Apple enabled" flag means the button can
// never drift out of sync with the actual server-side configuration:
// on a deployment without Apple credentials configured yet, the button
// simply doesn't render, rather than being clickable and failing only
// after the tap.
export function useAppleSignInEnabled(): boolean {
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/auth/providers")
      .then((res) => (res.ok ? res.json() : null))
      .then((providers: Record<string, unknown> | null) => {
        if (!cancelled && providers && "apple" in providers) {
          setEnabled(true);
        }
      })
      .catch(() => {
        // Leave disabled - failing safe (button hidden) beats a
        // clickable button that can't actually complete sign-in.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return enabled;
}
