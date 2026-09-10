import { safeFetch, type SafeFetchOptions } from "@/lib/ssrf-guard";
import { parseHtmlMetadata } from "@/lib/link-preview-parse";

/*
 * ============================================================
 * Fallback article image
 * ============================================================
 *
 * A story's own imageUrl (see ingest.ts) is only ever set when its
 * source's RSS feed carried an image AND that source has been cleared
 * to share it. Most sources aren't - so most stories published no
 * image at all, on either the main feed post or the /news bridge.
 *
 * This is the same fallback ZRP already relies on everywhere else a
 * pasted link needs a photo: fetch the linked article page and read
 * its own og:image - the exact mechanism src/app/api/link-preview
 * uses for any post containing a URL. It is never a substitute for a
 * source's own RSS image when one is available and allowed; it only
 * runs when there is nothing else.
 */

export interface FallbackImageOptions {
  timeoutMs?: number;
  // Test-only escape hatch, threaded straight through to safeFetch -
  // see ssrf-guard.ts. Every production call site leaves this unset.
  isAddressAllowed?: SafeFetchOptions["isAddressAllowed"];
}

const FALLBACK_IMAGE_USER_AGENT =
  "Mozilla/5.0 (compatible; ZRPNewsImageFallback/1.0; +https://zrp.one/about)";

/**
 * Best-effort og:image for a source article. Never throws: a network
 * error, a timeout, a non-HTML response or a page with no og:image all
 * just mean no fallback image, exactly like not attempting one at all.
 */
export async function fetchFallbackImage(
  sourceUrl: string,
  options: FallbackImageOptions = {}
): Promise<string | null> {
  try {
    const res = await safeFetch(sourceUrl, {
      timeoutMs: options.timeoutMs ?? 5000,
      maxBytes: 200_000,
      isAddressAllowed: options.isAddressAllowed,
      headers: {
        "User-Agent": FALLBACK_IMAGE_USER_AGENT,
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
    });

    if (res.statusCode < 200 || res.statusCode >= 300) return null;

    const contentType = (res.headers["content-type"] as string) || "";
    if (!contentType.includes("text/html")) return null;

    const preview = parseHtmlMetadata(res.body.toString("utf-8"), sourceUrl);
    return preview?.image ?? null;
  } catch {
    return null;
  }
}
