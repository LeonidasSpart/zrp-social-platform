import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import { getNotificationHref, NOTIFICATION_FALLBACK_ACTION } from "../notification-links";

const APP_DIR = path.resolve(__dirname, "../../app");
const LIB_DIR = path.resolve(__dirname, "..");

// Every page route under src/app as a list of segments (route groups
// "(x)" stripped, "[param]" kept as a wildcard).
function collectPageRoutes(dir: string, segs: string[] = [], out: string[][] = []): string[][] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (entry.name === "api" && segs.length === 0) continue;
      const next = /^\(.*\)$/.test(entry.name) ? segs : [...segs, entry.name];
      collectPageRoutes(path.join(dir, entry.name), next, out);
    } else if (entry.name === "page.tsx" || entry.name === "page.ts") {
      out.push(segs);
    }
  }
  return out;
}
const ROUTES = collectPageRoutes(APP_DIR);

function pageExists(href: string): boolean {
  const pathname = href.split(/[?#]/)[0];
  const parts = pathname.split("/").filter(Boolean);
  return ROUTES.some(
    (r) =>
      r.length === parts.length &&
      r.every((seg, i) => (/^\[.+\]$/.test(seg) ? parts[i].length > 0 : seg === parts[i]))
  );
}

// The notification types createNotification accepts, read straight from
// its type union so a newly added type is covered automatically, plus
// the two written directly with prisma.notification.create.
function notificationTypes(): string[] {
  const src = fs.readFileSync(path.join(LIB_DIR, "notifications.ts"), "utf8");
  const block = src.slice(src.indexOf("interface CreateNotificationParams"), src.indexOf("fromUserId: string;"));
  const types = Array.from(block.matchAll(/\|\s*"([a-z_A-Z]+)"/g), (m) => m[1]);
  return [...types, "TIP", "PURCHASE"];
}

describe("notification deep links", () => {
  const types = notificationTypes();

  it("finds the notification types", () => {
    expect(types).toContain("like");
    expect(types).toContain("help_new_offer");
    expect(types.length).toBeGreaterThan(30);
  });

  it.each(types)("%s links to an existing page (with and without a post)", (type) => {
    for (const postId of [undefined, "post123"]) {
      const href = getNotificationHref({ type, postId, fromUsername: "alice" });
      expect(pageExists(href), `${type} -> ${href}`).toBe(true);
    }
  });

  it("post-scoped comment notifications keep the comment deep link", () => {
    expect(getNotificationHref({ type: "reply", postId: "p1", commentId: "c1", fromUsername: "a" })).toBe(
      "/post/p1?commentId=c1"
    );
  });

  it("system notifications never link to the acting admin's profile", () => {
    for (const type of ["ticket_reply", "play_duel_result", "help_campaign_approved", "music_artist_verified", "TIP"]) {
      expect(getNotificationHref({ type, fromUsername: "admin" })).not.toMatch(/^\/profile\//);
    }
  });

  it("every fallback-text type is a real notification type", () => {
    for (const type of Object.keys(NOTIFICATION_FALLBACK_ACTION)) {
      expect(types).toContain(type);
    }
  });

  it("hard-coded email/push links in notification helpers resolve to pages", () => {
    const files = ["notifications.ts", "subscriptions.ts", "post-subscriptions.ts"];
    const hrefs: string[] = [];
    for (const f of files) {
      const src = fs.readFileSync(path.join(LIB_DIR, f), "utf8");
      for (const m of Array.from(src.matchAll(/\$\{process\.env\.NEXTAUTH_URL\}(\/[^"`\s]*)/g))) hrefs.push(m[1]);
      for (const m of Array.from(src.matchAll(/sendPushNotification\([^)]*?["`](\/[^"`]*)["`]\)/g))) hrefs.push(m[1]);
    }
    expect(hrefs.length).toBeGreaterThan(5);
    for (const raw of hrefs) {
      const href = raw.replace(/\$\{[^}]+\}/g, "x");
      expect(pageExists(href), raw).toBe(true);
    }
  });
});
