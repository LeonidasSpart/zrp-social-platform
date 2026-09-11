/**
 * Shared Sentry `beforeSend`/`beforeBreadcrumb` scrubbing, used by every
 * runtime's Sentry init (client/server/edge) so the policy can't drift
 * between them.
 *
 * This is defense-in-depth on top of the SDK's own `dataCollection`
 * settings configured at `Sentry.init()` in each `sentry.*.config.ts`
 * (which already turn off request bodies, DB query values and stack
 * frame variables). It exists because ~220 API routes each throw their
 * own `Error` objects, and nothing stops a future one from putting a
 * user's email, a session token or a message body straight into an
 * error message or a `console.error` payload that becomes a breadcrumb -
 * this is the safety net for that case, not the primary control.
 */
import type { Breadcrumb, ErrorEvent, EventHint } from "@sentry/nextjs";

type ScrubbableEvent = ErrorEvent;

const REDACTED = "[redacted]";

// Key names that should never leave the app with their value intact,
// wherever they show up (headers, extra/context data, breadcrumb data).
const SENSITIVE_KEY_PATTERN =
  /pass(word)?|passwd|pwd|secret|token|auth|cookie|session|jwt|bearer|credential|api[-_]?key|private[-_]?key|dsn|wallet|ssn/i;

const EMAIL_PATTERN = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
const JWT_PATTERN = /eyJ[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]*/g;
const BEARER_PATTERN = /Bearer\s+[A-Za-z0-9\-._~+/]+=*/gi;

/** Redacts embedded emails/JWTs/bearer tokens inside a free-text string. */
export function redactString(value: string): string {
  return value
    .replace(JWT_PATTERN, "[redacted-jwt]")
    .replace(BEARER_PATTERN, "Bearer [redacted]")
    .replace(EMAIL_PATTERN, "[redacted-email]");
}

function scrubKeyValueObject<T extends Record<string, unknown>>(obj: T | undefined | null): T | undefined {
  if (!obj || typeof obj !== "object") return undefined;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (SENSITIVE_KEY_PATTERN.test(key)) {
      out[key] = REDACTED;
    } else if (typeof value === "string") {
      out[key] = redactString(value);
    } else {
      out[key] = value;
    }
  }
  return out as T;
}

/**
 * `beforeSend`/`beforeSendTransaction` for every Sentry runtime. Strips
 * request cookies/headers/body/query string, keeps only an opaque user
 * id (never email/username/ip), and redacts embedded secrets in
 * exception messages.
 */
export function scrubSentryEvent<E extends ScrubbableEvent>(event: E, _hint?: EventHint): E {
  if (event.user) {
    event.user = event.user.id ? { id: event.user.id } : undefined;
  }

  if (event.request) {
    delete event.request.cookies;
    delete event.request.data;
    event.request.headers = scrubKeyValueObject(event.request.headers);
    if (event.request.query_string) {
      event.request.query_string = REDACTED;
    }
    if (typeof event.request.url === "string") {
      event.request.url = event.request.url.split("?")[0];
    }
  }

  if (event.extra) {
    event.extra = scrubKeyValueObject(event.extra);
  }

  if (event.contexts) {
    for (const [key, value] of Object.entries(event.contexts)) {
      if (value && typeof value === "object") {
        event.contexts[key] = scrubKeyValueObject(value as Record<string, unknown>);
      }
    }
  }

  if (event.message) {
    event.message = redactString(event.message);
  }

  if (event.exception?.values) {
    for (const exceptionValue of event.exception.values) {
      if (exceptionValue.value) {
        exceptionValue.value = redactString(exceptionValue.value);
      }
    }
  }

  return event;
}

/**
 * `beforeBreadcrumb` for every Sentry runtime. Console breadcrumbs can
 * echo whatever a developer happened to log (full DB rows, request
 * bodies) so their payload is dropped outright; every other breadcrumb
 * gets the same string/key redaction as events.
 */
export function scrubSentryBreadcrumb(breadcrumb: Breadcrumb): Breadcrumb | null {
  if (breadcrumb.category === "console") {
    return { ...breadcrumb, message: undefined, data: undefined };
  }

  if (breadcrumb.message) {
    breadcrumb.message = redactString(breadcrumb.message);
  }
  if (breadcrumb.data) {
    breadcrumb.data = scrubKeyValueObject(breadcrumb.data as Record<string, unknown>);
  }

  return breadcrumb;
}
