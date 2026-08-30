import sanitizeHtml from "sanitize-html";
import { marked } from "marked";

marked.setOptions({
  // A single Enter in the composer's plain textarea should produce a
  // line break, not be silently swallowed like strict CommonMark does.
  breaks: true,
  gfm: true,
});

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

/**
 * Renders Markdown (and any raw HTML mixed into it) typed into an
 * article composer, then runs the result through the same allowlist
 * as sanitizeArticleHtml() so the stored body is safe regardless of
 * which syntax the author used.
 */
export function renderArticleBody(raw: string): string {
  if (typeof raw !== "string" || !raw.trim()) return "";
  const html = marked.parse(raw, { async: false });
  return sanitizeArticleHtml(html);
}
