import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { getClientIpFromHeaders, getRequestIp } from "../rate-limit";

// Security regression coverage for X-Forwarded-For trust. The production
// host (Railway) appends the real connecting address to X-Forwarded-For
// at its edge proxy, so the rightmost entry (for one trusted hop) is
// the only one a client can't forge. The previous implementation took
// the LEFTMOST entry - whatever the client itself sent - which let any
// caller rotate a fake header value to escape every rate limit.

function req(headers: Record<string, string>) {
  return new NextRequest("https://zrp.one/api/anything", { headers });
}

describe("getClientIpFromHeaders / getRequestIp (trusted-proxy semantics)", () => {
  const original = process.env.TRUSTED_PROXY_HOPS;
  beforeEach(() => {
    delete process.env.TRUSTED_PROXY_HOPS;
  });
  afterEach(() => {
    if (original === undefined) delete process.env.TRUSTED_PROXY_HOPS;
    else process.env.TRUSTED_PROXY_HOPS = original;
  });

  it("uses the rightmost X-Forwarded-For entry, ignoring a client-supplied prefix", () => {
    // Client sent "X-Forwarded-For: 9.9.9.9"; the edge proxy appended the
    // real address it saw the connection from.
    expect(getRequestIp(req({ "x-forwarded-for": "9.9.9.9, 203.0.113.7" }))).toBe("203.0.113.7");
  });

  it("does not let a spoofed header create a fresh bucket per request", () => {
    const a = getRequestIp(req({ "x-forwarded-for": "1.1.1.1, 203.0.113.7" }));
    const b = getRequestIp(req({ "x-forwarded-for": "2.2.2.2, 203.0.113.7" }));
    const c = getRequestIp(req({ "x-forwarded-for": "3.3.3.3, 4.4.4.4, 203.0.113.7" }));
    expect(a).toBe("203.0.113.7");
    expect(b).toBe("203.0.113.7");
    expect(c).toBe("203.0.113.7");
  });

  it("honours TRUSTED_PROXY_HOPS when more than one trusted proxy is in front", () => {
    process.env.TRUSTED_PROXY_HOPS = "2";
    // client, cdn-seen-client, edge-seen-cdn: with 2 trusted hops the
    // real client is the second entry from the right.
    expect(getRequestIp(req({ "x-forwarded-for": "9.9.9.9, 198.51.100.5, 203.0.113.7" }))).toBe(
      "198.51.100.5"
    );
  });

  it("falls back to X-Real-IP only when X-Forwarded-For is absent", () => {
    expect(getRequestIp(req({ "x-real-ip": "198.51.100.9" }))).toBe("198.51.100.9");
    expect(
      getRequestIp(req({ "x-forwarded-for": "203.0.113.7", "x-real-ip": "9.9.9.9" }))
    ).toBe("203.0.113.7");
  });

  it("rejects garbage so a forged header cannot inject text into rate-limit keys", () => {
    expect(getRequestIp(req({ "x-forwarded-for": "<script>alert(1)</script>" }))).toBe("127.0.0.1");
    expect(getRequestIp(req({ "x-real-ip": "not an ip at all" }))).toBe("127.0.0.1");
  });

  it("normalizes port suffixes and bracketed IPv6", () => {
    expect(getRequestIp(req({ "x-forwarded-for": "203.0.113.7:51234" }))).toBe("203.0.113.7");
    expect(getRequestIp(req({ "x-forwarded-for": "[2001:db8::1]:443" }))).toBe("2001:db8::1");
    expect(getRequestIp(req({ "x-forwarded-for": "2001:db8::1" }))).toBe("2001:db8::1");
  });

  it("accepts the plain headers-object shape NextAuth's authorize() receives", () => {
    expect(getClientIpFromHeaders({ "x-forwarded-for": "9.9.9.9, 203.0.113.7" })).toBe("203.0.113.7");
    expect(getClientIpFromHeaders({ "x-forwarded-for": ["9.9.9.9, 203.0.113.7"] })).toBe("203.0.113.7");
    expect(getClientIpFromHeaders(undefined)).toBe("127.0.0.1");
  });
});
