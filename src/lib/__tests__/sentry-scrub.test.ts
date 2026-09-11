import { describe, expect, it } from "vitest";
import { redactString, scrubSentryBreadcrumb, scrubSentryEvent } from "@/lib/sentry-scrub";
import type { Breadcrumb, ErrorEvent } from "@sentry/nextjs";

function makeEvent(overrides: Partial<ErrorEvent> = {}): ErrorEvent {
  return {
    type: undefined,
    ...overrides,
  } as ErrorEvent;
}

describe("redactString", () => {
  it("redacts embedded email addresses", () => {
    expect(redactString("failed to notify user duskvorn@gmail.com")).toBe(
      "failed to notify user [redacted-email]",
    );
  });

  it("redacts JWTs", () => {
    const jwt = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjMifQ.abc123XYZ";
    expect(redactString(`token=${jwt}`)).toBe("token=[redacted-jwt]");
  });

  it("redacts bearer tokens", () => {
    expect(redactString("Authorization: Bearer abc.def-123")).toBe(
      "Authorization: Bearer [redacted]",
    );
  });

  it("leaves ordinary text untouched", () => {
    expect(redactString("failed to publish post 42")).toBe("failed to publish post 42");
  });
});

describe("scrubSentryEvent", () => {
  it("keeps only an opaque user id, dropping email/username/ip", () => {
    const event = makeEvent({
      user: { id: "user_1", email: "duskvorn@gmail.com", username: "duskvorn", ip_address: "1.2.3.4" },
    });
    const scrubbed = scrubSentryEvent(event);
    expect(scrubbed.user).toEqual({ id: "user_1" });
  });

  it("drops the user entirely when there is no id", () => {
    const event = makeEvent({ user: { email: "duskvorn@gmail.com" } });
    expect(scrubSentryEvent(event).user).toBeUndefined();
  });

  it("strips request cookies and body, redacts headers/query string, drops the query from the url", () => {
    const event = makeEvent({
      request: {
        url: "https://zrp.app/api/messages?conversationId=42&search=secret+plan",
        cookies: { "next-auth.session-token": "abc123" },
        data: { content: "private DM text" },
        query_string: "conversationId=42&search=secret+plan",
        headers: {
          authorization: "Bearer super-secret",
          cookie: "next-auth.session-token=abc123",
          "user-agent": "Mozilla/5.0",
        },
      },
    });

    const scrubbed = scrubSentryEvent(event);

    expect(scrubbed.request?.cookies).toBeUndefined();
    expect(scrubbed.request?.data).toBeUndefined();
    expect(scrubbed.request?.query_string).toBe("[redacted]");
    expect(scrubbed.request?.url).toBe("https://zrp.app/api/messages");
    expect(scrubbed.request?.headers?.authorization).toBe("[redacted]");
    expect(scrubbed.request?.headers?.cookie).toBe("[redacted]");
    expect(scrubbed.request?.headers?.["user-agent"]).toBe("Mozilla/5.0");
  });

  it("redacts secrets embedded in exception messages", () => {
    const event = makeEvent({
      exception: {
        values: [{ type: "Error", value: "login failed for duskvorn@gmail.com" }],
      },
    });
    expect(scrubSentryEvent(event).exception?.values?.[0]?.value).toBe(
      "login failed for [redacted-email]",
    );
  });

  it("redacts sensitive keys and embedded secrets in extra data", () => {
    const event = makeEvent({
      extra: {
        sessionToken: "abc123",
        note: "sent to duskvorn@gmail.com",
        postId: 42,
      },
    });
    const scrubbed = scrubSentryEvent(event);
    expect(scrubbed.extra?.sessionToken).toBe("[redacted]");
    expect(scrubbed.extra?.note).toBe("sent to [redacted-email]");
    expect(scrubbed.extra?.postId).toBe(42);
  });
});

describe("scrubSentryBreadcrumb", () => {
  it("drops console breadcrumb payloads entirely", () => {
    const breadcrumb: Breadcrumb = {
      category: "console",
      message: "user row: duskvorn@gmail.com",
      data: { user: { email: "duskvorn@gmail.com" } },
    };
    const scrubbed = scrubSentryBreadcrumb(breadcrumb);
    expect(scrubbed?.message).toBeUndefined();
    expect(scrubbed?.data).toBeUndefined();
    expect(scrubbed?.category).toBe("console");
  });

  it("redacts secrets in non-console breadcrumb message and data", () => {
    const breadcrumb: Breadcrumb = {
      category: "xhr",
      message: "request to duskvorn@gmail.com failed",
      data: { authorization: "Bearer abc", method: "POST" },
    };
    const scrubbed = scrubSentryBreadcrumb(breadcrumb);
    expect(scrubbed?.message).toBe("request to [redacted-email] failed");
    expect(scrubbed?.data?.authorization).toBe("[redacted]");
    expect(scrubbed?.data?.method).toBe("POST");
  });
});
