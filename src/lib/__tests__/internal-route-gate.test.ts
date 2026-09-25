import { describe, it, expect } from "vitest";
import { isBlockedInternalRequest, isInternalApiPath } from "../../../internal-route-gate";

// server.js's only network-level protection for /api/internal/* (the
// incoming-call push route): refused unless the TCP peer is loopback and
// nothing proxied the request.
function req(remoteAddress: string, headers: Record<string, string> = {}) {
  return { socket: { remoteAddress }, headers } as unknown as import("http").IncomingMessage;
}

describe("internal-route-gate", () => {
  it("lets server.js's own loopback call through (IPv4, IPv6, v4-mapped)", () => {
    for (const addr of ["127.0.0.1", "::1", "::ffff:127.0.0.1"]) {
      expect(isBlockedInternalRequest(req(addr), "/api/internal/call-push")).toBe(false);
    }
  });

  it("refuses the internal route for any non-loopback peer", () => {
    expect(isBlockedInternalRequest(req("10.0.0.5"), "/api/internal/call-push")).toBe(true);
    expect(isBlockedInternalRequest(req("198.51.100.7"), "/api/internal/call-push")).toBe(true);
  });

  it("refuses a loopback connection that was proxied (carries X-Forwarded-For)", () => {
    expect(
      isBlockedInternalRequest(req("127.0.0.1", { "x-forwarded-for": "198.51.100.7" }), "/api/internal/call-push")
    ).toBe(true);
  });

  it("recognises encoded, doubled-slash and mixed-case variants of the path", () => {
    for (const p of ["/api/internal/call-push", "//api//internal/call-push", "/API/Internal/call-push", "/api/%69nternal/call-push", "/api\\internal/x"]) {
      expect(isInternalApiPath(p), p).toBe(true);
    }
  });

  it("never blocks ordinary routes, from any peer", () => {
    for (const p of ["/", "/api/posts", "/api/posts/internal", "/messages"]) {
      expect(isBlockedInternalRequest(req("198.51.100.7"), p), p).toBe(false);
    }
  });
});
