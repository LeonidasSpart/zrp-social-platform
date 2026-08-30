import { describe, it, expect } from "vitest";
import { sanitizeArticleHtml, renderArticleBody } from "../sanitize";

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

describe("renderArticleBody", () => {
  it("converts a blank-line-separated paragraph into its own <p>", () => {
    const out = renderArticleBody("First paragraph.\n\nSecond paragraph.");
    expect(out).toContain("<p>First paragraph.</p>");
    expect(out).toContain("<p>Second paragraph.</p>");
  });

  it("converts a single newline within a paragraph into a <br>", () => {
    const out = renderArticleBody("Line one.\nLine two.");
    expect(out).toContain("<br");
  });

  it("converts # headings and **bold**/*italic* markdown syntax", () => {
    const out = renderArticleBody("# Our Mission\n\nWe believe **technology** should serve *people*.");
    expect(out).toContain("<h1>Our Mission</h1>");
    expect(out).toContain("<strong>technology</strong>");
    expect(out).toContain("<em>people</em>");
  });

  it("converts markdown lists", () => {
    const out = renderArticleBody("- one\n- two\n- three");
    expect(out).toContain("<ul>");
    expect(out).toContain("<li>one</li>");
  });

  it("still strips a <script> tag typed directly as raw HTML", () => {
    const out = renderArticleBody("Hello\n\n<script>alert(1)</script>");
    expect(out).not.toContain("<script");
    expect(out).not.toContain("alert(1)");
  });

  it("still strips an onerror handler on a markdown image", () => {
    const out = renderArticleBody('<img src="x.png" onerror="alert(1)">');
    expect(out).not.toContain("onerror");
  });

  it("returns an empty string for empty or non-string input", () => {
    expect(renderArticleBody("")).toBe("");
    expect(renderArticleBody("   ")).toBe("");
    // @ts-expect-error - deliberately testing a bad input type
    expect(renderArticleBody(null)).toBe("");
  });
});
