import { NextRequest, NextResponse } from "next/server";
import { getCached, setCached } from "@/lib/redis";
import { safeFetch, SsrfBlockedError } from "@/lib/ssrf-guard";
import { rateLimit } from "@/lib/rate-limit";

interface LinkPreview {
  url: string;
  title: string | null;
  description: string | null;
  image: string | null;
  siteName: string | null;
}

// ─── Extract a meta tag value by property/name, regex-based (no HTML
// parser dependency) - good enough for the standard og:* / twitter:*
// tags virtually every site with a link preview sets ─────────────────
function extractMeta(html: string, keys: string[]): string | null {
  for (const key of keys) {
    // Handles both attribute orders: property="x" content="y" and
    // content="y" property="x"
    const patterns = [
      new RegExp(`<meta[^>]+property=["']${key}["'][^>]+content=["']([^"']*)["']`, "i"),
      new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]+property=["']${key}["']`, "i"),
      new RegExp(`<meta[^>]+name=["']${key}["'][^>]+content=["']([^"']*)["']`, "i"),
      new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]+name=["']${key}["']`, "i"),
    ];
    for (const pattern of patterns) {
      const match = html.match(pattern);
      if (match?.[1]) {
        return match[1]
          .replace(/&amp;/g, "&")
          .replace(/&quot;/g, '"')
          .replace(/&#039;/g, "'")
          .replace(/&lt;/g, "<")
          .replace(/&gt;/g, ">");
      }
    }
  }
  return null;
}

function extractTitleTag(html: string): string | null {
  const match = html.match(/<title[^>]*>([^<]*)<\/title>/i);
  return match?.[1]?.trim() || null;
}

async function fetchYouTubePreview(url: string): Promise<LinkPreview | null> {
  try {
    const oembedUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`;
    // youtube.com is a fixed, trusted host, but route it through the
    // same guarded fetch for consistency and the same size/time caps.
    const res = await safeFetch(oembedUrl, { timeoutMs: 5000, maxBytes: 50_000 });
    if (res.statusCode < 200 || res.statusCode >= 300) return null;
    const data = JSON.parse(res.body.toString("utf-8"));
    // oEmbed doesn't return a direct thumbnail field consistently across
    // all video states, so derive it from the video id instead.
    const videoId = url.match(/(?:v=|youtu\.be\/|embed\/)([a-zA-Z0-9_-]{11})/)?.[1];
    return {
      url,
      title: data.title || null,
      description: null,
      image: videoId ? `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg` : null,
      siteName: "YouTube",
    };
  } catch {
    return null;
  }
}

async function fetchGenericPreview(url: string): Promise<LinkPreview | null> {
  try {
    const res = await safeFetch(url, {
      timeoutMs: 6000,
      maxBytes: 200_000,
      headers: {
        // Many sites serve minimal/no OG tags to unrecognized bots -
        // a normal browser UA gets the real page most reliably.
        "User-Agent":
          "Mozilla/5.0 (compatible; ZRPLinkPreview/1.0; +https://zrp.one)",
        Accept: "text/html,application/xhtml+xml",
      },
    });
    if (res.statusCode < 200 || res.statusCode >= 300) return null;

    const contentType = (res.headers["content-type"] as string) || "";
    if (!contentType.includes("text/html")) return null;

    const html = res.body.toString("utf-8");

    const title =
      extractMeta(html, ["og:title", "twitter:title"]) || extractTitleTag(html);
    const description = extractMeta(html, ["og:description", "twitter:description", "description"]);
    let image = extractMeta(html, ["og:image", "og:image:url", "twitter:image"]);
    const siteName = extractMeta(html, ["og:site_name"]) || new URL(url).hostname.replace(/^www\./, "");

    if (image && !image.startsWith("http")) {
      // Resolve protocol-relative or root-relative image URLs
      const base = new URL(url);
      image = new URL(image, base.origin).toString();
    }

    if (!title && !image) return null;

    return { url, title, description, image, siteName };
  } catch {
    return null;
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

  const isYouTube =
    target.hostname === "youtube.com" ||
    target.hostname === "www.youtube.com" ||
    target.hostname === "youtu.be" ||
    target.hostname === "m.youtube.com";

  const preview = isYouTube
    ? (await fetchYouTubePreview(target.toString())) || (await fetchGenericPreview(target.toString()))
    : await fetchGenericPreview(target.toString());

  if (!preview) {
    // Cache the "nothing found" result too (shorter TTL), so a broken/
    // slow link doesn't get re-fetched on every single render. Cache an
    // empty-shape object rather than a bare null - a cached `null` would
    // be falsy and look identical to "not cached yet", defeating the
    // whole point of caching the negative result.
    const empty: LinkPreview = { url: target.toString(), title: null, description: null, image: null, siteName: null };
    await setCached(cacheKey, empty, 3600);
    return NextResponse.json(empty);
  }

  // Cache successful previews for a week - link preview content rarely
  // changes and this avoids hammering external sites on every post view.
  await setCached(cacheKey, preview, 60 * 60 * 24 * 7);
  return NextResponse.json(preview);
}
