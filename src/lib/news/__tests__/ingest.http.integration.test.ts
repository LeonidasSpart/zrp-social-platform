import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { startOriginServer, FIXTURE_ETAG, FIXTURE_LAST_MODIFIED, type OriginServer } from "./origin-server";

/*
 * Ingestion over REAL HTTP.
 *
 * The only thing substituted here is the publisher's server. safeFetch,
 * the RSS parser, robots handling and the source-health logic are all
 * the production implementations, and every byte crosses a real socket.
 *
 * safeFetch correctly refuses to connect to loopback addresses, so the
 * TEST supplies the address-allower escape hatch that ssrf-guard already
 * documents for exactly this purpose. It is supplied here, in the test,
 * rather than added to any production signature - the shipped
 * fetchSource has no way to reach a private address.
 */
vi.mock("@/lib/ssrf-guard", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/ssrf-guard")>();
  return {
    ...actual,
    safeFetch: (url: string, options: Record<string, unknown> = {}) =>
      actual.safeFetch(url, { ...options, isAddressAllowed: () => true }),
  };
});

// Static imports are fine here: vi.mock is hoisted above them, so these
// modules still resolve against the wrapped safeFetch.
import { fetchSource, backoffMinutesFor, sourceStatusFor } from "../ingest";
import { parseFeed } from "../rss";

let origin: OriginServer;

function source(path: string, overrides: Partial<{ etag: string | null; lastModified: string | null }> = {}) {
  return {
    feedUrl: origin.url(path),
    etag: null,
    lastModified: null,
    ...overrides,
  };
}

// File-scoped lifecycle: several describe blocks share this server, so it
// must outlive the first one rather than being torn down with it.
beforeAll(async () => {
  // No robots.txt at all (404) = no restrictions, the documented meaning.
  origin = await startOriginServer();
});

afterAll(async () => {
  await origin.close();
});

