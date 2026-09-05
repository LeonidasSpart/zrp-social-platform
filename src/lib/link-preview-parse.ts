// Pure HTML-metadata parsing for the link-preview system
// (src/app/api/link-preview/route.ts). Kept network-free and dependency-
// free (regex-based, no HTML parser) so it's directly unit-testable and
// safe to run on truncated/partial HTML without throwing.

export interface LinkPreview {
  url: string;
  title: string | null;
  description: string | null;
  image: string | null;
  siteName: string | null;
  isVideo: boolean;
}

// A handful of named entities beyond the 5 predefined XML ones
// (&amp; &quot; &lt; &gt; &apos;/&#039;) show up constantly in real
// article titles/descriptions - smart quotes, em/en dashes, ellipses,
// non-breaking spaces - and would otherwise leak into the UI literally
// as "&rsquo;" etc. Numeric entities (&#39; and &#x27;) are decoded
// generically rather than one at a time.
const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  quot: '"',
  apos: "'",
  lt: "<",
  gt: ">",
  nbsp: " ",
  mdash: "—",
  ndash: "–",
  hellip: "…",
  lsquo: "‘",
  rsquo: "’",
  ldquo: "“",
  rdquo: "”",
};

export function decodeHtmlEntities(text: string): string {
  return text.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (entity, body) => {
    if (body[0] === "#") {
      const codePoint =
        body[1] === "x" || body[1] === "X"
          ? parseInt(body.slice(2), 16)
          : parseInt(body.slice(1), 10);
      if (Number.isNaN(codePoint)) return entity;
      try {
        return String.fromCodePoint(codePoint);
      } catch {
        return entity;
      }
    }
    const named = NAMED_ENTITIES[body.toLowerCase()];
    return named !== undefined ? named : entity;
  });
}

// ─── Extract a meta tag value by property/name, regex-based - good
// enough for the standard og:* / twitter:* tags virtually every site
// with a link preview sets. Handles both attribute orders
// (property="x" content="y" and content="y" property="x") and both
// `property=` (the OG spec) and `name=` (what a lot of real-world sites
// use for OG tags anyway, non-conformant but common) ───────────────────
export function extractMeta(html: string, keys: string[]): string | null {
  for (const key of keys) {
    const patterns = [
      new RegExp(`<meta[^>]+property=["']${key}["'][^>]+content=["']([^"']*)["']`, "i"),
      new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]+property=["']${key}["']`, "i"),
      new RegExp(`<meta[^>]+name=["']${key}["'][^>]+content=["']([^"']*)["']`, "i"),
      new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]+name=["']${key}["']`, "i"),
    ];
    for (const pattern of patterns) {
      const match = html.match(pattern);
      if (match?.[1]) {
        return decodeHtmlEntities(match[1]);
      }
    }
  }
  return null;
}

export function extractTitleTag(html: string): string | null {
  const match = html.match(/<title[^>]*>([^<]*)<\/title>/i);
  const raw = match?.[1]?.trim();
  return raw ? decodeHtmlEntities(raw) : null;
}

// A page indicates video content two ways in practice: an og:type of
// "video" or "video.other"/"video.movie"/etc (the OG video vertical),
// or a twitter:card of "player" (X/Twitter's own embedded-player
// signal, which publishers set for exactly this kind of preview). Both
// are just an indicator for the UI - never a signal to actually embed
// or fetch the video itself.
export function detectIsVideo(html: string): boolean {
  const ogType = extractMeta(html, ["og:type"]);
  if (ogType && ogType.toLowerCase().startsWith("video")) return true;

  const twitterCard = extractMeta(html, ["twitter:card"]);
  if (twitterCard && twitterCard.toLowerCase() === "player") return true;

  return false;
}

// Finds the first http(s)/www URL in free-form post text, for feed
// rendering to decide what to fetch a preview for. Deliberately only
// the first URL - a post with several links gets one primary preview
// card, matching the established single-preview-per-post behavior.
export function extractFirstUrl(content: string): string | null {
  const match = content.match(/(https?:\/\/[^\s]+)|(www\.[^\s]+)/);
  if (!match) return null;

  let raw = match[0].replace(/[.,!?;:'"\]}]+$/, "");

  // A trailing ')' is ambiguous: usually it's just the sentence closing
  // a parenthetical around the link ("(see https://x.com/y)") and
  // should be stripped, but some URLs legitimately end in one (e.g.
  // Wikipedia's `.../wiki/Example_(disambiguation)`). Only strip it
  // when the URL itself doesn't contain a matching, still-open '(' -
  // the same bracket-balance heuristic X's own linkifier uses.
  while (raw.endsWith(")")) {
    const opens = (raw.match(/\(/g) || []).length;
    const closes = (raw.match(/\)/g) || []).length;
    if (closes <= opens) break;
    raw = raw.slice(0, -1);
  }

  return raw.startsWith("http") ? raw : `https://${raw}`;
}

function resolveImageUrl(image: string | null, pageUrl: string): string | null {
  if (!image) return null;
  if (image.startsWith("http")) return image;
  try {
    // Resolve protocol-relative (//host/img.jpg) and root/path-relative
    // image URLs against the page they were found on.
    const base = new URL(pageUrl);
    return new URL(image, base.origin).toString();
  } catch {
    return null;
  }
}

/**
 * Builds the full LinkPreview shape from a fetched page's HTML, or
 * returns null when nothing usable was found (no title and no image) -
 * the caller's signal to fall back to the plain clickable URL rather
 * than showing an empty/broken preview container.
 */
export function parseHtmlMetadata(html: string, pageUrl: string): LinkPreview | null {
  const title = extractMeta(html, ["og:title", "twitter:title"]) || extractTitleTag(html);
  const description = extractMeta(html, ["og:description", "twitter:description", "description"]);
  const image = resolveImageUrl(
    extractMeta(html, ["og:image", "og:image:url", "twitter:image"]),
    pageUrl
  );
  let siteName = extractMeta(html, ["og:site_name"]);
  if (!siteName) {
    try {
      siteName = new URL(pageUrl).hostname.replace(/^www\./, "");
    } catch {
      siteName = null;
    }
  }

  if (!title && !image) return null;

  return { url: pageUrl, title, description, image, siteName, isVideo: detectIsVideo(html) };
}
