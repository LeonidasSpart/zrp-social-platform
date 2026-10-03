import { describe, it, expect } from "vitest";
import { isShortProfileUrlPath } from "../middleware";

/**
 * Regression guard for the short-URL share-link bug: handleShareProfile
 * (src/app/profile/[username]/page.tsx) generates links as the bare
 * `/username` alias, not `/profile/username`. That alias is served by
 * src/app/[username]/page.tsx, which has a correct generateMetadata -
 * but the middleware's logged-out gate only recognized `/profile`, so a
 * social-preview crawler (no session cookie, no JS) was bounced to
 * /login before ever reaching it, and every profile link shared from
 * ZRP's own UI unfurled as a generic "Log In | ZRP Social" card.
 */
describe("isShortProfileUrlPath", () => {
  it.each(["/Debbie", "/debbie", "/@Debbie", "/user_name", "/custom-url-123"])(
    "treats a plausible username/custom-URL alias as public: %s",
    (p) => {
      expect(isShortProfileUrlPath(p)).toBe(true);
    }
  );

  it.each([
    "/login",
    "/LOGIN",
    "/signup",
    "/api",
    "/admin",
    "/settings",
    "/profile",
    "/post",
    "/onboarding",
    "/launchpad",
    "/live-audio",
    "/live-video",
  ])("never shadows a real top-level route: %s", (p) => {
    expect(isShortProfileUrlPath(p)).toBe(false);
  });

  it.each([
    "/",
    "/profile/Debbie",
    "/api/posts/123",
    "/settings/team",
    "/a/b",
    "/has a space",
    "/has/slash",
    "",
  ])("rejects anything that isn't a bare single segment: %s", (p) => {
    expect(isShortProfileUrlPath(p)).toBe(false);
  });
});
