import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

/**
 * Structural regression guard for CSP enforcement (next.config.js is a
 * server config file vitest's node environment can't execute the way it
 * would a route handler, so - matching this repo's established pattern
 * for such files, e.g. middleware-public-when-logged-out.test.ts - this
 * checks the source text directly).
 *
 * This CSP was Report-Only for a long time because an enforced policy
 * that misses a real origin fails closed (silently blocks a live
 * feature) instead of failing open. Two gaps were found and fixed when
 * it was promoted to enforced:
 *   - connect-src needs the stun:/turn:/turns: schemes, or the browser
 *     blocks the ICE server connections WebRTC calling depends on
 *     (src/contexts/CallContext.tsx's getIceServers(), backed by
 *     /api/turn-credentials).
 *   - media-src needs uploadthing.com/*.uploadthing.com and the bare
 *     giphy.com host, not just utfs.io/*.giphy.com (src/lib/media-url.ts's
 *     UPLOAD_HOST_RULES lists uploadthing.com as a real upload host too).
 */
const CONFIG_FILE = path.resolve(__dirname, "../../next.config.js");
const source = fs.readFileSync(CONFIG_FILE, "utf8");

function cspValue(): string {
  const idx = source.indexOf('key: "Content-Security-Policy",');
  expect(idx).toBeGreaterThan(-1);
  const valueStart = source.indexOf("value: [", idx);
  const arrayEnd = source.indexOf("].join", valueStart);
  return source.slice(valueStart, arrayEnd);
}

describe("Content-Security-Policy is enforced, not Report-Only", () => {
  it("no longer ships a Content-Security-Policy-Report-Only header", () => {
    expect(source).not.toContain("Content-Security-Policy-Report-Only");
  });

  it("frame-ancestors is still 'none' under the single enforced header", () => {
    const csp = cspValue();
    expect(csp).toContain("frame-ancestors 'none'");
  });
});

describe("CSP connect-src allows the WebRTC ICE schemes calling depends on", () => {
  it.each(["stun:", "turn:", "turns:"])("includes the %s scheme", (scheme) => {
    const csp = cspValue();
    const connectSrcLine = csp
      .split("\n")
      .find((line) => line.includes('"connect-src'));
    expect(connectSrcLine).toBeDefined();
    expect(connectSrcLine).toContain(scheme);
  });
});

describe("CSP media-src covers every real UploadThing/GIPHY host", () => {
  it.each([
    "https://utfs.io",
    "https://*.utfs.io",
    "https://*.ufs.sh",
    "https://uploadthing.com",
    "https://*.uploadthing.com",
    "https://giphy.com",
    "https://*.giphy.com",
  ])("includes %s", (host) => {
    const csp = cspValue();
    const mediaSrcLine = csp.split("\n").find((line) => line.includes('"media-src'));
    expect(mediaSrcLine).toBeDefined();
    expect(mediaSrcLine).toContain(host);
  });
});
