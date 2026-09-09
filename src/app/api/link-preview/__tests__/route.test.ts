import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest, NextResponse } from "next/server";

// The route's own outbound network call (safeFetch) is mocked here so
// these tests never touch the real network - safeFetch's actual
// transport mechanics (redirects, timeout, maxBytes) are covered
// directly against a real local server in ssrf-guard.test.ts instead.
// Redis is mocked to always miss/no-op so each test exercises a fresh
// fetch rather than depending on cache state left by a previous test.
vi.mock("@/lib/ssrf-guard", async () => {
  const actual = await vi.importActual<typeof import("@/lib/ssrf-guard")>("@/lib/ssrf-guard");
  return {
    ...actual,
    safeFetch: vi.fn(),
  };
});
vi.mock("@/lib/redis", () => ({
  getCached: vi.fn(async () => null),
  setCached: vi.fn(async () => {}),
}));

import { GET } from "../route";
import { safeFetch } from "@/lib/ssrf-guard";
import { setCached } from "@/lib/redis";

const mockedSafeFetch = vi.mocked(safeFetch);
const mockedSetCached = vi.mocked(setCached);

function htmlResponse(html: string, contentType = "text/html; charset=utf-8") {
  return {
    statusCode: 200,
    headers: { "content-type": contentType },
    body: Buffer.from(html, "utf-8"),
  };
}

function req(url: string) {
  return new NextRequest(`https://zrp.one/api/link-preview?url=${encodeURIComponent(url)}`);
}

// rateLimit()'s return type allows `response` to be undefined even when
// `success` is false (the shape covers a hypothetical fail-success case
// with no response body), which makes GET's inferred return type
// `NextResponse | undefined` even though every real code path returns a
// response. This route always returns one - assert that rather than
// littering every call site with a non-null assertion.
async function callGET(request: NextRequest): Promise<NextResponse> {
  const res = await GET(request);
  if (!res) throw new Error("GET returned undefined - route always returns a NextResponse");
  return res;
}

