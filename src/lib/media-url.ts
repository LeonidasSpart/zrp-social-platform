/*
 * ============================================================
 * Media URL trust
 * ============================================================
 *
 * ⚠️ SECURITY: POST /api/posts stored whatever `imageUrl` / `imageUrls`
 * the client sent, from any host, in any scheme, and trusted a client-
 * declared `mediaType: "video"` for any of them. That let a caller
 * publish posts whose "image" pointed anywhere on the internet (a
 * tracking pixel that logs every reader's IP, a third-party host
 * serving different content to different viewers, an attacker-
 * controlled MP4 in the Shorts feed), and let arbitrary URLs be
 * labelled "video" so they surfaced in /api/videos.
 *
 * Every piece of media ZRP itself creates comes from exactly two
 * places: UploadThing (all user uploads, via /api/uploadthing and
 * /api/upload) and GIPHY (the GIF picker, via /api/gifs/*). So that is
 * the allowlist for NEW posts. Existing rows are untouched - this is
 * only consulted on write, and the read paths (/api/videos, feeds)
 * keep serving whatever was already stored.
 *
 * ALLOWED_MEDIA_HOSTS (optional, comma-separated) can add exact hosts
 * or ".suffix" wildcards without a code change if a new legitimate
 * source is ever introduced.
 */

// UploadThing serves files from utfs.io (legacy) and <app>.ufs.sh
// (current) - see the existing avatar/cover routes, which already
// check for exactly these two.
const UPLOAD_HOST_RULES: HostRule[] = [
  { exact: "utfs.io" },
  { suffix: ".utfs.io" },
  { suffix: ".ufs.sh" },
  { exact: "uploadthing.com" },
  { suffix: ".uploadthing.com" },
];

// GIPHY's CDN (fixed_width.url from /api/gifs/* resolves to
// media<N>.giphy.com).
const GIF_HOST_RULES: HostRule[] = [{ exact: "giphy.com" }, { suffix: ".giphy.com" }];

type HostRule = { exact: string } | { suffix: string };

function matchesRule(host: string, rule: HostRule): boolean {
  if ("exact" in rule) return host === rule.exact;
  return host.endsWith(rule.suffix) && host.length > rule.suffix.length;
}

function extraHostRules(): HostRule[] {
  const raw = process.env.ALLOWED_MEDIA_HOSTS;
  if (!raw) return [];
  return raw
    .split(",")
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean)
    .map((h): HostRule => (h.startsWith(".") ? { suffix: h } : { exact: h }));
}

/**
 * Parse a media URL that is safe to store and later render: https only,
 * no embedded credentials, no data:/blob:/javascript: pseudo-schemes.
 * Returns null for anything else.
 */
export function parseMediaUrl(value: unknown): URL | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 2048) return null;
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return null;
  }
  if (url.protocol !== "https:") return null;
  if (url.username || url.password) return null;
  if (!url.hostname) return null;
  return url;
}

/** True when the URL points at ZRP's own upload storage (UploadThing). */
export function isTrustedUploadUrl(value: unknown): boolean {
  const url = parseMediaUrl(value);
  if (!url) return false;
  const host = url.hostname.toLowerCase();
  return UPLOAD_HOST_RULES.some((r) => matchesRule(host, r));
}

/** True when the URL is from any source ZRP itself hands out as media. */
export function isAllowedMediaUrl(value: unknown): boolean {
  const url = parseMediaUrl(value);
  if (!url) return false;
  const host = url.hostname.toLowerCase();
  return [...UPLOAD_HOST_RULES, ...GIF_HOST_RULES, ...extraHostRules()].some((r) =>
    matchesRule(host, r)
  );
}

export type MediaUrlValidation =
  | { ok: true }
  | { ok: false; error: string; url: string };

/** Validate every URL a client wants to attach as post media. */
export function validateMediaUrls(urls: readonly unknown[]): MediaUrlValidation {
  for (const candidate of urls) {
    if (!isAllowedMediaUrl(candidate)) {
      return {
        ok: false,
        error: "Media must be uploaded through ZRP or chosen from the GIF picker.",
        url: typeof candidate === "string" ? candidate : String(candidate),
      };
    }
  }
  return { ok: true };
}
