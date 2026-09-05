import { describe, it, expect } from "vitest";
import {
  extractMeta,
  extractTitleTag,
  detectIsVideo,
  parseHtmlMetadata,
  extractFirstUrl,
  decodeHtmlEntities,
} from "../link-preview-parse";

describe("extractMeta", () => {
  it("matches property=then-content and content=then-property order", () => {
    expect(
      extractMeta('<meta property="og:title" content="Hello World">', ["og:title"])
    ).toBe("Hello World");
    expect(
      extractMeta('<meta content="Hello World" property="og:title">', ["og:title"])
    ).toBe("Hello World");
  });

  it("also matches name= (non-conformant but common in the wild)", () => {
    expect(
      extractMeta('<meta name="twitter:title" content="Hi">', ["twitter:title"])
    ).toBe("Hi");
  });

  it("decodes common HTML entities in the content value", () => {
    expect(
      extractMeta('<meta property="og:title" content="Cat &amp; Dog &quot;Show&quot;">', ["og:title"])
    ).toBe('Cat & Dog "Show"');
  });

  it("falls through to the next key when the first is present but empty", () => {
    const html = '<meta property="og:image" content=""><meta property="og:image:url" content="https://x.com/y.jpg">';
    expect(extractMeta(html, ["og:image", "og:image:url"])).toBe("https://x.com/y.jpg");
  });

  it("returns null when no candidate key is present", () => {
    expect(extractMeta("<html><head></head></html>", ["og:title"])).toBeNull();
  });
});

describe("extractTitleTag", () => {
  it("extracts the document <title>", () => {
    expect(extractTitleTag("<title>My Page</title>")).toBe("My Page");
  });

  it("returns null when there is no title tag", () => {
    expect(extractTitleTag("<html><body>hi</body></html>")).toBeNull();
  });

  it("decodes HTML entities, same as extractMeta (real <title> tags routinely contain them)", () => {
    expect(extractTitleTag("<title>Firma &amp; Co. &mdash; News</title>")).toBe(
      "Firma & Co. — News"
    );
  });
});

describe("decodeHtmlEntities", () => {
  it("decodes the 5 predefined XML entities", () => {
    expect(decodeHtmlEntities("A &amp; B &lt;tag&gt; &quot;q&quot; &apos;s&apos;")).toBe(
      `A & B <tag> "q" 's'`
    );
  });

  it("decodes named entities common in real article titles (dashes, quotes, ellipsis, nbsp)", () => {
    expect(decodeHtmlEntities("Wait&hellip;")).toBe("Wait…");
    expect(decodeHtmlEntities("2020&ndash;2024")).toBe("2020–2024");
    expect(decodeHtmlEntities("A&mdash;B")).toBe("A—B");
    expect(decodeHtmlEntities("&lsquo;hi&rsquo; &ldquo;there&rdquo;")).toBe("‘hi’ “there”");
    expect(decodeHtmlEntities("a&nbsp;b")).toBe("a b");
  });

  it("decodes decimal numeric entities", () => {
    expect(decodeHtmlEntities("&#39;s")).toBe("'s");
    expect(decodeHtmlEntities("&#8217;s")).toBe("’s");
  });

  it("decodes hex numeric entities", () => {
    expect(decodeHtmlEntities("&#x27;s")).toBe("'s");
  });

  it("leaves unknown entities and plain text untouched", () => {
    expect(decodeHtmlEntities("plain text")).toBe("plain text");
    expect(decodeHtmlEntities("&notarealentity;")).toBe("&notarealentity;");
  });
});

describe("detectIsVideo", () => {
  it("detects og:type=video and its subtypes", () => {
    expect(detectIsVideo('<meta property="og:type" content="video">')).toBe(true);
    expect(detectIsVideo('<meta property="og:type" content="video.other">')).toBe(true);
    expect(detectIsVideo('<meta property="og:type" content="video.movie">')).toBe(true);
  });

  it("detects twitter:card=player", () => {
    expect(detectIsVideo('<meta name="twitter:card" content="player">')).toBe(true);
  });

  it("returns false for an ordinary article page", () => {
    expect(detectIsVideo('<meta property="og:type" content="article">')).toBe(false);
    expect(detectIsVideo("<html></html>")).toBe(false);
  });
});

