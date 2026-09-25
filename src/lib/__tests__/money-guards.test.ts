import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";

const { findFirst, update, checkRateLimitKey } = vi.hoisted(() => ({
  findFirst: vi.fn(),
  update: vi.fn(),
  checkRateLimitKey: vi.fn(),
}));
vi.mock("@/lib/db", () => ({ prisma: { apiKey: { findFirst, update } } }));
vi.mock("@/lib/rate-limit", () => ({ checkRateLimitKey }));

import { parseAdTargetUrl } from "../ads/target-url";
import { isAuthorizedCronRequest } from "../cron-auth";
import { validateApiKey } from "../api-auth";

describe("parseAdTargetUrl", () => {
  it("accepts absolute http(s) URLs", () => {
    expect(parseAdTargetUrl("https://example.com/landing?x=1")).toBe("https://example.com/landing?x=1");
    expect(parseAdTargetUrl("  http://example.com  ")).toBe("http://example.com/");
  });

  it("rejects script-bearing and non-web schemes, relative and malformed values", () => {
    for (const bad of [
      "javascript:alert(1)",
      "JAVASCRIPT:alert(1)",
      " javascript:alert(1)",
      "data:text/html,<script>alert(1)</script>",
      "vbscript:msgbox(1)",
      "/post/123",
      "example.com",
      "",
      null,
      undefined,
      42,
      `https://example.com/${"a".repeat(3000)}`,
    ]) {
      expect(parseAdTargetUrl(bad)).toBeNull();
    }
  });
});

describe("isAuthorizedCronRequest", () => {
  const original = process.env.CRON_SECRET;
  afterEach(() => {
    process.env.CRON_SECRET = original;
  });

  it("accepts only the exact bearer secret", () => {
    process.env.CRON_SECRET = "s3cret";
    expect(isAuthorizedCronRequest("Bearer s3cret")).toBe(true);
    expect(isAuthorizedCronRequest("Bearer s3cre")).toBe(false);
    expect(isAuthorizedCronRequest("Bearer s3cret ")).toBe(false);
    expect(isAuthorizedCronRequest("s3cret")).toBe(false);
    expect(isAuthorizedCronRequest(null)).toBe(false);
  });

  it("fails closed when CRON_SECRET is unset", () => {
    delete process.env.CRON_SECRET;
    expect(isAuthorizedCronRequest("Bearer undefined")).toBe(false);
    expect(isAuthorizedCronRequest("Bearer ")).toBe(false);
  });
});

describe("validateApiKey plan enforcement", () => {
  function apiReq() {
    return new NextRequest("https://zrp.one/api/external/me", {
      headers: { authorization: "Bearer zrp_testkey" },
    });
  }

  function keyFor(plan: string, banned = false) {
    return {
      id: "key1",
      user: { id: "u1", username: "u", name: "U", email: "u@example.com", plan, avatarUrl: null, banned },
    };
  }

  beforeEach(() => {
    findFirst.mockReset();
    update.mockReset();
    checkRateLimitKey.mockReset();
    checkRateLimitKey.mockResolvedValue({ success: true });
    update.mockResolvedValue({});
  });

  it("rejects a key whose owner no longer has an API-access plan (downgraded/expired)", async () => {
    findFirst.mockResolvedValue(keyFor("free"));
    const result = await validateApiKey(apiReq());
    expect(result.error).toBeDefined();
    expect(result.status).toBe(403);
    expect(update).not.toHaveBeenCalled();
  });

  it("accepts a key whose owner is on an API-access plan", async () => {
    findFirst.mockResolvedValue(keyFor("business"));
    const result = await validateApiKey(apiReq());
    expect(result.error).toBeUndefined();
    expect(result.user?.id).toBe("u1");
  });

  it("still rejects a banned owner's key", async () => {
    findFirst.mockResolvedValue(keyFor("enterprise", true));
    const result = await validateApiKey(apiReq());
    expect(result.status).toBe(401);
  });
});