describe("GET /api/link-preview", () => {
  beforeEach(() => {
    mockedSafeFetch.mockReset();
    mockedSetCached.mockReset();
  });

  it("400s when the url parameter is missing", async () => {
    const res = await callGET(new NextRequest("https://zrp.one/api/link-preview"));
    expect(res.status).toBe(400);
  });

  it("400s on an unparseable url", async () => {
    const res = await callGET(req("not a url"));
    expect(res.status).toBe(400);
  });

  it("400s on a dangerous protocol (javascript:)", async () => {
    const res = await callGET(
      new NextRequest(
        `https://zrp.one/api/link-preview?url=${encodeURIComponent("javascript:alert(1)")}`
      )
    );
    expect(res.status).toBe(400);
    expect(mockedSafeFetch).not.toHaveBeenCalled();
  });

  it("400s on a URL with embedded credentials", async () => {
    const res = await callGET(req("https://user:pass@example.com"));
    expect(res.status).toBe(400);
    expect(mockedSafeFetch).not.toHaveBeenCalled();
  });

  it("resolves a normal article via Open Graph metadata (the 20min.ch shape)", async () => {
    mockedSafeFetch.mockResolvedValueOnce(
      htmlResponse(`
        <html><head>
          <meta property="og:title" content="Canton de Soleure: bloquee par une voiture">
          <meta property="og:description" content="Elle opte pour la maniere forte">
          <meta property="og:image" content="https://img.20min.ch/photo.jpg">
          <meta property="og:site_name" content="20 minutes">
          <meta property="og:type" content="video.other">
        </head></html>`)
    );
    const res = await callGET(req("https://www.20min.ch/fr/video/example-123"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.title).toBe("Canton de Soleure: bloquee par une voiture");
    expect(body.description).toBe("Elle opte pour la maniere forte");
    expect(body.image).toBe("https://img.20min.ch/photo.jpg");
    expect(body.siteName).toBe("20 minutes");
    expect(body.isVideo).toBe(true);
    // A confirmed successful preview is cached for a full week, not the
    // shorter empty-result TTLs asserted below - this is the case that
    // actually matters for real traffic, since every other post linking
    // the same URL should hit cache instead of re-fetching 20min.ch.
    expect(mockedSetCached).toHaveBeenCalledWith(expect.any(String), expect.anything(), 60 * 60 * 24 * 7);
  });

  // ─── 20min.ch regression suite ───────────────────────────────────
  // This pipeline was confirmed working end-to-end against the real
  // site and is NOT to be rewritten - these tests exist purely to
  // catch a future regression (a parser change, a cache-key change, a
  // stricter SSRF rule that starts blocking a legitimate publisher),
  // not to re-litigate whether it works. They cover the parts of the
  // real 20min.ch response shape the test above doesn't: a plain
  // article (not video), the actual production domain/CDN host names,
  // and the SSRF guard treating a real public news domain as ordinary
  // (never accidentally caught by the private/loopback/link-local
  // blocking meant for internal targets - see ssrf-guard.test.ts for
  // the guard's own unit coverage of that blocking).
  it("resolves a plain (non-video) 20min.ch article the same way", async () => {
    mockedSafeFetch.mockResolvedValueOnce(
      htmlResponse(`
        <html><head>
          <meta property="og:title" content="Un incendie ravage un immeuble a Zurich">
          <meta property="og:description" content="Personne n'a ete blesse, selon la police">
          <meta property="og:image" content="https://media.20min.ch/image/incendie.jpg">
          <meta property="og:site_name" content="20 minutes">
          <meta property="og:type" content="article">
        </head></html>`)
    );
    const res = await callGET(req("https://www.20min.ch/fr/story/un-incendie-ravage-un-immeuble-123456789"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.title).toBe("Un incendie ravage un immeuble a Zurich");
    // Real French-language 20min.ch content routinely contains
    // apostrophes ("n'a", "l'incendie", "d'un") inside a double-quoted
    // og:description attribute - this must survive intact, not get
    // truncated at the apostrophe (see extractMeta's own fix comment).
    expect(body.description).toBe("Personne n'a ete blesse, selon la police");
    expect(body.image).toBe("https://media.20min.ch/image/incendie.jpg");
    expect(body.siteName).toBe("20 minutes");
    expect(body.isVideo).toBe(false);
  });

  it("never routes a real 20min.ch URL through the YouTube-specific path", async () => {
    mockedSafeFetch.mockResolvedValueOnce(
      htmlResponse(`
        <html><head>
          <meta property="og:title" content="20min.ch article, not a video host">
          <meta property="og:site_name" content="20 minutes">
        </head></html>`)
    );
    const res = await callGET(req("https://www.20min.ch/de/story/example-987654321"));
    const body = await res.json();
    // A real 20min.ch URL must go through fetchGenericPreview - if it
    // were ever misclassified as a YouTube URL, siteName would come
    // back "YouTube" instead of the real publisher name.
    expect(body.siteName).toBe("20 minutes");
  });

  // Real user report: this exact URL (a French /fr/story/ article) showed
  // only the raw link, never a preview card, on both Web and Android.
  // Sandboxed dev environments can't make a live outbound request to
  // confirm what 20min.ch actually returns for it, so this asserts the
  // one concrete, fixable defect found by code review instead: the
  // request sent no Accept-Language matching the article's own language,
  // which is a documented way for multi-language publishers to serve a
  // thinner/consent-walled response. This also locks in that the exact
  // reported URL parses correctly end-to-end once real OG tags are
  // present, so a future regression here is caught even though the live
  // network behavior itself couldn't be verified from this environment.
  it("sends an Accept-Language matching the URL's own /fr/ path segment for the reported football-article URL", async () => {
    mockedSafeFetch.mockResolvedValueOnce(
      htmlResponse(`
        <html><head>
          <meta property="og:title" content="Atteinte d'un cancer, elle voit son club faire un geste emouvant">
          <meta property="og:description" content="Un geste qui a touche toute la communaute du club">
          <meta property="og:image" content="https://media.20min.ch/image/football-geste.jpg">
          <meta property="og:site_name" content="20 minutes">
          <meta property="og:type" content="article">
        </head></html>`)
    );
    const url =
      "https://www.20min.ch/fr/story/football-atteinte-d-un-cancer-elle-voit-son-club-faire-un-geste-emouvant-103629744";
    const res = await callGET(req(url));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.title).toBe("Atteinte d'un cancer, elle voit son club faire un geste emouvant");
    expect(body.image).toBe("https://media.20min.ch/image/football-geste.jpg");

    expect(mockedSafeFetch).toHaveBeenCalledTimes(1);
    const [, options] = mockedSafeFetch.mock.calls[0];
    expect(options?.headers?.["Accept-Language"]).toBe("fr;q=1.0,en-US;q=0.8,en;q=0.7");
  });

  it("falls back to plain en-US Accept-Language for a URL with no language path segment", async () => {
    mockedSafeFetch.mockResolvedValueOnce(htmlResponse(`<html><head></head></html>`));
    await callGET(req("https://example.com/blank-page-no-lang"));
    const [, options] = mockedSafeFetch.mock.calls[0];
    expect(options?.headers?.["Accept-Language"]).toBe("en-US,en;q=0.9");
  });

  it("does not apply SSRF blocking to a real public 20min.ch URL - only the outbound fetch layer decides, and it's mocked to succeed here", async () => {
    mockedSafeFetch.mockResolvedValueOnce(htmlResponse(`<html><head></head></html>`));
    const res = await callGET(req("https://www.20min.ch/fr/video/example-123"));
    // Reaching safeFetch at all (rather than a 400 from the route's own
    // URL/protocol validation) is what's being asserted - a real public
    // HTTPS URL with no embedded credentials must always be allowed
    // through to the guarded fetch layer.
    expect(mockedSafeFetch).toHaveBeenCalledTimes(1);
    expect(res.status).toBe(200);
  });

  it("returns a thumbnail-only preview for a YouTube URL without hitting the generic fetcher", async () => {
    // fetchYouTubePreview builds the thumbnail purely from the video ID
    // (no fetch needed) and only calls safeFetch for the oEmbed title -
    // simulate that call succeeding.
    mockedSafeFetch.mockResolvedValueOnce({
      statusCode: 200,
      headers: {},
      body: Buffer.from(JSON.stringify({ title: "A real video title" }), "utf-8"),
    });
    const res = await callGET(req("https://www.youtube.com/watch?v=dQw4w9WgXcQ"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.siteName).toBe("YouTube");
    expect(body.image).toBe("https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg");
    expect(body.title).toBe("A real video title");
    expect(body.isVideo).toBe(true);
  });

  it("still returns the YouTube thumbnail when oEmbed fails", async () => {
    mockedSafeFetch.mockRejectedValueOnce(new Error("oEmbed unavailable"));
    const res = await callGET(req("https://youtu.be/dQw4w9WgXcQ"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.siteName).toBe("YouTube");
    expect(body.image).toBe("https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg");
    expect(body.title).toBeNull();
  });

  it("gracefully returns an empty-shaped preview (not an error) when the page has no usable metadata, and caches it for the full hour", async () => {
    mockedSafeFetch.mockResolvedValueOnce(htmlResponse("<html><body>nothing here</body></html>"));
    const res = await callGET(req("https://example.com/blank-page"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.title).toBeNull();
    expect(body.image).toBeNull();
    // The page was actually fetched and parsed - a confirmed-empty
    // result, not a transient failure - so it's safe to cache for the
    // full hour rather than retrying on every view.
    expect(mockedSetCached).toHaveBeenCalledWith(expect.any(String), expect.anything(), 3600);
  });

  // These three cases (non-HTML response, thrown fetch error, non-2xx
  // status) never actually examined the page's real metadata - each is
  // a transient failure at the network/transport level, not proof the
  // page has no preview. Caching them for the same full hour as a
  // confirmed-empty page would lock a link out of ever getting a
  // preview just because its very first fetch attempt hit a momentary
  // block, so these get a much shorter negative-cache TTL instead.
  it("gracefully returns an empty-shaped preview when the response isn't HTML, cached only briefly", async () => {
    mockedSafeFetch.mockResolvedValueOnce(htmlResponse("{}", "application/json"));
    const res = await callGET(req("https://example.com/api/data"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.title).toBeNull();
    expect(mockedSetCached).toHaveBeenCalledWith(expect.any(String), expect.anything(), 60);
  });

  it("gracefully returns an empty-shaped preview when the fetch throws (offline/timeout/blocked), cached only briefly", async () => {
    mockedSafeFetch.mockRejectedValueOnce(new Error("Request timed out"));
    const res = await callGET(req("https://example.com/unreachable"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.title).toBeNull();
    expect(body.image).toBeNull();
    expect(mockedSetCached).toHaveBeenCalledWith(expect.any(String), expect.anything(), 60);
  });

  it("gracefully returns an empty-shaped preview on a non-2xx response, cached only briefly", async () => {
    mockedSafeFetch.mockResolvedValueOnce({
      statusCode: 404,
      headers: { "content-type": "text/html" },
      body: Buffer.from("<html>Not Found</html>", "utf-8"),
    });
    const res = await callGET(req("https://example.com/missing-page"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.title).toBeNull();
    expect(mockedSetCached).toHaveBeenCalledWith(expect.any(String), expect.anything(), 60);
  });
});
