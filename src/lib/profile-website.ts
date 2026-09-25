// Normalizes the free-text "website" field on a user profile.
//
// ⚠️ SECURITY: the profile page renders this value straight into an
// <a href>. React 18 only warns on a `javascript:` href (it does not
// block it) and the CSP allows 'unsafe-inline', so an unvalidated value
// like `javascript:fetch('/api/...')` was a stored XSS against anyone
// who clicked another user's website link. Only http(s) URLs are
// accepted; a bare host ("example.com") gets https:// prepended, the
// way people usually type it. Also used for other user-supplied links
// rendered as <a href> (e.g. a news article's source URL).
export type ProfileWebsiteResult =
  | { ok: true; value: string | null }
  | { ok: false; error: string };

const MAX_WEBSITE_LENGTH = 2048;

export function normalizeProfileWebsite(input: unknown, label = "Website"): ProfileWebsiteResult {
  if (input === null || input === undefined) return { ok: true, value: null };
  if (typeof input !== "string") return { ok: false, error: `Invalid ${label.toLowerCase()} URL` };

  const trimmed = input.trim();
  if (!trimmed) return { ok: true, value: null };
  if (trimmed.length > MAX_WEBSITE_LENGTH) return { ok: false, error: `${label} URL is too long` };

  // No scheme at all ("example.com", "example.com/path") -> assume https.
  // Anything that already names a scheme must name http or https.
  // ("example.com:8080" is a host:port, not a scheme.)
  const hasScheme = /^[a-z][a-z0-9+.-]*:/i.test(trimmed) && !/^[^:/]+:\d+(?:[/?#]|$)/.test(trimmed);
  const candidate = hasScheme ? trimmed : `https://${trimmed}`;

  let parsed: URL;
  try {
    parsed = new URL(candidate);
  } catch {
    return { ok: false, error: `Invalid ${label.toLowerCase()} URL` };
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return { ok: false, error: `${label} must be an http(s) URL` };
  }
  if (!parsed.hostname) return { ok: false, error: `Invalid ${label.toLowerCase()} URL` };

  return { ok: true, value: candidate };
}

// Render-side counterpart for values already in the database (written
// before the write-side check existed, or by a pipeline such as the news
// RSS importer): returns an http(s) href, or undefined so the <a> stays
// inert rather than ever becoming a live `javascript:` link.
export function safeExternalHref(value: string | null | undefined): string | undefined {
  const result = normalizeProfileWebsite(value);
  return result.ok && result.value ? result.value : undefined;
}
