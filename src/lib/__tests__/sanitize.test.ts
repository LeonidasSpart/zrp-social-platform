import { describe, it, expect } from "vitest";
import { sanitizeArticleHtml } from "../sanitize";

describe("sanitizeArticleHtml", () => {
  it("strips <script> tags entirely", () => {
    const out = sanitizeArticleHtml('<p>hello</p><script>alert(1)</script>');
    expect(out).not.toContain("<script");
    expect(out).not.toContain("alert(1)");
    expect(out).toContain("<p>hello</p>");
  });

  it("strips inline event-handler attributes (XSS via onerror/onclick)", () => {
    const out = sanitizeArticleHtml('<img src="x.png" onerror="alert(1)">');
    expect(out).not.toContain("onerror");
  });

  it("strips javascript: URLs in links", () => {
    const out = sanitizeArticleHtml('<a href="javascript:alert(1)">click</a>');
    expect(out).not.toContain("javascript:");
  });

  it("forces safe rel/target on links regardless of what was submitted", () => {
    const out = sanitizeArticleHtml('<a href="https://example.com">link</a>');
    expect(out).toContain('rel="noopener noreferrer nofollow"');
  });

  it("keeps ordinary formatting tags intact", () => {
    const out = sanitizeArticleHtml("<h1>Title</h1><p><strong>bold</strong> and <em>italic</em></p>");
    expect(out).toContain("<h1>Title</h1>");
    expect(out).toContain("<strong>bold</strong>");
    expect(out).toContain("<em>italic</em>");
  });

  it("drops disallowed tags like <iframe> and <object>", () => {
    const out = sanitizeArticleHtml('<iframe src="https://evil.example"></iframe><object data="x"></object>');
    expect(out).not.toContain("<iframe");
    expect(out).not.toContain("<object");
  });

  it("handles non-string input safely", () => {
    // @ts-expect-error - deliberately testing a bad input type
    expect(sanitizeArticleHtml(null)).toBe("");
    // @ts-expect-error
    expect(sanitizeArticleHtml(undefined)).toBe("");
  });
});
