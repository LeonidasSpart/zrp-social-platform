import { describe, it, expect } from "vitest";
import { COUNTRIES, countriesInRegion, getCountry, isNewsLanguage, isQuietHour, isTravelTopic, localHourIn } from "../config";
import { SEED_SOURCES } from "../sources-seed";

describe("country catalogue", () => {
  it("has unique ISO codes", () => {
    expect(new Set(COUNTRIES.map((country) => country.code)).size).toBe(COUNTRIES.length);
  });

  it("covers every region named in the brief", () => {
    for (const region of [
      "NORTH_AMERICA",
      "SOUTH_AMERICA",
      "EUROPE",
      "AFRICA",
      "ASIA",
      "MIDDLE_EAST",
      "OCEANIA",
    ] as const) {
      expect(countriesInRegion(region).length).toBeGreaterThan(0);
    }
  });

  it("looks a country up case-insensitively", () => {
    expect(getCountry("ch")?.name).toBe("Switzerland");
    expect(getCountry("ZZ")).toBeNull();
    expect(getCountry(null)).toBeNull();
  });
});

describe("local hours", () => {
  const noonUtc = new Date("2026-02-03T12:00:00Z");

  it("converts to a feed's own timezone", () => {
    expect(localHourIn("UTC", noonUtc)).toBe(12);
    expect(localHourIn("Asia/Tokyo", noonUtc)).toBe(21);
    expect(localHourIn("America/Los_Angeles", noonUtc)).toBe(4);
  });

  it("falls back to UTC for an unknown zone instead of throwing mid-cycle", () => {
    expect(localHourIn("Not/AZone", noonUtc)).toBe(12);
  });

  it("treats late night and early morning as quiet", () => {
    expect(isQuietHour("UTC", new Date("2026-02-03T23:30:00Z"))).toBe(true);
    expect(isQuietHour("UTC", new Date("2026-02-03T03:00:00Z"))).toBe(true);
    expect(isQuietHour("UTC", new Date("2026-02-03T12:00:00Z"))).toBe(false);
  });
});

describe("language and topic helpers", () => {
  it("accepts exactly the four travel languages", () => {
    expect(["en", "fr", "de", "it"].every(isNewsLanguage)).toBe(true);
    expect(isNewsLanguage("es")).toBe(false);
  });

  it("knows which topics belong to the travel system", () => {
    expect(isTravelTopic("AVIATION")).toBe(true);
    expect(isTravelTopic("TRAVEL")).toBe(true);
    expect(isTravelTopic("POLITICS")).toBe(false);
  });
});

describe("seed source registry", () => {
  it("has unique keys and unique feed URLs", () => {
    expect(new Set(SEED_SOURCES.map((source) => source.key)).size).toBe(SEED_SOURCES.length);
    expect(new Set(SEED_SOURCES.map((source) => source.feedUrl)).size).toBe(SEED_SOURCES.length);
  });

  it("only points at https endpoints", () => {
    for (const source of SEED_SOURCES) {
      expect(source.feedUrl.startsWith("https://")).toBe(true);
    }
  });

  it("names a publisher for every source, so attribution is always possible", () => {
    for (const source of SEED_SOURCES) {
      expect(source.publisher.length).toBeGreaterThan(0);
    }
  });

  it("marks official authorities as trust tier 1", () => {
    for (const source of SEED_SOURCES.filter((entry) => entry.official)) {
      expect(source.trustTier).toBe(1);
    }
  });

  it("includes official travel authorities, not just news outlets", () => {
    const travelAuthorities = SEED_SOURCES.filter(
      (source) => source.official && source.topics.includes("TRAVEL")
    );
    expect(travelAuthorities.length).toBeGreaterThan(0);
  });
});
