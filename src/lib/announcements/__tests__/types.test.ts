import { describe, it, expect } from "vitest";
import { validateAnnouncementContent, validateActionUrl, truncateForPush, PUSH_BODY_MAX_LENGTH } from "../types";

describe("validateActionUrl", () => {
  it("accepts a null/empty value as no action URL", () => {
    expect(validateActionUrl(undefined)).toEqual({ ok: true, url: null });
    expect(validateActionUrl(null)).toEqual({ ok: true, url: null });
    expect(validateActionUrl("")).toEqual({ ok: true, url: null });
  });

  it("accepts an internal path", () => {
    expect(validateActionUrl("/settings")).toEqual({ ok: true, url: "/settings" });
    expect(validateActionUrl("/launchpad/create")).toEqual({ ok: true, url: "/launchpad/create" });
  });

  it("rejects a protocol-relative path (open-redirect-shaped internal-looking URL)", () => {
    const result = validateActionUrl("//evil.example.com/phish");
    expect(result.ok).toBe(false);
  });

  it("rejects a path containing control characters", () => {
    const result = validateActionUrl("/settings\r\nX-Injected: 1");
    expect(result.ok).toBe(false);
  });

  it("accepts a well-formed external https URL", () => {
    const result = validateActionUrl("https://blog.zrp.one/release-notes");
    expect(result).toEqual({ ok: true, url: "https://blog.zrp.one/release-notes" });
  });

  it("rejects a non-https external URL", () => {
    expect(validateActionUrl("http://example.com").ok).toBe(false);
  });

  it("rejects a javascript: URL", () => {
    expect(validateActionUrl("javascript:alert(1)").ok).toBe(false);
  });

  it("rejects a URL with embedded credentials", () => {
    expect(validateActionUrl("https://user:pass@example.com").ok).toBe(false);
  });

  it("rejects a non-string value", () => {
    expect(validateActionUrl(12345 as unknown).ok).toBe(false);
  });
});

describe("validateAnnouncementContent", () => {
  it("rejects a missing title", () => {
    const result = validateAnnouncementContent({ title: "", body: "hello" });
    expect(result.ok).toBe(false);
  });

  it("rejects a missing body", () => {
    const result = validateAnnouncementContent({ title: "Hi", body: "" });
    expect(result.ok).toBe(false);
  });

  it("rejects an overlong title", () => {
    const result = validateAnnouncementContent({ title: "x".repeat(200), body: "hello" });
    expect(result.ok).toBe(false);
  });

  it("rejects an invalid type", () => {
    const result = validateAnnouncementContent({ title: "Hi", body: "hello", type: "SOMETHING_ELSE" });
    expect(result.ok).toBe(false);
  });

  it("defaults type to ANNOUNCEMENT when omitted", () => {
    const result = validateAnnouncementContent({ title: "Hi", body: "hello" });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.type).toBe("ANNOUNCEMENT");
  });

  it("rejects a scheduledAt in the past", () => {
    const result = validateAnnouncementContent({ title: "Hi", body: "hello", scheduledAt: new Date(Date.now() - 1000).toISOString() });
    expect(result.ok).toBe(false);
  });

  it("accepts a scheduledAt in the future", () => {
    const future = new Date(Date.now() + 3600_000).toISOString();
    const result = validateAnnouncementContent({ title: "Hi", body: "hello", scheduledAt: future });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.scheduledAt?.toISOString()).toBe(future);
  });

  it("rejects a bad action URL as part of full content validation", () => {
    const result = validateAnnouncementContent({ title: "Hi", body: "hello", actionUrl: "javascript:alert(1)" });
    expect(result.ok).toBe(false);
  });

  it("accepts a fully valid payload", () => {
    const result = validateAnnouncementContent({
      title: "New feature",
      body: "Check out the new broadcast system.",
      type: "NEW_FEATURE",
      actionUrl: "/settings",
      imageUrl: "https://uploadthing.example/abc.png",
    });
    expect(result.ok).toBe(true);
  });
});

describe("truncateForPush", () => {
  it("leaves a short body untouched", () => {
    expect(truncateForPush("short")).toBe("short");
  });

  it("truncates a long body with an ellipsis, staying within the max length", () => {
    const long = "x".repeat(PUSH_BODY_MAX_LENGTH + 50);
    const result = truncateForPush(long);
    expect(result.length).toBeLessThanOrEqual(PUSH_BODY_MAX_LENGTH);
    expect(result.endsWith("…")).toBe(true);
  });
});
