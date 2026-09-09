import { describe, it, expect, afterEach } from "vitest";
import { isAllowedMediaUrl, isTrustedUploadUrl, parseMediaUrl, validateMediaUrls } from "../media-url";

// Post media must come from the sources ZRP itself hands out
// (UploadThing, GIPHY) - never an arbitrary client-chosen host, scheme
// or pseudo-URL; and only ZRP's own upload storage may be labelled a
// "video" for the Shorts feed.

afterEach(() => {
  delete process.env.ALLOWED_MEDIA_HOSTS;
});

describe("parseMediaUrl", () => {
  it("accepts https URLs only", () => {
    expect(parseMediaUrl("https://utfs.io/f/abc.jpg")).not.toBeNull();
    expect(parseMediaUrl("http://utfs.io/f/abc.jpg")).toBeNull();
    expect(parseMediaUrl("javascript:alert(1)")).toBeNull();
    expect(parseMediaUrl("data:image/png;base64,AAAA")).toBeNull();
    expect(parseMediaUrl("blob:https://zrp.one/uuid")).toBeNull();
    expect(parseMediaUrl("//utfs.io/f/abc.jpg")).toBeNull();
  });

  it("rejects embedded credentials, non-strings and oversized values", () => {
    expect(parseMediaUrl("https://user:pw@utfs.io/f/abc.jpg")).toBeNull();
    expect(parseMediaUrl(42)).toBeNull();
    expect(parseMediaUrl(null)).toBeNull();
    expect(parseMediaUrl("https://utfs.io/" + "a".repeat(3000))).toBeNull();
  });
});

describe("isTrustedUploadUrl / isAllowedMediaUrl", () => {
  it("trusts UploadThing hosts (both legacy utfs.io and current *.ufs.sh)", () => {
    expect(isTrustedUploadUrl("https://utfs.io/f/abc.mp4")).toBe(true);
    expect(isTrustedUploadUrl("https://abc123.ufs.sh/f/xyz.mp4")).toBe(true);
    expect(isAllowedMediaUrl("https://utfs.io/f/abc.jpg")).toBe(true);
  });

  it("allows GIPHY as media but NOT as a trusted upload (no video label)", () => {
    expect(isAllowedMediaUrl("https://media2.giphy.com/media/abc/200w.gif")).toBe(true);
    expect(isTrustedUploadUrl("https://media2.giphy.com/media/abc/200w.gif")).toBe(false);
  });

  it("rejects arbitrary hosts, look-alike hosts and suffix tricks", () => {
    expect(isAllowedMediaUrl("https://evil.example/pixel.gif")).toBe(false);
    expect(isAllowedMediaUrl("https://utfs.io.evil.example/f/abc.jpg")).toBe(false);
    expect(isAllowedMediaUrl("https://notutfs.io/f/abc.jpg")).toBe(false);
    expect(isAllowedMediaUrl("https://evilufs.sh/f/abc.jpg")).toBe(false);
    expect(isAllowedMediaUrl("https://giphy.com.evil.example/x.gif")).toBe(false);
    expect(isTrustedUploadUrl("https://attacker.example/video.mp4")).toBe(false);
  });

  it("honours ALLOWED_MEDIA_HOSTS (exact and .suffix entries) for future legitimate sources", () => {
    expect(isAllowedMediaUrl("https://cdn.partner.example/a.jpg")).toBe(false);
    process.env.ALLOWED_MEDIA_HOSTS = "cdn.partner.example, .media.other.example";
    expect(isAllowedMediaUrl("https://cdn.partner.example/a.jpg")).toBe(true);
    expect(isAllowedMediaUrl("https://x.media.other.example/a.jpg")).toBe(true);
    expect(isAllowedMediaUrl("https://media.other.example/a.jpg")).toBe(false);
  });
});

describe("validateMediaUrls", () => {
  it("passes an all-trusted list and flags the first offending URL", () => {
    expect(validateMediaUrls(["https://utfs.io/f/a.jpg", "https://media1.giphy.com/x.gif"]).ok).toBe(true);
    const bad = validateMediaUrls(["https://utfs.io/f/a.jpg", "https://evil.example/x.jpg"]);
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.url).toBe("https://evil.example/x.jpg");
  });

  it("an empty list (text-only post) is fine", () => {
    expect(validateMediaUrls([]).ok).toBe(true);
  });
});
