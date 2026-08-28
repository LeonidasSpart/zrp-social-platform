import sanitizeHtml from "sanitize-html";

/**
 * Strict allowlist for user/journalist-authored article HTML. Used
 * server-side, at write time, so stored content is safe for every
 * consumer (web client, any future API client) rather than relying on
 * each renderer to sanitize on the way out.
 */
const ARTICLE_HTML_OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: [
    "p", "br", "hr",
    "h1", "h2", "h3", "h4", "h5", "h6",
    "strong", "b", "em", "i", "u", "s", "sub", "sup", "mark", "blockquote",
    "ul", "ol", "li",
    "a", "img",
    "table", "thead", "tbody", "tr", "th", "td",
    "code", "pre",
  ],
  allowedAttributes: {
    a: ["href", "title", "target", "rel"],
    img: ["src", "alt", "title", "width", "height"],
    "*": ["class"],
  },
  allowedSchemes: ["http", "https", "mailto"],
  allowedSchemesByTag: {
    img: ["http", "https"],
  },
  transformTags: {
    // Force safe defaults on every link regardless of what was
    // submitted, so a stray `target="_blank"` can't be used for a
    // reverse-tabnabbing attack.
    a: sanitizeHtml.simpleTransform("a", { rel: "noopener noreferrer nofollow", target: "_blank" }),
  },
  disallowedTagsMode: "discard",
};

export function sanitizeArticleHtml(html: string): string {
  if (typeof html !== "string") return "";
  return sanitizeHtml(html, ARTICLE_HTML_OPTIONS);
}
