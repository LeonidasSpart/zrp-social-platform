/**
 * Node-runtime Sentry init. See src/sentry.client.config.ts for the
 * overall privacy policy; the server-side risk is different in kind -
 * there's no Replay here, but an unhandled exception in any of the
 * ~220 API routes can occur with a full Prisma row (password hash,
 * email, message body, payment details) sitting in a local variable in
 * scope, and the SDK's OpenTelemetry-based instrumentation is capable of
 * serializing request bodies, cookies and stack-frame local variables
 * into the event it sends. `dataCollection` below turns all of that off
 * explicitly rather than relying on the SDK's implicit default (which
 * only becomes this safe when `sendDefaultPii` is left `false` - pinning
 * it here means a later, unrelated change to that flag can't silently
 * widen what leaves the server).
 */
import * as Sentry from "@sentry/nextjs";
import { scrubSentryBreadcrumb, scrubSentryEvent } from "@/lib/sentry-scrub";

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.NODE_ENV || "development",
  tracesSampleRate: 0.2,

  dataCollection: {
    // Never auto-attach req.user (email/username/ip).
    userInfo: false,
    // No request/response cookies.
    cookies: false,
    // Only structurally-necessary, non-identifying request/response
    // headers - everything else (including anything an operator adds
    // later) is excluded by default instead of relying on a denylist.
    httpHeaders: {
      request: { allow: ["content-type", "accept-language", "user-agent"] },
      response: { allow: ["content-type"] },
    },
    // No request/response bodies - these are DM text, post content,
    // login credentials, payment payloads.
    httpBodies: [],
    // No query string values (password-reset/invite tokens, search terms).
    urlQueryParams: false,
    // No literal SQL/Prisma bind values.
    databaseQueryData: false,
    // The big one: never serialize local variables from stack frames.
    // Without this, a crash inside e.g. an auth or payment handler can
    // ship the full in-scope User/Message/WithdrawalRequest row to
    // Sentry regardless of every other setting above.
    stackFrameVariables: false,
    // No AI chat prompt/response capture if a genAI integration is ever added.
    genAI: { inputs: false, outputs: false },
  },

  beforeSend(event, hint) {
    return scrubSentryEvent(event, hint);
  },
  beforeBreadcrumb(breadcrumb) {
    return scrubSentryBreadcrumb(breadcrumb);
  },
});
