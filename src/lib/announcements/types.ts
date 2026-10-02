/**
 * Global announcement / broadcast system - shared types and content
 * validation. See src/lib/announcements/dispatch.ts for the actual
 * send pipeline and CLAUDE.md's "ZRP PLAY" section for the pattern this
 * module follows (a small, explicit registry + pure validation
 * functions, not a generic/overflexible schema).
 *
 * `type` is a plain string union here, not a Prisma enum - matching
 * Notification.type's own established convention in this codebase
 * (see prisma/schema.prisma) rather than introducing a different
 * pattern for a closely related concept.
 */
export const ANNOUNCEMENT_TYPES = [
  "UPDATE",
  "MAINTENANCE",
  "SECURITY",
  "NEW_FEATURE",
  "ANNOUNCEMENT",
] as const;

export type AnnouncementType = (typeof ANNOUNCEMENT_TYPES)[number];

export function isValidAnnouncementType(value: unknown): value is AnnouncementType {
  return typeof value === "string" && (ANNOUNCEMENT_TYPES as readonly string[]).includes(value);
}

export const TITLE_MAX_LENGTH = 120;
export const BODY_MAX_LENGTH = 1000;

// All fields are optional at the TYPE level (callers pass an arbitrary
// `Record<string, unknown>` parsed from a JSON body, which can't
// statically prove a key is present) - validateAnnouncementContent()
// itself enforces which ones are actually required at runtime.
export interface AnnouncementContentInput {
  title?: unknown;
  body?: unknown;
  type?: unknown;
  imageUrl?: unknown;
  actionUrl?: unknown;
  scheduledAt?: unknown;
}

export type ContentValidationResult =
  | { ok: true; value: { title: string; body: string; type: AnnouncementType; imageUrl: string | null; actionUrl: string | null; scheduledAt: Date | null } }
  | { ok: false; error: string };

/**
 * An announcement's action URL is a click target the client navigates
 * to directly (not a server-side redirect), but it is still rendered
 * for every eligible member of the platform, so it gets the same
 * floor as any other user-facing link surface: internal app paths are
 * preferred and always allowed; an external link must be a plain
 * https URL with no embedded credentials and no dangerous scheme. This
 * intentionally does not reuse src/lib/media-url.ts's
 * isAllowedMediaUrl()/isTrustedUploadUrl() - those are scoped to
 * *media* hosts (UploadThing/GIPHY) and would reject a legitimate
 * external "Learn more" link a security/maintenance announcement might
 * need to point at.
 */
export function validateActionUrl(value: unknown): { ok: true; url: string | null } | { ok: false; error: string } {
  if (value === undefined || value === null || value === "") return { ok: true, url: null };
  if (typeof value !== "string") return { ok: false, error: "actionUrl must be a string" };
  if (value.length > 2048) return { ok: false, error: "actionUrl is too long" };

  // Internal route: must start with exactly one leading slash (reject
  // "//host/path", a protocol-relative URL that browsers treat as
  // external - an open-redirect-shaped trick for what looks like an
  // internal link).
  if (value.startsWith("/") && !value.startsWith("//")) {
    // No raw CR/LF/control characters (header/response-splitting-style
    // payloads have no business in a stored navigation target).
    if (/[\r\n\t\0]/.test(value)) return { ok: false, error: "actionUrl contains invalid characters" };
    return { ok: true, url: value };
  }

  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return { ok: false, error: "actionUrl must be an internal path or a valid https URL" };
  }
  if (parsed.protocol !== "https:") {
    return { ok: false, error: "actionUrl must use https" };
  }
  if (parsed.username || parsed.password) {
    return { ok: false, error: "actionUrl must not contain credentials" };
  }
  return { ok: true, url: parsed.toString() };
}

export function validateAnnouncementContent(input: AnnouncementContentInput): ContentValidationResult {
  const title = typeof input.title === "string" ? input.title.trim() : "";
  const body = typeof input.body === "string" ? input.body.trim() : "";

  if (!title) return { ok: false, error: "title is required" };
  if (title.length > TITLE_MAX_LENGTH) return { ok: false, error: `title must be ${TITLE_MAX_LENGTH} characters or fewer` };
  if (!body) return { ok: false, error: "body is required" };
  if (body.length > BODY_MAX_LENGTH) return { ok: false, error: `body must be ${BODY_MAX_LENGTH} characters or fewer` };

  const type = input.type === undefined || input.type === null || input.type === "" ? "ANNOUNCEMENT" : input.type;
  if (!isValidAnnouncementType(type)) {
    return { ok: false, error: `type must be one of: ${ANNOUNCEMENT_TYPES.join(", ")}` };
  }

  const actionUrlResult = validateActionUrl(input.actionUrl);
  if (!actionUrlResult.ok) return { ok: false, error: actionUrlResult.error };

  let imageUrl: string | null = null;
  if (input.imageUrl !== undefined && input.imageUrl !== null && input.imageUrl !== "") {
    if (typeof input.imageUrl !== "string") return { ok: false, error: "imageUrl must be a string" };
    imageUrl = input.imageUrl;
  }

  let scheduledAt: Date | null = null;
  if (input.scheduledAt !== undefined && input.scheduledAt !== null && input.scheduledAt !== "") {
    const parsedDate = new Date(input.scheduledAt as string);
    if (Number.isNaN(parsedDate.getTime())) return { ok: false, error: "scheduledAt must be a valid date" };
    if (parsedDate.getTime() <= Date.now()) return { ok: false, error: "scheduledAt must be in the future" };
    scheduledAt = parsedDate;
  }

  return { ok: true, value: { title, body, type, imageUrl, actionUrl: actionUrlResult.url, scheduledAt } };
}

// Push notification bodies are shown in a system tray/banner, not a
// full page - truncate so a long announcement body doesn't produce a
// broken-looking push payload on any platform.
export const PUSH_BODY_MAX_LENGTH = 180;

export function truncateForPush(body: string): string {
  if (body.length <= PUSH_BODY_MAX_LENGTH) return body;
  return `${body.slice(0, PUSH_BODY_MAX_LENGTH - 1).trimEnd()}…`;
}

/**
 * How the notification center (src/app/notifications/page.tsx) should
 * navigate a stored, already-validated announcement.actionUrl: an
 * internal path through Next's own <Link> (in-app, no full reload), an
 * external https URL through a plain new-tab anchor, or no link at all.
 * Mirrors validateActionUrl()'s own internal/external split exactly
 * (single leading "/", not "//") rather than re-deriving it ad hoc at
 * the render call site - a value reaching here already passed that
 * validator at create/edit time, so this never actually sees a
 * protocol-relative "//" value in practice, but matching the same rule
 * keeps the two in lockstep if that ever changes.
 */
export type AnnouncementLinkKind = "internal" | "external" | "none";

export function classifyAnnouncementActionUrl(actionUrl: string | null | undefined): AnnouncementLinkKind {
  if (!actionUrl) return "none";
  if (actionUrl.startsWith("/") && !actionUrl.startsWith("//")) return "internal";
  return "external";
}
