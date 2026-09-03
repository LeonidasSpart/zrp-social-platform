import { describe, it, expect } from "vitest";
import {
  extractYouTubeVideoId,
  isYouTubeUrl,
  getYouTubeThumbnailUrl,
  getYouTubeCanonicalUrl,
} from "../youtube";

const VIDEO_ID = "pguwUY9-sVo"; // the exact ID from the reported bug report

describe("extractYouTubeVideoId", () => {
  it("extracts from a standard watch URL", () => {
    expect(extractYouTubeVideoId(`https://www.youtube.com/watch?v=${VIDEO_ID}`)).toBe(VIDEO_ID);
    expect(extractYouTubeVideoId(`https://youtube.com/watch?v=${VIDEO_ID}`)).toBe(VIDEO_ID);
  });

  it("extracts from a youtu.be short link", () => {
    expect(extractYouTubeVideoId(`https://youtu.be/${VIDEO_ID}`)).toBe(VIDEO_ID);
  });

  it("extracts from a Shorts URL", () => {
    expect(extractYouTubeVideoId(`https://www.youtube.com/shorts/${VIDEO_ID}`)).toBe(VIDEO_ID);
    expect(extractYouTubeVideoId(`https://youtube.com/shorts/${VIDEO_ID}`)).toBe(VIDEO_ID);
  });

  it("extracts from an embed URL", () => {
    expect(extractYouTubeVideoId(`https://www.youtube.com/embed/${VIDEO_ID}`)).toBe(VIDEO_ID);
    expect(extractYouTubeVideoId(`https://www.youtube-nocookie.com/embed/${VIDEO_ID}`)).toBe(VIDEO_ID);
  });

  it("ignores tracking/playback query params (?si=, &t=) on every URL shape - the exact reported bug case", () => {
    expect(extractYouTubeVideoId(`https://youtu.be/${VIDEO_ID}?si=MYXe7tl1xtbv96r1`)).toBe(VIDEO_ID);
    expect(
      extractYouTubeVideoId(`https://www.youtube.com/watch?v=${VIDEO_ID}&t=42s&si=abc123`)
    ).toBe(VIDEO_ID);
    expect(extractYouTubeVideoId(`https://www.youtube.com/shorts/${VIDEO_ID}?feature=share`)).toBe(
      VIDEO_ID
    );
  });

  it("returns null for a YouTube URL that isn't a video (invalid/absent ID)", () => {
    expect(extractYouTubeVideoId("https://www.youtube.com/")).toBeNull();
    expect(extractYouTubeVideoId("https://www.youtube.com/@somechannel")).toBeNull();
    expect(extractYouTubeVideoId("https://www.youtube.com/watch?v=tooshort")).toBeNull();
    expect(extractYouTubeVideoId("https://www.youtube.com/watch")).toBeNull();
  });

  it("returns null for a non-YouTube URL, even one shaped like a YouTube path", () => {
    expect(extractYouTubeVideoId(`https://evil.example.com/watch?v=${VIDEO_ID}`)).toBeNull();
    expect(extractYouTubeVideoId("https://example.com/shorts/abcdefghijk")).toBeNull();
    expect(extractYouTubeVideoId("https://vimeo.com/123456789")).toBeNull();
  });

  it("returns null (never throws) for a malformed URL", () => {
    expect(() => extractYouTubeVideoId("not a url at all")).not.toThrow();
    expect(extractYouTubeVideoId("not a url at all")).toBeNull();
    expect(extractYouTubeVideoId("")).toBeNull();
    expect(extractYouTubeVideoId("youtu.be/missing-protocol")).toBeNull();
  });
});

describe("isYouTubeUrl", () => {
  it("recognizes every supported YouTube hostname", () => {
    expect(isYouTubeUrl("https://www.youtube.com/watch?v=x")).toBe(true);
    expect(isYouTubeUrl("https://youtube.com/watch?v=x")).toBe(true);
    expect(isYouTubeUrl("https://m.youtube.com/watch?v=x")).toBe(true);
    expect(isYouTubeUrl("https://youtu.be/x")).toBe(true);
    expect(isYouTubeUrl("https://www.youtube-nocookie.com/embed/x")).toBe(true);
  });

  it("rejects non-YouTube hosts and malformed input without throwing", () => {
    expect(isYouTubeUrl("https://vimeo.com/123")).toBe(false);
    expect(isYouTubeUrl("https://notyoutube.com/watch?v=x")).toBe(false);
    expect(() => isYouTubeUrl("garbage")).not.toThrow();
    expect(isYouTubeUrl("garbage")).toBe(false);
  });
});

describe("getYouTubeThumbnailUrl / getYouTubeCanonicalUrl", () => {
  it("build stable, deterministic URLs from a video ID alone - no network call involved", () => {
    expect(getYouTubeThumbnailUrl(VIDEO_ID)).toBe(`https://i.ytimg.com/vi/${VIDEO_ID}/hqdefault.jpg`);
    expect(getYouTubeCanonicalUrl(VIDEO_ID)).toBe(`https://www.youtube.com/watch?v=${VIDEO_ID}`);
  });
});
