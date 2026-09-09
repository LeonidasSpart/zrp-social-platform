import type { RawFeedItem } from "./types";

/*
 * ============================================================
 * Minimal, dependency-free RSS 2.0 / Atom parser
 * ============================================================
 *
 * Deliberately not a general XML parser and deliberately not a new npm
 * dependency: we only ever read a handful of well-known elements from a
 * publisher's own syndication feed, and a parser we own is a parser
 * whose failure modes we can test. It is tolerant by design - a feed
 * with one malformed entry must still yield the rest rather than
 * throwing away the whole fetch.
 *
 * What it extracts is only ever what the publisher chose to syndicate:
 * headline, their own short description, link, timestamp and any
 * declared preview image. Full article text is never fetched, parsed,
 * stored or republished anywhere in this system.
 */

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  ndash: "–",
  mdash: "—",
  lsquo: "‘",
  rsquo: "’",
  ldquo: "“",
  rdquo: "”",
  hellip: "…",
  eacute: "é",
  egrave: "è",
  agrave: "à",
  uuml: "ü",
  ouml: "ö",
  auml: "ä",
  szlig: "ß",
  ccedil: "ç",
};

export function decodeXmlEntities(text: string): string {
  return text.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (match, entity: string) => {
    if (entity.startsWith("#x") || entity.startsWith("#X")) {
      const code = parseInt(entity.slice(2), 16);
      return Number.isFinite(code) && code > 0 ? String.fromCodePoint(code) : match;
    }
    if (entity.startsWith("#")) {
      const code = parseInt(entity.slice(1), 10);
      return Number.isFinite(code) && code > 0 ? String.fromCodePoint(code) : match;
    }
    const named = NAMED_ENTITIES[entity.toLowerCase()];
    return named !== undefined ? named : match;
  });
}

/** Strips CDATA wrappers, any embedded markup, and collapses whitespace. */
export function cleanText(raw: string | null): string {
  if (!raw) return "";
  let text = raw;
  // Unwrap every CDATA section (a description may contain several).
  text = text.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1");
  // Publishers routinely put HTML inside <description>. We want the
  // words only - we are writing our own summary, not reusing theirs.
  text = text.replace(/<br\s*\/?>/gi, " ");
  text = text.replace(/<\/p>/gi, " ");
  text = text.replace(/<[^>]*>/g, "");
  text = decodeXmlEntities(text);
  return text.replace(/\s+/g, " ").trim();
}

/**
 * Returns the text content of the first `<tag>` inside `xml`, ignoring
 * any XML namespace prefix. Attributes on the opening tag are allowed.
 */
export function firstTagContent(xml: string, tag: string): string | null {
  const pattern = new RegExp(
    `<(?:[A-Za-z0-9_-]+:)?${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</(?:[A-Za-z0-9_-]+:)?${tag}>`,
    "i"
  );
  const match = xml.match(pattern);
  return match ? match[1] : null;
}

function attributeValue(tagMarkup: string, attribute: string): string | null {
  const pattern = new RegExp(`\\s${attribute}\\s*=\\s*("([^"]*)"|'([^']*)')`, "i");
  const match = tagMarkup.match(pattern);
  if (!match) return null;
  return match[2] ?? match[3] ?? null;
}

/** Splits a document into the raw markup of each <item>/<entry>. */
function extractEntries(xml: string): string[] {
  const entries: string[] = [];
  const pattern =
    /<(?:[A-Za-z0-9_-]+:)?(item|entry)(?:\s[^>]*)?>([\s\S]*?)<\/(?:[A-Za-z0-9_-]+:)?\1>/gi;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(xml)) !== null) {
    entries.push(match[2]);
    // Hard stop: a hostile or runaway feed must not be able to make one
    // fetch expensive. Feeds carry tens of items, never thousands.
    if (entries.length >= 200) break;
  }
  return entries;
}

