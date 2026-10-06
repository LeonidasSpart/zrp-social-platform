import { describe, it, expect, afterEach } from "vitest";
import { GET } from "../route";

/**
 * src/lib/apns.ts's own tests establish the pattern this follows: a
 * repo-side feature that depends on a real Apple Developer Team ID this
 * repository does not have must fail safely (never throw, never invent a
 * value) AND visibly (a clear signal if someone sets a malformed value).
 * No Apple infrastructure is reachable from this test - it only proves
 * the route's own logic, not that Apple's CDN actually accepts the
 * result (that requires a real Team ID and is BLOCKED BY APPLE
 * INFRASTRUCTURE, see the surgical-mission report).
 */
const ORIGINAL_TEAM_ID = process.env.APPLE_TEAM_ID;

afterEach(() => {
  if (ORIGINAL_TEAM_ID === undefined) delete process.env.APPLE_TEAM_ID;
  else process.env.APPLE_TEAM_ID = ORIGINAL_TEAM_ID;
});

describe("GET /.well-known/apple-app-site-association", () => {
  it("serves a valid 'no apps claim this domain' response when APPLE_TEAM_ID is unset", async () => {
    delete process.env.APPLE_TEAM_ID;

    const res = await GET();
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("application/json");
    expect(body).toEqual({ applinks: { apps: [], details: [] } });
  });

  it("serves the same safe response for a malformed APPLE_TEAM_ID, without throwing", async () => {
    process.env.APPLE_TEAM_ID = "not-a-real-team-id";

    const res = await GET();
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({ applinks: { apps: [], details: [] } });
  });

  it("builds the real association once a shaped-like-real APPLE_TEAM_ID is set", async () => {
    process.env.APPLE_TEAM_ID = "ABCDE12345";

    const res = await GET();
    const body = await res.json();

    expect(body.applinks.details).toHaveLength(1);
    expect(body.applinks.details[0].appID).toBe("ABCDE12345.one.zrp.social");
    expect(body.applinks.details[0].appIDs).toEqual(["ABCDE12345.one.zrp.social"]);
    // API routes and the handshake file itself must never be dispatched
    // to the app.
    expect(body.applinks.details[0].paths).toEqual(["NOT /api/*", "NOT /.well-known/*", "*"]);
  });

  it("rejects a team ID with the wrong length/characters the same as unset", async () => {
    for (const bad of ["ABCDE1234", "ABCDE123456", "abcde12345", "ABCDE-1234"]) {
      process.env.APPLE_TEAM_ID = bad;
      const res = await GET();
      const body = await res.json();
      expect(body).toEqual({ applinks: { apps: [], details: [] } });
    }
  });
});
