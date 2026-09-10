import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { fetchFallbackImage } from "../image-fallback";
import { startOriginServer, type OriginServer } from "./origin-server";

/*
 * Real HTTP socket, real og:image parsing - the same origin-server
 * fixture ingest.http.integration.test.ts uses to stand in for a
 * publisher's server, this environment's network policy denying
 * outbound access to any real host.
 */
const allowLoopback = () => true;

describe("fetchFallbackImage (real HTTP)", () => {
  let origin: OriginServer;

  beforeAll(async () => {
    origin = await startOriginServer();
  });

  afterAll(async () => {
    await origin.close();
  });

  it("returns the article page's real og:image", async () => {
    const image = await fetchFallbackImage(origin.url("/article-with-image"), {
      isAddressAllowed: allowLoopback,
    });
    expect(image).toBe("https://cdn.example.test/article-photo.jpg");
  });

  it("returns null when the page has no og:image", async () => {
    const image = await fetchFallbackImage(origin.url("/article-without-image"), {
      isAddressAllowed: allowLoopback,
    });
    expect(image).toBeNull();
  });

  it("returns null rather than throwing on a 404", async () => {
    const image = await fetchFallbackImage(origin.url("/404"), {
      isAddressAllowed: allowLoopback,
    });
    expect(image).toBeNull();
  });

  it("returns null rather than throwing on a hung connection", async () => {
    const image = await fetchFallbackImage(origin.url("/slow"), {
      timeoutMs: 200,
      isAddressAllowed: allowLoopback,
    });
    expect(image).toBeNull();
  });

  it("never fetches at all when the address isn't allowed (real SSRF guard, no override)", async () => {
    // No isAddressAllowed override - the real production guard runs and
    // must refuse a loopback address rather than connecting to it.
    const image = await fetchFallbackImage(origin.url("/article-with-image"));
    expect(image).toBeNull();
  });
});