function extractLink(entry: string, baseUrl: string | null): string | null {
  // RSS: <link>https://...</link>
  const rssLink = cleanText(firstTagContent(entry, "link"));
  if (rssLink && /^https?:\/\//i.test(rssLink)) return rssLink;

  // Atom: <link rel="alternate" href="https://..."/>. Prefer an
  // explicit alternate; fall back to the first href that is not an
  // enclosure/self link.
  const linkTags = entry.match(/<(?:[A-Za-z0-9_-]+:)?link\b[^>]*>/gi) || [];
  let fallback: string | null = null;
  for (const tag of linkTags) {
    const href = attributeValue(tag, "href");
    if (!href) continue;
    const rel = (attributeValue(tag, "rel") || "alternate").toLowerCase();
    if (rel === "alternate") return resolveUrl(href, baseUrl);
    if (rel !== "self" && rel !== "enclosure" && !fallback) fallback = href;
  }
  if (fallback) return resolveUrl(fallback, baseUrl);

  // Some feeds only carry a permalink guid.
  const guidTag = entry.match(/<(?:[A-Za-z0-9_-]+:)?guid\b[^>]*>/i)?.[0] ?? "";
  const isPermaLink = (attributeValue(guidTag, "isPermaLink") || "").toLowerCase() !== "false";
  const guid = cleanText(firstTagContent(entry, "guid"));
  if (isPermaLink && guid && /^https?:\/\//i.test(guid)) return guid;

  return null;
}

function resolveUrl(href: string, baseUrl: string | null): string | null {
  if (/^https?:\/\//i.test(href)) return href;
  if (!baseUrl) return null;
  try {
    return new URL(href, baseUrl).toString();
  } catch {
    return null;
  }
}

function extractImage(entry: string): string | null {
  // media:content / media:thumbnail (MRSS), then <enclosure type="image/...">.
  const candidates = entry.match(
    /<(?:[A-Za-z0-9_-]+:)?(?:content|thumbnail|enclosure)\b[^>]*>/gi
  ) || [];
  for (const tag of candidates) {
    const url = attributeValue(tag, "url") || attributeValue(tag, "href");
    if (!url || !/^https?:\/\//i.test(url)) continue;
    const type = (attributeValue(tag, "type") || "").toLowerCase();
    const medium = (attributeValue(tag, "medium") || "").toLowerCase();
    if (type.startsWith("image/") || medium === "image" || /\.(jpe?g|png|webp|gif)(\?|$)/i.test(url)) {
      return url;
    }
  }
  return null;
}

function parseDate(value: string | null): Date | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) return null;
  // A feed claiming a publication date far in the future is either
  // broken or gaming freshness ranking; treat it as unknown.
  if (parsed.getTime() > Date.now() + 24 * 60 * 60 * 1000) return null;
  return parsed;
}

export interface ParseFeedOptions {
  /** Used to resolve relative Atom hrefs. */
  baseUrl?: string | null;
  /** Cap on returned items (default 40). */
  maxItems?: number;
}

/**
 * Parses an RSS 2.0 or Atom document into feed items. Never throws:
 * an unparseable document yields an empty array, which the caller
 * records as a source failure rather than a crash.
 */
export function parseFeed(xml: string, options: ParseFeedOptions = {}): RawFeedItem[] {
  const { baseUrl = null, maxItems = 40 } = options;
  if (typeof xml !== "string" || !xml.trim()) return [];

  const items: RawFeedItem[] = [];

  for (const entry of extractEntries(xml)) {
    const title = cleanText(firstTagContent(entry, "title"));
    const link = extractLink(entry, baseUrl);

    // Both are mandatory: a headline we cannot attribute to a source
    // URL can never be published, so it is dropped here rather than
    // travelling further down the pipeline.
    if (!title || !link) continue;

    const summary =
      cleanText(firstTagContent(entry, "description")) ||
      cleanText(firstTagContent(entry, "summary")) ||
      // Atom <content> is the publisher's own syndicated abstract in
      // most feeds; truncated below so we never retain article-length
      // text even when a publisher syndicates the whole piece.
      cleanText(firstTagContent(entry, "content")) ||
      "";

    const publishedAt =
      parseDate(firstTagContent(entry, "pubDate")) ??
      parseDate(firstTagContent(entry, "published")) ??
      parseDate(firstTagContent(entry, "updated")) ??
      parseDate(firstTagContent(entry, "date"));

    items.push({
      title: title.slice(0, 400),
      link,
      // 600 characters is enough context to write a factual 2-4
      // paragraph summary from and far short of reproducing a
      // copyrighted article.
      summary: summary ? summary.slice(0, 600) : null,
      publishedAt,
      imageUrl: extractImage(entry),
      guid: cleanText(firstTagContent(entry, "guid")) || cleanText(firstTagContent(entry, "id")) || null,
    });

    if (items.length >= maxItems) break;
  }

  return items;
}
