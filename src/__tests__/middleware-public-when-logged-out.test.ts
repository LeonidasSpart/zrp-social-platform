import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

/**
 * Structural regression guard for the social-sharing middleware fix:
 * /profile, /hashtag and /trust each already had a real, per-entity
 * generateMetadata() (privacy-aware: noindex + generic copy for a
 * private/banned/nonexistent entity, full rich metadata otherwise -
 * see src/lib/seo/profileMetadata.ts and the two sibling layout.tsx
 * files), but a logged-out visitor - including a social-preview
 * crawler, which never runs the page's own client-side useSession()
 * redirect - was bounced to /login by this middleware gate before
 * Next.js ever rendered that metadata. A shared profile/hashtag/trust
 * link therefore never produced a working preview.
 */
const MIDDLEWARE_FILE = path.resolve(__dirname, "../middleware.ts");
const read = () => fs.readFileSync(MIDDLEWARE_FILE, "utf8");

describe("PUBLIC_WHEN_LOGGED_OUT_PATHS includes the routes with real crawler-facing metadata", () => {
  const source = read();
  const idx = source.indexOf("const PUBLIC_WHEN_LOGGED_OUT_PATHS = [");
  const line = source.slice(idx, source.indexOf("]", idx) + 1);

  it.each(["/post", "/profile", "/hashtag", "/trust"])("includes %s", (p) => {
    expect(line).toContain(`"${p}"`);
  });

  it("only widens the no-token case - the banned-user check and onboarding redirect above/below it are untouched", () => {
    // i.e. this list is still consumed inside `if (!token) { ... }`,
    // not spliced into PUBLIC_PATHS (which would also skip the
    // banned-user check for a visitor who DOES have a token).
    const bannedCheckIdx = source.indexOf("BANNED USER CHECK");
    const listIdx = source.indexOf("const PUBLIC_WHEN_LOGGED_OUT_PATHS");
    expect(bannedCheckIdx).toBeGreaterThan(-1);
    expect(bannedCheckIdx).toBeLessThan(listIdx);
  });
});
