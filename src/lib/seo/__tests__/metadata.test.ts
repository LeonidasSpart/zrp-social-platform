import { describe, it, expect } from "vitest";
import { resolveOgImages, buildSocialMetadata, defaultOgImageUrl, SITE_URL } from "../metadata";

describe("resolveOgImages", () => {
  it("uses the real content image when one is given", () => {
    const images = resolveOgImages({ image: "https://cdn.example/avatar.png", title: "Ada Lovelace" });
    expect(images).toEqual([
      { url: "https://cdn.example/avatar.png", width: 1200, height: 630, alt: "Ada Lovelace" },
    ]);
  });

  it("falls back to the branded default image when no image is given - never `undefined`", () => {
    // This is the exact production bug this module exists to prevent:
    // a page whose openGraph/twitter.images ended up undefined silently
    // lost its social preview image entirely (Next.js does not deep-merge
    // openGraph across route segments, so a child with no images gets no
    // image at all, not the root layout's).
    const images = resolveOgImages({ image: null, title: "ZRP Global Ambassadors" });
    expect(images).toHaveLength(1);
    expect(images[0].url).toContain("/api/og?title=");
    expect(images[0].url.startsWith(SITE_URL)).toBe(true);
  });

  it("also falls back for undefined and empty-string images", () => {
    expect(resolveOgImages({ image: undefined, title: "X" })[0].url).toContain("/api/og");
    expect(resolveOgImages({ image: "", title: "X" })[0].url).toContain("/api/og");
  });

  it("encodes the subtitle into the default image URL when provided", () => {
    const url = resolveOgImages({ image: null, title: "T", subtitle: "S" })[0].url;
    expect(url).toContain("subtitle=S");
  });
});

describe("defaultOgImageUrl", () => {
  it("builds an absolute URL under SITE_URL", () => {
    const url = defaultOgImageUrl("Hello World");
    expect(url).toBe(`${SITE_URL}/api/og?title=Hello+World`);
  });

  it("omits the subtitle param when none is given", () => {
    expect(defaultOgImageUrl("Hello")).not.toContain("subtitle");
  });
});

describe("buildSocialMetadata", () => {
  it("always returns a non-empty images array on both openGraph and twitter, even with no real image", () => {
    const meta = buildSocialMetadata({
      title: "About ZRP Social",
      description: "A description.",
      path: "/about",
    });
    const ogImages = (meta.openGraph as any).images;
    expect(Array.isArray(ogImages)).toBe(true);
    expect(ogImages.length).toBeGreaterThan(0);
    expect(Array.isArray(meta.twitter?.images)).toBe(true);
    expect((meta.twitter?.images as string[]).length).toBeGreaterThan(0);
  });

  it("uses the real image when one is passed", () => {
    const meta = buildSocialMetadata({
      title: "A Post",
      description: "...",
      path: "/post/123",
      image: "https://cdn.example/real.png",
    });
    expect((meta.openGraph as any).images[0].url).toBe("https://cdn.example/real.png");
    expect((meta.twitter?.images as string[])[0]).toBe("https://cdn.example/real.png");
  });

  it("builds an absolute openGraph.url from the given path", () => {
    const meta = buildSocialMetadata({ title: "T", description: "D", path: "/careers" });
    expect((meta.openGraph as any).url).toBe(`${SITE_URL}/careers`);
  });

  it("always sets siteName, locale, twitter:card and twitter:creator consistently", () => {
    const meta = buildSocialMetadata({ title: "T", description: "D", path: "/x" });
    expect((meta.openGraph as any).siteName).toBe("ZRP Social");
    expect((meta.openGraph as any).locale).toBe("en_US");
    expect((meta.twitter as any)?.card).toBe("summary_large_image");
    expect((meta.twitter as any)?.creator).toBe("@zrp_social");
  });
});
