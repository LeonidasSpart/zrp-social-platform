import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";

// getServerSession is mocked (unit-level auth control), but the rate
// limiter is NOT mocked - these tests exercise the real, Redis-backed
// checkRateLimitKey() so the 429 assertions below prove the actual
// configured thresholds, not a stand-in for them. Redis must be running
// for the suite to reflect production behavior; if it is not, rate-limit.ts
// falls back to its own in-memory limiter (still enforced, never
// fail-open), so these tests remain meaningful either way.
const { getServerSession } = vi.hoisted(() => ({ getServerSession: vi.fn() }));
vi.mock("next-auth", () => ({ getServerSession }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));

import { GET } from "../route";

const originalFetch = global.fetch;
const originalAppName = process.env.METERED_APP_NAME;
const originalApiKey = process.env.METERED_API_KEY;

function req(opts: { ip?: string; headers?: Record<string, string> } = {}) {
  return new NextRequest("https://zrp.one/api/turn-credentials", {
    headers: { "x-forwarded-for": opts.ip ?? "203.0.113.9", ...opts.headers },
  });
}

// A real Metered TURN REST API response shape: short-lived, per-request
// username/credential pairs plus plain STUN entries - never the provider
// API key itself.
const FAKE_METERED_RESPONSE = [
  { urls: "stun:stun.relay.metered.ca:80" },
  {
    urls: "turn:standard.relay.metered.ca:80",
    username: "1234567890:zrp-user",
    credential: "shortLivedCredentialValueNotTheApiKey==",
  },
  {
    urls: "turns:standard.relay.metered.ca:443?transport=tcp",
    username: "1234567890:zrp-user",
    credential: "shortLivedCredentialValueNotTheApiKey==",
  },
];

