import { describe, it, expect } from "vitest";
import { parseFeed, cleanText, decodeXmlEntities, firstTagContent } from "../rss";

const RSS = `<?xml version="1.0"?>
<rss version="2.0" xmlns:media="http://search.yahoo.com/mrss/">
  <channel>
    <title>Example Wire</title>
    <item>
      <title><![CDATA[Geneva airport closed after overnight storm]]></title>
      <link>https://example.org/news/geneva-airport</link>
      <description><![CDATA[<p>Flights are suspended until <b>midday</b>.</p>]]></description>
      <pubDate>Tue, 03 Feb 2026 08:15:00 GMT</pubDate>
      <guid>https://example.org/news/geneva-airport</guid>
      <media:content url="https://cdn.example.org/geneva.jpg" type="image/jpeg" />
    </item>
    <item>
      <title>Rail strike enters second day</title>
      <link>https://example.org/news/rail-strike</link>
      <description>Services reduced across the network &amp; delays expected.</description>
    </item>
    <item>
      <title>Broken item with no link</title>
      <description>Nothing to attribute this to.</description>
    </item>
  </channel>
</rss>`;

const ATOM = `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>Authority Notices</title>
  <entry>
    <title>Travel advisory updated for Country A</title>
    <link rel="self" href="https://gov.example/feed.atom"/>
    <link rel="alternate" href="/advice/country-a"/>
    <summary>The advisory level has been revised.</summary>
    <published>2026-02-03T09:00:00Z</published>
    <id>tag:gov.example,2026:advice/country-a</id>
  </entry>
</feed>`;

describe("parseFeed (RSS 2.0)", () => {
  const items = parseFeed(RSS, { baseUrl: "https://example.org/feed.xml" });

  it("reads every item that has both a headline and a link", () => {
    expect(items).toHaveLength(2);
  });

  it("unwraps CDATA and strips the publisher's HTML out of the summary", () => {
    expect(items[0].title).toBe("Geneva airport closed after overnight storm");
    expect(items[0].summary).toBe("Flights are suspended until midday.");
    expect(items[0].summary).not.toContain("<");
  });

  it("decodes entities in a plain description", () => {
    expect(items[1].summary).toBe("Services reduced across the network & delays expected.");
  });

  it("reads the media:content image and the publication date", () => {
    expect(items[0].imageUrl).toBe("https://cdn.example.org/geneva.jpg");
    expect(items[0].publishedAt?.toISOString()).toBe("2026-02-03T08:15:00.000Z");
  });

  it("drops an item with no link rather than carrying an unattributable headline forward", () => {
    expect(items.some((item) => item.title.includes("Broken item"))).toBe(false);
  });
});

describe("parseFeed (Atom)", () => {
  const items = parseFeed(ATOM, { baseUrl: "https://gov.example/feed.atom" });

  it("prefers rel=alternate over rel=self and resolves it against the feed URL", () => {
    expect(items).toHaveLength(1);
    expect(items[0].link).toBe("https://gov.example/advice/country-a");
  });

  it("reads <summary> and <published>", () => {
    expect(items[0].summary).toBe("The advisory level has been revised.");
    expect(items[0].publishedAt?.toISOString()).toBe("2026-02-03T09:00:00.000Z");
  });
});

describe("parseFeed robustness", () => {
  it("returns an empty array for junk rather than throwing", () => {
    expect(parseFeed("not xml at all")).toEqual([]);
    expect(parseFeed("")).toEqual([]);
    expect(parseFeed("<rss><channel></channel></rss>")).toEqual([]);
  });

  it("caps how many items one fetch can yield", () => {
    const many = `<rss><channel>${Array.from(
      { length: 300 },
      (_, index) =>
        `<item><title>Story ${index}</title><link>https://example.org/${index}</link></item>`
    ).join("")}</channel></rss>`;

    expect(parseFeed(many).length).toBeLessThanOrEqual(40);
  });

  it("truncates a publisher's syndicated abstract so a full article is never retained", () => {
    const long = "word ".repeat(500);
    const feed = `<rss><channel><item><title>T</title><link>https://example.org/a</link><description>${long}</description></item></channel></rss>`;
    expect(parseFeed(feed)[0].summary!.length).toBeLessThanOrEqual(600);
  });

  it("ignores a publication date far in the future", () => {
    const feed = `<rss><channel><item><title>T</title><link>https://example.org/a</link><pubDate>Tue, 03 Feb 2099 08:15:00 GMT</pubDate></item></channel></rss>`;
    expect(parseFeed(feed)[0].publishedAt).toBeNull();
  });
});

describe("text helpers", () => {
  it("decodes named, decimal and hex entities", () => {
    expect(decodeXmlEntities("A &amp; B &#8211; C &#x2014; D &eacute;")).toBe("A & B – C — D é");
  });

  it("leaves an unknown entity alone rather than mangling it", () => {
    expect(decodeXmlEntities("&notarealentity;")).toBe("&notarealentity;");
  });

  it("collapses whitespace", () => {
    expect(cleanText("  a \n\n b  ")).toBe("a b");
  });

  it("ignores namespace prefixes when reading a tag", () => {
    expect(firstTagContent("<dc:title>Hi</dc:title>", "title")).toBe("Hi");
  });
});
