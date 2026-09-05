import { NextRequest, NextResponse } from "next/server";
import { getCached, setCached } from "@/lib/redis";
import { safeFetch, SsrfBlockedError } from "@/lib/ssrf-guard";
import { rateLimit } from "@/lib/rate-limit";
import { extractYouTubeVideoId, getYouTubeThumbnailUrl, getYouTubeCanonicalUrl, isYouTubeUrl } from "@/lib/youtube";
import { parseHtmlMetadata, type LinkPreview } from "@/lib/link-preview-parse";

// The video ID (and therefore the thumbnail, via YouTube's stable public
// CDN URL pattern) is derivable straight from the URL string with no
// network call at all. Only the title genuinely requires fetching
// anything - via oEmbed, which is otherwise the fragile part of this:
// it can fail for reasons that have nothing to do with the URL being
// valid (rate limiting, a transient timeout, a cookie/consent response
// instead of JSON for cookie-less server-side requests). Previously a
// failed oEmbed call fell through to fetchGenericPreview() scraping the
// watch page's HTML directly, which is fragile in exactly the same ways
// plus its own (og:image is usually present, but not guaranteed) - and
// if that failed too, no preview rendered at all, which is the bug this
// fixes: a valid YouTube URL must always produce at least a thumbnail
// card, with the title as a best-effort addition on top.
async function fetchYouTubePreview(url: string): Promise<LinkPreview | null> {
  const videoId = extractYouTubeVideoId(url);
  if (!videoId) return null;

  const preview: LinkPreview = {
    url: getYouTubeCanonicalUrl(videoId),
    title: null,
    description: null,
    image: getYouTubeThumbnailUrl(videoId),
    siteName: "YouTube",
    isVideo: true,
  };

  try {
    const oembedUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent(
      getYouTubeCanonicalUrl(videoId)
    )}&format=json`;
    // youtube.com is a fixed, trusted host, but route it through the
    // same guarded fetch for consistency and the same size/time caps.
    const res = await safeFetch(oembedUrl, { timeoutMs: 5000, maxBytes: 50_000 });
    if (res.statusCode >= 200 && res.statusCode < 300) {
      const data = JSON.parse(res.body.toString("utf-8"));
      if (typeof data.title === "string" && data.title.trim()) {
        preview.title = data.title;
      }
    }
  } catch {
    // oEmbed failed or returned something that wasn't the JSON we
    // expected (e.g. an HTML response) - the thumbnail-only preview
    // built above is still valid and still gets returned.
  }

  return preview;
}

interface GenericPreviewResult {
  preview: LinkPreview | null;
  // true when the page itself was never actually examined - a network
  // error, timeout, non-2xx status, or non-HTML response - as opposed
  // to a page that was fetched and parsed cleanly but genuinely has no
  // og:title/og:image. The route uses this to pick how long to cache
  // the negative result: a transient failure (a momentary block by the
  // publisher's bot protection, a timeout under load) shouldn't lock a
  // link out of ever showing a preview for a full hour on its very
  // first, possibly unlucky, attempt.
  transient: boolean;
}

async function fetchGenericPreview(url: string): Promise<GenericPreviewResult> {
  try {
    const res = await safeFetch(url, {
      timeoutMs: 6000,
      maxBytes: 200_000,
      headers: {
        // A full, realistic header set - not just a User-Agent string -
        // matters here: many publishers' CDN/bot-protection layers
        // treat a suspiciously bare request (no Accept-Language, no
        // Accept-Encoding) as a signal to serve a stripped-down or
        // blocked response instead of the real page. Accept-Encoding
        // additionally lets compression-by-default hosts (most modern
        // CDNs) actually compress the reply, which - now that safeFetch
        // decompresses it - means more real HTML content fits under
        // maxBytes than the same cap would hold uncompressed.
        "User-Agent":
          "Mozilla/5.0 (compatible; ZRPLinkPreview/1.0; +https://zrp.one)",
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
        "Accept-Encoding": "gzip, deflate, br",
      },
    });
    if (res.statusCode < 200 || res.statusCode >= 300) {
      return { preview: null, transient: true };
    }

    const contentType = (res.headers["content-type"] as string) || "";
    if (!contentType.includes("text/html")) {
      return { preview: null, transient: true };
    }

    const html = res.body.toString("utf-8");

    return { preview: parseHtmlMetadata(html, url), transient: false };
  } catch {
    return { preview: null, transient: true };
  }
}

export async function GET(req: NextRequest) {
  // Each preview request causes an outbound server-side fetch, so cap
  // how often a single client can trigger new lookups (cached results
  // above don't count against this, since they skip straight to the
  // early return).
  const limit = await rateLimit(req, { limit: 30, window: 60, type: "link-preview" });
  if (!limit.success) return limit.response;

  const { searchParams } = new URL(req.url);
  const rawUrl = searchParams.get("url");

  if (!rawUrl) {
    return NextResponse.json({ error: "Missing url parameter" }, { status: 400 });
  }

  let target: URL;
  try {
    target = new URL(rawUrl);
    if (target.protocol !== "http:" && target.protocol !== "https:") {
      throw new Error("Unsupported protocol");
    }
    if (target.username || target.password) {
      throw new Error("URLs with embedded credentials are not allowed");
    }
  } catch {
    return NextResponse.json({ error: "Invalid URL" }, { status: 400 });
  }

  const cacheKey = `link-preview:${target.toString()}`;
  const cached = await getCached<LinkPreview>(cacheKey);
  if (cached) {
    return NextResponse.json(cached);
  }

  let preview: LinkPreview | null = null;
  let transient = false;

  if (isYouTubeUrl(target.toString())) {
    preview = await fetchYouTubePreview(target.toString());
    if (!preview) {
      const generic = await fetchGenericPreview(target.toString());
      preview = generic.preview;
      transient = generic.transient;
    }
  } else {
    const generic = await fetchGenericPreview(target.toString());
    preview = generic.preview;
    transient = generic.transient;
  }

  if (!preview) {
    // Cache the "nothing found" result too (shorter TTL), so a broken/
    // slow link doesn't get re-fetched on every single render. Cache an
    // empty-shape object rather than a bare null - a cached `null` would
    // be falsy and look identical to "not cached yet", defeating the
    // whole point of caching the negative result.
    //
    // A transient failure (timeout, non-2xx, non-HTML, thrown error)
    // gets a much shorter TTL than a confirmed-empty page: the page was
    // never actually examined, so caching it for a full hour would lock
    // a link out of ever showing a preview just because its very first
    // fetch attempt hit a momentary block or a slow response.
    const empty: LinkPreview = { url: target.toString(), title: null, description: null, image: null, siteName: null, isVideo: false };
    await setCached(cacheKey, empty, transient ? 60 : 3600);
    return NextResponse.json(empty);
  }

  // Cache successful previews for a week - link preview content rarely
  // changes and this avoids hammering external sites on every post view.
  await setCached(cacheKey, preview, 60 * 60 * 24 * 7);
  return NextResponse.json(preview);
}
