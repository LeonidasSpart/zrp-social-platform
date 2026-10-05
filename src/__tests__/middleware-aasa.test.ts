import { describe, it, expect, vi } from "vitest";
import fs from "fs";
import path from "path";
import { NextRequest } from "next/server";

/**
 * Regression guard for the Universal Links handshake: Apple's CDN fetches
 * https://zrp.one/.well-known/apple-app-site-association unauthenticated
 * and treats any redirect as a failed fetch (see
 * src/app/.well-known/apple-app-site-association/route.ts's own doc
 * comment). Before PUBLIC_INFRA_PATHS listed this path, a request with no
 * session token fell through to middleware's "no token -> redirect to
 * /login" branch - a redirect response that would have silently kept
 * Universal Links dead no matter how correct the AASA file's own content
 * was, with nothing in CI or local testing ever exercising the gap.
 */
const MIDDLEWARE_FILE = path.resolve(__dirname, "../middleware.ts");

describe("PUBLIC_INFRA_PATHS includes the AASA handshake path", () => {
  const source = fs.readFileSync(MIDDLEWARE_FILE, "utf8");
  const idx = source.indexOf("const PUBLIC_INFRA_PATHS = [");
  const listText = source.slice(idx, source.indexOf("];", idx) + 1);

  it("lists /.well-known/apple-app-site-association", () => {
    expect(listText).toContain('"/.well-known/apple-app-site-association"');
  });

  it("checks PUBLIC_INFRA_PATHS before the auth-token redirect branch", () => {
    const infraCheckIdx = source.indexOf("PUBLIC PWA / INFRASTRUCTURE FILES");
    const requireAuthIdx = source.indexOf("REQUIRE AUTHENTICATION");
    expect(infraCheckIdx).toBeGreaterThan(-1);
    expect(requireAuthIdx).toBeGreaterThan(infraCheckIdx);
  });
});

vi.mock("next-auth/jwt", () => ({ getToken: vi.fn().mockResolvedValue(null) }));

describe("middleware() on /.well-known/apple-app-site-association (no session, like Apple's fetcher)", () => {
  it("passes the request through instead of redirecting to /login", async () => {
    const { middleware } = await import("../middleware");
    const req = new NextRequest(
      new Request("https://zrp.one/.well-known/apple-app-site-association")
    );

    const res = await middleware(req);

    expect(res.status).not.toBe(307);
    expect(res.status).not.toBe(308);
    expect(res.headers.get("location")).toBeNull();
  });

  it("still redirects an ordinary unauthenticated page request to /login (control case)", async () => {
    const { middleware } = await import("../middleware");
    const req = new NextRequest(new Request("https://zrp.one/settings"));

    const res = await middleware(req);

    expect([307, 308]).toContain(res.status);
    expect(res.headers.get("location")).toContain("/login");
  });
});
