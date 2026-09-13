import { describe, it, expect } from "vitest";
import { normalizeHashtag, slugifyName } from "@/lib/communities";

describe("normalizeHashtag", () => {
  it("lowercases and strips a leading #", () => {
    expect(normalizeHashtag("#Travel")).toBe("travel");
  });

  it("rejects punctuation, spaces and empty input", () => {
    expect(normalizeHashtag("bad tag")).toBeNull();
    expect(normalizeHashtag("bad!tag")).toBeNull();
    expect(normalizeHashtag("")).toBeNull();
    expect(normalizeHashtag("#")).toBeNull();
  });

  it("rejects a tag over 32 characters", () => {
    expect(normalizeHashtag("a".repeat(33))).toBeNull();
  });

  it("accepts underscores and digits", () => {
    expect(normalizeHashtag("art_design_101")).toBe("art_design_101");
  });
});

describe("slugifyName", () => {
  it("lowercases and hyphenates spaces", () => {
    expect(slugifyName("Health & Fitness")).toBe("health-fitness");
  });

  it("trims leading/trailing hyphens produced by punctuation", () => {
    expect(slugifyName("!!! Travel Club !!!")).toBe("travel-club");
  });

  it("caps length at 60 characters", () => {
    const long = "a".repeat(100);
    expect(slugifyName(long).length).toBeLessThanOrEqual(60);
  });
});
