// Shared @mention / #hashtag / URL tokenizer for user-generated text
// (posts, comments, messages, bios). Previously duplicated verbatim in
// PostCard.tsx and Feed/FeedItem.tsx; this is the single source those
// two now import, and the one every new text-rendering surface should
// use instead of writing a fourth copy.
//
// Deliberately only ever matches literal "http://"/"https://"/"www."
// prefixes - a javascript:/data:/vbscript: scheme can never appear in
// a ContentPart of type "url", since the regex has no branch that would
// match one. Content is always returned as plain string parts, never
// HTML, so a caller rendering them as React children gets React's own
// escaping for free - there is no dangerouslySetInnerHTML anywhere in
// this pipeline.
export type ContentPart =
  | { type: "text"; value: string }
  | { type: "hashtag"; value: string }
  | { type: "mention"; value: string }
  | { type: "url"; value: string };

const CONTENT_REGEX = /(@\w+)|(#\w+)|(https?:\/\/[^\s]+)|(www\.[^\s]+)/g;
const TRAILING_PUNCTUATION = /[.,!?;:'")\]}]+$/;

export function parseContent(content: string): ContentPart[] {
  const parts: ContentPart[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  CONTENT_REGEX.lastIndex = 0;
  while ((match = CONTENT_REGEX.exec(content)) !== null) {
    if (match.index > lastIndex) {
      parts.push({ type: "text", value: content.slice(lastIndex, match.index) });
    }

    const raw = match[0];
    const type: "hashtag" | "mention" | "url" = raw.startsWith("@")
      ? "mention"
      : raw.startsWith("#")
        ? "hashtag"
        : "url";

    if (type === "url") {
      const trailingMatch = raw.match(TRAILING_PUNCTUATION);
      const trimmed = trailingMatch ? raw.slice(0, raw.length - trailingMatch[0].length) : raw;

      if (trailingMatch && trimmed.length > 0) {
        parts.push({ type: "url", value: trimmed });
        parts.push({ type: "text", value: trailingMatch[0] });
        lastIndex = match.index + raw.length;
        continue;
      }
    }

    parts.push({ type, value: raw });
    lastIndex = match.index + raw.length;
  }

  if (lastIndex < content.length) {
    parts.push({ type: "text", value: content.slice(lastIndex) });
  }

  return parts;
}

// ZRP's own web hosts - a "url" part pointing at one of these (or at
// whatever origin the page is currently served from, which covers
// localhost/preview/staging) should navigate inside the SPA instead of
// leaving to an external browser tab. Every other URL is external.
const KNOWN_APP_HOSTS = ["zrp.one", "www.zrp.one"];

// Returns the internal path (e.g. "/profile/alice") a URL points to if
// it names this app's own site, or null if it's a genuine external URL.
// `raw` may be missing its scheme (the "www.example.com" match branch
// above never includes one) - always try as given first, since a bare
// "new URL('www.zrp.one')" throws.
export function getInternalPath(raw: string): string | null {
  const href = raw.startsWith("http") ? raw : `https://${raw}`;
  let parsed: URL;
  try {
    parsed = new URL(href);
  } catch {
    return null;
  }

  const host = parsed.hostname.toLowerCase();
  const isKnownHost = KNOWN_APP_HOSTS.includes(host);
  const isSameOrigin =
    typeof window !== "undefined" && window.location.hostname.toLowerCase() === host;

  if (!isKnownHost && !isSameOrigin) return null;

  return `${parsed.pathname}${parsed.search}${parsed.hash}` || "/";
}
