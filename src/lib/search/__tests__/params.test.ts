import { describe, it, expect } from "vitest";
import { NextRequest } from "next/server";
import { parseSearchCategory, parseSearchFilters, parseSearchSort, resolveDateFilter } from "../params";

function req(query: Record<string, string> = {}) {
  const url = new URL("https://zrp.one/api/search");
  for (const [k, v] of Object.entries(query)) url.searchParams.set(k, v);
  return new NextRequest(url);
}

describe("parseSearchCategory", () => {
  it("defaults to 'all' when type is missing or unrecognized", () => {
    expect(parseSearchCategory(req())).toBe("all");
    expect(parseSearchCategory(req({ type: "not-a-real-category" }))).toBe("all");
  });

  it("accepts every real category", () => {
    for (const type of ["users", "posts", "hashtags", "communities", "news", "music", "opportunities", "marketplace"]) {
      expect(parseSearchCategory(req({ type }))).toBe(type);
    }
  });
});

describe("parseSearchSort", () => {
  it("defaults to 'relevance' for missing/invalid sort - never lets an unrecognized value through silently", () => {
    expect(parseSearchSort(req())).toBe("relevance");
    expect(parseSearchSort(req({ sort: "most_liked_ever" }))).toBe("relevance");
  });

  it("accepts every real sort mode", () => {
    for (const sort of ["relevance", "recent", "engagement", "trending"]) {
      expect(parseSearchSort(req({ sort }))).toBe(sort);
    }
  });
});

describe("parseSearchFilters", () => {
  it("normalizes country to uppercase and language to lowercase", () => {
    const filters = parseSearchFilters(req({ country: "ch", language: "EN" }));
    expect(filters.country).toBe("CH");
    expect(filters.language).toBe("en");
  });

  it("only accepts dateFrom/dateTo when dateRange=custom", () => {
    const withoutCustom = parseSearchFilters(req({ dateRange: "24h", dateFrom: "2026-01-01" }));
    expect(withoutCustom.dateFrom).toBeNull();

    const withCustom = parseSearchFilters(req({ dateRange: "custom", dateFrom: "2026-01-01" }));
    expect(withCustom.dateFrom).toEqual(new Date("2026-01-01"));
  });

  it("rejects an unparseable custom date rather than crashing", () => {
    const filters = parseSearchFilters(req({ dateRange: "custom", dateFrom: "not-a-date" }));
    expect(filters.dateFrom).toBeNull();
  });

  it("rejects an unrecognized media filter", () => {
    const filters = parseSearchFilters(req({ media: "audio" }));
    expect(filters.media).toBeNull();
  });

  it("treats boolean filters as false unless exactly 'true'", () => {
    const filters = parseSearchFilters(req({ verified: "1" }));
    expect(filters.verified).toBe(false);
    expect(parseSearchFilters(req({ verified: "true" })).verified).toBe(true);
  });
});

describe("resolveDateFilter", () => {
  it("returns null for 'any'", () => {
    expect(resolveDateFilter(parseSearchFilters(req()))).toBeNull();
  });

  it("returns a gte bound for 24h/7d/30d", () => {
    const f = resolveDateFilter(parseSearchFilters(req({ dateRange: "7d" })));
    expect(f?.gte).toBeInstanceOf(Date);
    expect(f?.lte).toBeUndefined();
  });

  it("returns null for 'custom' with no usable bound, rather than an empty (matches-everything) range object", () => {
    const f = resolveDateFilter(parseSearchFilters(req({ dateRange: "custom" })));
    expect(f).toBeNull();
  });

  it("returns both bounds for a fully-specified custom range", () => {
    const f = resolveDateFilter(
      parseSearchFilters(req({ dateRange: "custom", dateFrom: "2026-01-01", dateTo: "2026-02-01" }))
    );
    expect(f?.gte).toEqual(new Date("2026-01-01"));
    expect(f?.lte).toEqual(new Date("2026-02-01"));
  });
});