describe("GET /api/turn-credentials", () => {
  beforeEach(() => {
    getServerSession.mockReset();
    process.env.METERED_APP_NAME = "zrp-test-app";
    process.env.METERED_API_KEY = "test-metered-api-key-not-real";
    global.fetch = vi.fn(async () =>
      new Response(JSON.stringify(FAKE_METERED_RESPONSE), { status: 200 })
    ) as unknown as typeof fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
    if (originalAppName === undefined) delete process.env.METERED_APP_NAME;
    else process.env.METERED_APP_NAME = originalAppName;
    if (originalApiKey === undefined) delete process.env.METERED_API_KEY;
    else process.env.METERED_API_KEY = originalApiKey;
  });

  // ─── Authentication ────────────────────────────────────────────────

  it("rejects an unauthenticated request with 401", async () => {
    getServerSession.mockResolvedValue(null);
    const res = await GET(req({ ip: "203.0.113.10" }));
    expect(res.status).toBe(401);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("rejects a session with no user id", async () => {
    getServerSession.mockResolvedValue({ user: {} });
    const res = await GET(req({ ip: "203.0.113.11" }));
    expect(res.status).toBe(401);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("issues credentials for an authenticated, active user", async () => {
    getServerSession.mockResolvedValue({ user: { id: "user-active-1" } });
    const res = await GET(req({ ip: "203.0.113.12" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual(FAKE_METERED_RESPONSE);
  });

  // A banned user never reaches this route with a truthy session at all:
  // auth.ts's session() callback returns null for token.banned === true,
  // so getServerSession() itself resolves to null. That is the single
  // authoritative ban model documented in auth.ts and CLAUDE.md - this
  // route deliberately does not re-implement a second ban check, it just
  // proves the existing 401 path is what a banned caller actually hits.
  it("a banned user (no session, per auth.ts's authoritative ban model) is rejected the same way as unauthenticated", async () => {
    getServerSession.mockResolvedValue(null);
    const res = await GET(req({ ip: "203.0.113.13" }));
    expect(res.status).toBe(401);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  // ─── Rate limiting ─────────────────────────────────────────────────

  it("IP rate limit: rejects after the configured per-IP threshold, even for distinct authenticated users sharing an IP", async () => {
    const ip = `203.0.113.${20 + Math.floor(Math.random() * 50)}`;
    const statuses: number[] = [];
    for (let i = 0; i < 21; i++) {
      getServerSession.mockResolvedValue({ user: { id: `distinct-user-${i}` } });
      const res = await GET(req({ ip }));
      statuses.push(res.status);
    }
    expect(statuses.slice(0, 20).every((s) => s === 200)).toBe(true);
    expect(statuses[20]).toBe(429);
  });

  it("user rate limit: rejects after the configured per-user threshold, even when the IP changes on every request", async () => {
    const userId = `rotating-ip-user-${Math.random()}`;
    getServerSession.mockResolvedValue({ user: { id: userId } });
    const statuses: number[] = [];
    for (let i = 0; i < 21; i++) {
      const res = await GET(req({ ip: `198.51.100.${i}` }));
      statuses.push(res.status);
    }
    expect(statuses.slice(0, 20).every((s) => s === 200)).toBe(true);
    expect(statuses[20]).toBe(429);
  });

  it("a 429 response never exposes provider configuration", async () => {
    const userId = `leak-check-user-${Math.random()}`;
    getServerSession.mockResolvedValue({ user: { id: userId } });
    let last!: Response;
    for (let i = 0; i < 21; i++) {
      last = await GET(req({ ip: `198.51.100.${200 + i}` }));
    }
    expect(last.status).toBe(429);
    const text = await last.text();
    expect(text).not.toContain(process.env.METERED_API_KEY);
    expect(text).not.toContain("METERED_API_KEY");
    expect(text).not.toContain("METERED_APP_NAME");
  });

  // ─── Provider configuration / failure handling ─────────────────────

  it("provider not configured: returns a safe STUN-only fallback, not an error, and never calls the provider", async () => {
    delete process.env.METERED_APP_NAME;
    delete process.env.METERED_API_KEY;
    getServerSession.mockResolvedValue({ user: { id: "user-no-provider" } });
    const res = await GET(req({ ip: "203.0.113.30" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual([
      { urls: "stun:stun.l.google.com:19302" },
      { urls: "stun:stun1.l.google.com:19302" },
    ]);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("provider failure (non-2xx): falls back to STUN-only rather than surfacing the provider error", async () => {
    global.fetch = vi.fn(async () => new Response("Internal error", { status: 500 })) as unknown as typeof fetch;
    getServerSession.mockResolvedValue({ user: { id: "user-provider-500" } });
    const res = await GET(req({ ip: "203.0.113.31" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual([
      { urls: "stun:stun.l.google.com:19302" },
      { urls: "stun:stun1.l.google.com:19302" },
    ]);
  });

  it("provider failure (network error): falls back to STUN-only and never leaks the thrown error to the client", async () => {
    global.fetch = vi.fn(async () => {
      throw new Error(`connect ECONNREFUSED ${process.env.METERED_API_KEY}`);
    }) as unknown as typeof fetch;
    getServerSession.mockResolvedValue({ user: { id: "user-provider-error" } });
    const res = await GET(req({ ip: "203.0.113.32" }));
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).not.toContain(process.env.METERED_API_KEY);
    const body = JSON.parse(text);
    expect(body).toEqual([
      { urls: "stun:stun.l.google.com:19302" },
      { urls: "stun:stun1.l.google.com:19302" },
    ]);
  });

  // ─── Response shape / secret handling ──────────────────────────────

  it("response contains only temporary TURN/STUN credentials, never the provider's long-lived API key", async () => {
    getServerSession.mockResolvedValue({ user: { id: "user-shape-check" } });
    const res = await GET(req({ ip: "203.0.113.40" }));
    const body = await res.json();
    for (const entry of body) {
      if (entry.credential) {
        expect(entry.credential).not.toBe(process.env.METERED_API_KEY);
      }
    }
    const text = JSON.stringify(body);
    expect(text).not.toContain("test-metered-api-key-not-real");
  });

  it("the outbound provider request URL is never echoed back to the caller", async () => {
    getServerSession.mockResolvedValue({ user: { id: "user-url-check" } });
    const res = await GET(req({ ip: "203.0.113.41" }));
    const text = await res.text();
    expect(text).not.toContain("metered.live");
    expect(text).not.toContain(process.env.METERED_API_KEY);
  });

  // ─── Existing legitimate caller compatibility ──────────────────────
  // The web caller (messages/[username]/page.tsx's getIceServers()) and
  // the Android caller (TurnCredentialsApi via the shared, cookie-
  // attaching Retrofit client) both call this route with no request
  // body and no custom headers beyond the session cookie - a plain GET
  // is exactly what they issue. This is that same shape.
  it("remains compatible with the existing plain-GET caller shape (no body, no special headers required beyond auth)", async () => {
    getServerSession.mockResolvedValue({ user: { id: "legit-caller" } });
    const res = await GET(
      new NextRequest("https://zrp.one/api/turn-credentials", {
        headers: { "x-forwarded-for": "203.0.113.50" },
      })
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
  });
});