describe("parseHtmlMetadata", () => {
  it("resolves title/description/image/siteName from Open Graph tags (the 20min.ch case: video article with full OG)", () => {
    const html = `
      <html><head>
        <meta property="og:title" content="Canton de Soleure: bloquee par une voiture">
        <meta property="og:description" content="Elle opte pour la maniere forte">
        <meta property="og:image" content="https://img.20min.ch/photo.jpg">
        <meta property="og:site_name" content="20 minutes">
        <meta property="og:type" content="video.other">
      </head></html>`;
    const result = parseHtmlMetadata(html, "https://www.20min.ch/fr/video/example-123");
    expect(result).toEqual({
      url: "https://www.20min.ch/fr/video/example-123",
      title: "Canton de Soleure: bloquee par une voiture",
      description: "Elle opte pour la maniere forte",
      image: "https://img.20min.ch/photo.jpg",
      siteName: "20 minutes",
      isVideo: true,
    });
  });

  it("falls back to twitter:* tags when Open Graph is absent", () => {
    const html = `
      <meta name="twitter:title" content="Twitter-only title">
      <meta name="twitter:image" content="https://x.com/img.png">`;
    const result = parseHtmlMetadata(html, "https://example.com/page");
    expect(result?.title).toBe("Twitter-only title");
    expect(result?.image).toBe("https://x.com/img.png");
  });

  it("falls back to the <title> tag when no og:title/twitter:title exists", () => {
    const html = "<title>Plain Title</title>";
    const result = parseHtmlMetadata(html, "https://example.com/page");
    expect(result?.title).toBe("Plain Title");
  });

  it("falls back to the hostname (without www.) when og:site_name is absent", () => {
    const html = '<meta property="og:title" content="X">';
    const result = parseHtmlMetadata(html, "https://www.example.com/page");
    expect(result?.siteName).toBe("example.com");
  });

  it("resolves a root-relative image URL against the page's origin", () => {
    const html = '<meta property="og:title" content="X"><meta property="og:image" content="/img/photo.jpg">';
    const result = parseHtmlMetadata(html, "https://example.com/articles/1");
    expect(result?.image).toBe("https://example.com/img/photo.jpg");
  });

  it("handles a title with no image at all (still usable)", () => {
    const html = '<meta property="og:title" content="Title Only">';
    const result = parseHtmlMetadata(html, "https://example.com/page");
    expect(result).not.toBeNull();
    expect(result?.image).toBeNull();
  });

  it("returns null (never throws) when the page has no usable metadata at all", () => {
    const html = "<html><head></head><body>nothing here</body></html>";
    expect(parseHtmlMetadata(html, "https://example.com/page")).toBeNull();
  });

  it("returns null gracefully on malformed/truncated HTML", () => {
    const html = '<html><head><meta property="og:tit';
    expect(() => parseHtmlMetadata(html, "https://example.com/page")).not.toThrow();
    expect(parseHtmlMetadata(html, "https://example.com/page")).toBeNull();
  });
});

describe("extractFirstUrl", () => {
  it("extracts a plain https URL", () => {
    expect(extractFirstUrl("check this out https://example.com/article")).toBe(
      "https://example.com/article"
    );
  });

  it("extracts a bare www. URL and adds https://", () => {
    expect(extractFirstUrl("see www.example.com/page")).toBe("https://www.example.com/page");
  });

  it("preserves query parameters and fragments", () => {
    expect(
      extractFirstUrl("https://example.com/a?x=1&y=2#section")
    ).toBe("https://example.com/a?x=1&y=2#section");
  });

  it("strips trailing sentence punctuation", () => {
    expect(extractFirstUrl("Look at https://example.com/a.")).toBe("https://example.com/a");
    expect(extractFirstUrl("Is this real? https://example.com/a!")).toBe("https://example.com/a");
  });

  it("strips a wrapping trailing parenthesis that isn't part of the URL", () => {
    expect(extractFirstUrl("(see https://example.com/a)")).toBe("https://example.com/a");
  });

  it("keeps a trailing parenthesis that's balanced within the URL itself (Wikipedia-style)", () => {
    expect(
      extractFirstUrl("https://en.wikipedia.org/wiki/Example_(disambiguation)")
    ).toBe("https://en.wikipedia.org/wiki/Example_(disambiguation)");
  });

  it("only returns the first URL when a post contains multiple", () => {
    expect(
      extractFirstUrl("https://example.com/first and https://example.com/second")
    ).toBe("https://example.com/first");
  });

  it("does not treat plain text as a URL", () => {
    expect(extractFirstUrl("just a normal post with no links")).toBeNull();
  });

  it("returns null for empty content", () => {
    expect(extractFirstUrl("")).toBeNull();
  });
});