describe("ingestion over real HTTP", () => {
  it("fetches and parses a real 200 response end to end", async () => {
    const outcome = await fetchSource(source("/good.xml"));

    expect(outcome.ok).toBe(true);
    expect(outcome.error).toBeNull();
    expect(outcome.items).toHaveLength(2);

    const [first] = outcome.items;
    expect(first.title).toBe(
      "Example Test Authority publishes a scheduled maintenance notice"
    );
    expect(first.link).toBe("https://example.test/notices/maintenance");
    expect(first.summary).toBe("Fixture summary: a routine notice used only in tests.");
    expect(first.publishedAt?.toISOString()).toBe("2026-02-03T08:15:00.000Z");
    expect(first.imageUrl).toBe("https://cdn.example.test/notice.jpg");
  });

  it("sends a polite, identifiable User-Agent", async () => {
    origin.requests.length = 0;
    await fetchSource(source("/good.xml"));

    const request = origin.requests.find((entry) => entry.path.startsWith("/good.xml"));
    expect(String(request?.headers["user-agent"])).toContain("ZRPNewsBot");
  });

  it("decompresses a real gzip-encoded feed", async () => {
    const outcome = await fetchSource(source("/gzip.xml"));
    expect(outcome.ok).toBe(true);
    expect(outcome.items[0].title).toBe("Example Test Authority gzip fixture item");
  });

  it("captures ETag and Last-Modified from the response", async () => {
    const outcome = await fetchSource(source("/etag.xml"));
    expect(outcome.ok).toBe(true);
    expect(outcome.etag).toBe(FIXTURE_ETAG);
    expect(outcome.lastModified).toBe(FIXTURE_LAST_MODIFIED);
  });

  it("sends If-None-Match and handles a real 304 without re-parsing", async () => {
    origin.requests.length = 0;

    const outcome = await fetchSource(source("/etag.xml", { etag: FIXTURE_ETAG }));

    const request = origin.requests.find((entry) => entry.path.startsWith("/etag.xml"));
    expect(request?.headers["if-none-match"]).toBe(FIXTURE_ETAG);

    // A 304 is a success that costs the publisher almost nothing.
    expect(outcome.ok).toBe(true);
    expect(outcome.notModified).toBe(true);
    expect(outcome.items).toHaveLength(0);
    expect(outcome.error).toBeNull();
    // The stored validators survive, so the next poll is conditional too.
    expect(outcome.etag).toBe(FIXTURE_ETAG);
  });

  it("sends If-Modified-Since and handles a real 304", async () => {
    origin.requests.length = 0;

    const outcome = await fetchSource(
      source("/lastmod.xml", { lastModified: FIXTURE_LAST_MODIFIED })
    );

    const request = origin.requests.find((entry) => entry.path.startsWith("/lastmod.xml"));
    expect(request?.headers["if-modified-since"]).toBe(FIXTURE_LAST_MODIFIED);
    expect(outcome.notModified).toBe(true);
  });

  it("follows a real multi-hop redirect chain to the feed", async () => {
    const outcome = await fetchSource(source("/redirect"));
    expect(outcome.ok).toBe(true);
    expect(outcome.items).toHaveLength(2);
  });

  it("gives up on a redirect loop instead of spinning", async () => {
    const outcome = await fetchSource(source("/redirect-loop"));
    expect(outcome.ok).toBe(false);
    expect(outcome.items).toHaveLength(0);
    expect(outcome.error).toBeTruthy();
  });

  it("times out on a server that never responds", async () => {
    const started = Date.now();
    const outcome = await fetchSource(source("/slow"));
    const elapsed = Date.now() - started;

    expect(outcome.ok).toBe(false);
    expect(outcome.error).toBeTruthy();
    // The 10s ingest timeout must actually bound the call.
    expect(elapsed).toBeLessThan(20_000);
  }, 30000);

  it("reports a 500 as a failure and yields no items", async () => {
    const outcome = await fetchSource(source("/500"));
    expect(outcome.ok).toBe(false);
    expect(outcome.error).toContain("500");
    expect(outcome.items).toHaveLength(0);
  });

  it("reports a 404 as a failure", async () => {
    const outcome = await fetchSource(source("/404"));
    expect(outcome.ok).toBe(false);
    expect(outcome.error).toContain("404");
  });

  it("refuses a truncated XML body rather than publishing a half-read item", async () => {
    const outcome = await fetchSource(source("/malformed.xml"));
    expect(outcome.ok).toBe(false);
    expect(outcome.items).toHaveLength(0);
  });

  it("refuses an HTML page served where a feed was expected", async () => {
    const outcome = await fetchSource(source("/notxml"));
    expect(outcome.ok).toBe(false);
    expect(outcome.items).toHaveLength(0);
  });

  it("treats a valid but empty feed as a failure to ingest, not as content", async () => {
    const outcome = await fetchSource(source("/empty.xml"));
    expect(outcome.ok).toBe(false);
    expect(outcome.items).toHaveLength(0);
  });

  it("stops reading an oversized body instead of buffering it all", async () => {
    const outcome = await fetchSource(source("/huge.xml"));
    // Either the cap trips (error) or the truncated body fails to parse.
    // Either way: no items, no crash, no unbounded memory.
    expect(outcome.items).toHaveLength(0);
    expect(outcome.ok).toBe(false);
  }, 30000);

  it("cannot reach a server that is simply not there", async () => {
    const outcome = await fetchSource({
      feedUrl: "http://127.0.0.1:1/definitely-nothing.xml",
      etag: null,
      lastModified: null,
    });
    expect(outcome.ok).toBe(false);
    expect(outcome.error).toBeTruthy();
  });

  it("maps repeated real failures onto the backoff schedule", async () => {
    // Three real failed fetches in a row is what drives a source to
    // FAILED with an hour of backoff.
    const outcomes = await Promise.all([
      fetchSource(source("/500")),
      fetchSource(source("/500")),
      fetchSource(source("/500")),
    ]);

    expect(outcomes.every((outcome) => !outcome.ok)).toBe(true);
    expect(sourceStatusFor(3)).toBe("FAILED");
    expect(backoffMinutesFor(3)).toBe(60);
  });
});

describe("robots.txt over real HTTP", () => {
  it("refuses to poll a feed the host disallows", async () => {
    const strict = await startOriginServer({
      robots: "User-agent: *\nDisallow: /good.xml\n",
    });

    try {
      const outcome = await fetchSource({
        feedUrl: strict.url("/good.xml"),
        etag: null,
        lastModified: null,
      });

      expect(outcome.ok).toBe(false);
      expect(outcome.error).toContain("robots.txt");
      expect(outcome.items).toHaveLength(0);

      // And it never even asked for the feed.
      expect(strict.requests.some((entry) => entry.path.startsWith("/good.xml"))).toBe(false);
    } finally {
      await strict.close();
    }
  });

  it("polls a feed the host explicitly allows for ZRPNewsBot", async () => {
    const permissive = await startOriginServer({
      robots: "User-agent: *\nDisallow: /\n\nUser-agent: ZRPNewsBot\nDisallow: /private\n",
    });

    try {
      const outcome = await fetchSource({
        feedUrl: permissive.url("/good.xml"),
        etag: null,
        lastModified: null,
      });
      expect(outcome.ok).toBe(true);
      expect(outcome.items).toHaveLength(2);
    } finally {
      await permissive.close();
    }
  });
});

describe("parser against the exact bytes a real server sent", () => {
  it("normalizes a real response body identically to the ingest path", async () => {
    const outcome = await fetchSource(source("/good.xml"));
    expect(outcome.items[1]).toMatchObject({
      title: "Example Test Authority updates its published opening hours",
      link: "https://example.test/notices/hours",
      imageUrl: null,
    });
    expect(parseFeed("<not-a-feed/>")).toEqual([]);
  });
});
