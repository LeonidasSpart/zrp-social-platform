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

const mockedSafeFetch = vi.mocked(safeFetch);

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
    expect(body.image).toBe("https://img.20min.ch/photo.jpg");
    expect(body.siteName).toBe("20 minutes");
    expect(body.isVideo).toBe(true);
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

  it("gracefully returns an empty-shaped preview (not an error) when the page has no usable metadata", async () => {
    mockedSafeFetch.mockResolvedValueOnce(htmlResponse("<html><body>nothing here</body></html>"));
    const res = await callGET(req("https://example.com/blank-page"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.title).toBeNull();
    expect(body.image).toBeNull();
  });

  it("gracefully returns an empty-shaped preview when the response isn't HTML", async () => {
    mockedSafeFetch.mockResolvedValueOnce(htmlResponse("{}", "application/json"));
    const res = await callGET(req("https://example.com/api/data"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.title).toBeNull();
  });

  it("gracefully returns an empty-shaped preview when the fetch throws (offline/timeout/blocked)", async () => {
    mockedSafeFetch.mockRejectedValueOnce(new Error("Request timed out"));
    const res = await callGET(req("https://example.com/unreachable"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.title).toBeNull();
    expect(body.image).toBeNull();
  });

  it("gracefully returns an empty-shaped preview on a non-2xx response", async () => {
    mockedSafeFetch.mockResolvedValueOnce({
      statusCode: 404,
      headers: { "content-type": "text/html" },
      body: Buffer.from("<html>Not Found</html>", "utf-8"),
    });
    const res = await callGET(req("https://example.com/missing-page"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.title).toBeNull();
  });
});
