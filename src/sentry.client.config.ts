/**
 * Browser Sentry init. ZRP is a private social platform - nearly every
 * screen (DMs, group chat, profiles, admin, payments) shows content that
 * must never leave the browser through telemetry. See the P0 Sentry
 * privacy audit for the full before/after; the policy here is:
 *
 * - Session Replay only records on an unhandled error (never a blind
 *   sample of ordinary browsing), and even then every text node is
 *   masked and every image/video/canvas is blocked - a replay shows
 *   layout and interaction, never message text, post content, profile
 *   fields or media.
 * - No automatic user identification (no email/username/IP is ever
 *   attached - nothing in this codebase calls `Sentry.setUser`).
 * - `scrubSentryEvent`/`scrubSentryBreadcrumb` (src/lib/sentry-scrub.ts)
 *   strip cookies/headers/query strings and redact any email/token that
 *   ends up embedded in a thrown Error's message or a breadcrumb.
 */
import * as Sentry from "@sentry/nextjs";
import { replayIntegration } from "@sentry/nextjs";
import { scrubSentryBreadcrumb, scrubSentryEvent } from "@/lib/sentry-scrub";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment: process.env.NODE_ENV || "development",
  tracesSampleRate: 0.2,

  // No blind session sampling: 10% of every user's ordinary browsing
  // (including private DMs) being screen-recorded has real privacy cost
  // and little diagnostic value over error-triggered replay alone.
  replaysSessionSampleRate: 0,
  // Replay only the tail end of a session that actually errored, so
  // crashes stay debuggable without recording everyone all the time.
  replaysOnErrorSampleRate: 1.0,

  // Never auto-populate user.* (email/username/ip) from instrumentation.
  dataCollection: {
    userInfo: false,
  },

  integrations: [
    replayIntegration({
      // Mask every piece of on-screen text (message bodies, post
      // content, bios, emails in settings, admin data) and block every
      // image/video/canvas - the previous `false`/`false` here recorded
      // all of it in plain sight.
      maskAllText: true,
      maskAllInputs: true,
      blockAllMedia: true,
    }),
  ],

  beforeSend(event, hint) {
    return scrubSentryEvent(event, hint);
  },
  beforeBreadcrumb(breadcrumb) {
    return scrubSentryBreadcrumb(breadcrumb);
  },
});
