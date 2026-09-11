/**
 * Edge-runtime Sentry init (middleware). Same policy as
 * src/sentry.server.config.ts - kept in its own file only because
 * Next.js requires a separate edge entry point, not because the policy
 * differs. `src/middleware.ts` runs on nearly every request (auth,
 * ban/onboarding redirects, plan gating) so this is the runtime most
 * likely to see a session cookie or JWT in scope when something throws.
 */
import * as Sentry from "@sentry/nextjs";
import { scrubSentryBreadcrumb, scrubSentryEvent } from "@/lib/sentry-scrub";

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.NODE_ENV || "development",
  tracesSampleRate: 0.2,

  dataCollection: {
    userInfo: false,
    cookies: false,
    httpHeaders: {
      request: { allow: ["content-type", "accept-language", "user-agent"] },
      response: { allow: ["content-type"] },
    },
    httpBodies: [],
    urlQueryParams: false,
    databaseQueryData: false,
    stackFrameVariables: false,
    genAI: { inputs: false, outputs: false },
  },

  beforeSend(event, hint) {
    return scrubSentryEvent(event, hint);
  },
  beforeBreadcrumb(breadcrumb) {
    return scrubSentryBreadcrumb(breadcrumb);
  },
});
