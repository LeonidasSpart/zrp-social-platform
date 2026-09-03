"use client";

// Helpers for running the existing NextAuth flows correctly inside the
// Capacitor native shell. Regular browser users never call any of this -
// every export here is guarded by isNativeApp() and is a no-op on the web.
//
// Why this exists: Google's OAuth policy actively blocks sign-in
// attempts from embedded WebViews (the app's main Capacitor WebView
// counts as one), returning "This browser or app may not be secure".
// The fix is to open the Google auth URL in the system browser
// (SFSafariViewController on iOS / Chrome Custom Tabs on Android)
// instead of navigating the embedded WebView to it.
//
// next-auth's own signIn("google", ...) does this sequence internally
// (see node_modules/next-auth/react/index.js): fetch a CSRF token,
// POST it to /api/auth/signin/google to get back the real Google
// authorization URL, then window.location.href = that URL. It has no
// option to hand that final navigation to a system browser instead, so
// this replicates the same CSRF+POST request and swaps only the final
// navigation step.
import { Capacitor } from "@capacitor/core";
import { Browser } from "@capacitor/browser";

export function isNativeApp(): boolean {
  return typeof window !== "undefined" && Capacitor.isNativePlatform();
}

export async function nativeGoogleSignIn(callbackUrl: string = "/"): Promise<void> {
  const csrfRes = await fetch("/api/auth/csrf");
  if (!csrfRes.ok) {
    throw new Error("Could not reach the sign-in service");
  }
  const { csrfToken } = await csrfRes.json();

  const res = await fetch("/api/auth/signin/google", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ csrfToken, callbackUrl, json: "true" }),
  });
  const data = await res.json();
  if (!data?.url) {
    throw new Error("Could not start Google sign-in");
  }

  await Browser.open({ url: data.url });
}

// Same reasoning and same request sequence as nativeGoogleSignIn above -
// Apple is a second OAuth provider (see lib/auth.ts), not a different
// auth architecture, so it reuses this exact mechanism rather than a new
// one. If Apple sign-in isn't configured server-side (see
// apple-client-secret.ts), /api/auth/signin/apple simply doesn't exist as
// a registered provider and this throws instead of silently succeeding.
export async function nativeAppleSignIn(callbackUrl: string = "/"): Promise<void> {
  const csrfRes = await fetch("/api/auth/csrf");
  if (!csrfRes.ok) {
    throw new Error("Could not reach the sign-in service");
  }
  const { csrfToken } = await csrfRes.json();

  const res = await fetch("/api/auth/signin/apple", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ csrfToken, callbackUrl, json: "true" }),
  });
  const data = await res.json();
  if (!data?.url) {
    throw new Error("Could not start Apple sign-in");
  }

  await Browser.open({ url: data.url });
}
