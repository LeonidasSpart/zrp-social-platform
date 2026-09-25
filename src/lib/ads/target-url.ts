/**
 * An ad's click-through destination. AdCard navigates the viewer's own
 * tab to it (`window.location.href`), so anything but an absolute
 * http(s) URL - notably `javascript:`/`data:` - would execute in the
 * viewer's ZRP session. Returns the normalized URL, or null if unsafe.
 */
export function parseAdTargetUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 2048) return null;
  try {
    const url = new URL(trimmed);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    return url.toString();
  } catch {
    return null;
  }
}
