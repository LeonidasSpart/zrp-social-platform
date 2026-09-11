import { describe, it, expect } from "vitest";
import iso from "i18n-iso-countries";
import {
  getAllCountries,
  getCountryName,
  isValidCountryCode,
  toAlpha2,
  flagEmoji,
  searchCountries,
  countriesInRegion,
  REGION_BY_CODE,
  REGIONS,
} from "../countries";

/*
 * Mandatory completeness coverage for the Ambassadors world dataset
 * (see task requirement: "TEST THE COMPLETE COUNTRY DATASET" /
 * "Verify the COMPLETE dataset programmatically" - not five countries
 * eyeballed in a screenshot).
 *
 * The authoritative reference here is i18n-iso-countries's own
 * getNames("en") - the exact same call countries.ts itself is built
 * on - so this suite is checking that our usage of that package is
 * complete and correctly shaped, not re-deriving the ISO standard from
 * scratch. If a future version of the package adds or retires a code,
 * this suite tracks it automatically instead of silently drifting.
 */
const REFERENCE_CODES = Object.keys(iso.getNames("en", { select: "official" }));

describe("Ambassadors country dataset is complete", () => {
  it("has exactly the same set of codes as the ISO 3166-1 reference (no manual subset)", () => {
    const ours = getAllCountries("en").map((c) => c.code).sort();
    expect(ours).toEqual([...REFERENCE_CODES].sort());
  });

  it("has no duplicate country codes", () => {
    const codes = getAllCountries("en").map((c) => c.code);
    expect(new Set(codes).size).toBe(codes.length);
  });

  it("every country has a non-empty localized name", () => {
    for (const country of getAllCountries("en")) {
      expect(country.name).toBeTruthy();
      expect(typeof country.name).toBe("string");
    }
  });

  it("does NOT hard-code a small example subset (Switzerland/France/Albania/Germany/USA only)", () => {
    // Regression guard for the exact bug this feature was built to fix:
    // a "world map" that only ever showed a handful of example
    // countries. 200+ is a deliberately generous floor - the point is
    // catching a collapse back to "a dozen or so", not pinning an
    // exact number that would need updating if ISO adds a code.
    expect(getAllCountries("en").length).toBeGreaterThan(200);
  });

  // A handful of specific, easy-to-forget cases named directly in the
  // task brief and in section 13 (localization robustness).
  it.each(["CH", "FR", "AL", "DE", "US", "NG", "MA", "JP", "TV", "VA", "AQ", "KI"])(
    "includes %s",
    (code) => {
      expect(getAllCountries("en").some((c) => c.code === code)).toBe(true);
    },
  );
});

describe("REGION_BY_CODE covers every country exactly once", () => {
  const allCodes = getAllCountries("en").map((c) => c.code);

  it("assigns a region to every single country - zero omissions", () => {
    const missing = allCodes.filter((code) => !REGION_BY_CODE[code]);
    expect(missing).toEqual([]);
  });

  it("assigns only valid, known regions", () => {
    for (const code of allCodes) {
      expect(REGIONS).toContain(REGION_BY_CODE[code]);
    }
  });

  it("region filtering is additive only - never removes a country from the full dataset", () => {
    const total = countriesInRegion("AFRICA", "en").length +
      countriesInRegion("ASIA", "en").length +
      countriesInRegion("EUROPE", "en").length +
      countriesInRegion("NORTH_AMERICA", "en").length +
      countriesInRegion("SOUTH_AMERICA", "en").length +
      countriesInRegion("OCEANIA", "en").length +
      countriesInRegion("ANTARCTICA", "en").length;
    expect(total).toBe(getAllCountries("en").length);
  });
});

describe("Localization - all 11 ZRP languages", () => {
  const LANGS = ["en", "fr", "de", "it", "sq", "es", "ru", "ar", "zh", "tr", "id"] as const;

  it.each(LANGS)("returns a full, complete list in %s with no missing names", (lang) => {
    const list = getAllCountries(lang);
    expect(list.length).toBe(REFERENCE_CODES.length);
    for (const country of list) {
      expect(country.name).toBeTruthy();
    }
  });

  it("Turkiye is named correctly in English and French (current ISO short name, not a stale one)", () => {
    expect(getCountryName("TR", "en")).toBe("Türkiye");
    expect(getCountryName("TR", "fr")).toBe("Turquie");
  });

  it("the United States has its French name available for search", () => {
    const frName = getCountryName("US", "fr");
    expect(frName).toBeTruthy();
    expect(frName).toMatch(/^États-Unis/);
  });
});

describe("Country search is robust", () => {
  it("finds a country by its exact official name", () => {
    expect(searchCountries("Switzerland", "en").map((c) => c.code)).toContain("CH");
  });

  it("finds a country by common alternate name not in its official name (USA, Ivory Coast)", () => {
    expect(searchCountries("USA", "en").map((c) => c.code)).toContain("US");
    expect(searchCountries("Ivory Coast", "en").map((c) => c.code)).toContain("CI");
  });

  it("finds Turkiye by its old English name, its French name, and its current name", () => {
    expect(searchCountries("Turkey", "en").map((c) => c.code)).toContain("TR");
    expect(searchCountries("Turquie", "en").map((c) => c.code)).toContain("TR");
    expect(searchCountries("Türkiye", "en").map((c) => c.code)).toContain("TR");
  });

  it("is diacritic-insensitive (Turkiye without the umlaut still matches)", () => {
    expect(searchCountries("Turkiye", "en").map((c) => c.code)).toContain("TR");
  });

  it("is case-insensitive", () => {
    expect(searchCountries("switzerland", "en").map((c) => c.code)).toContain("CH");
    expect(searchCountries("SWITZERLAND", "en").map((c) => c.code)).toContain("CH");
  });

  it("matches across every ZRP UI language regardless of the language currently displayed", () => {
    // A French-language search box is passed language="fr" for display,
    // but "Morocco" (English) should still find MA.
    expect(searchCountries("Morocco", "fr").map((c) => c.code)).toContain("MA");
  });

  it("returns the complete list for an empty query - never an empty result", () => {
    expect(searchCountries("", "en").length).toBe(REFERENCE_CODES.length);
  });

  it("returns no results for a nonsense query rather than throwing", () => {
    expect(searchCountries("xyznonexistentcountryxyz", "en")).toEqual([]);
  });

  it("search results stay localized to the requested language", () => {
    const results = searchCountries("Suisse", "fr");
    expect(results.some((c) => c.code === "CH" && c.name === "Suisse")).toBe(true);
  });
});

describe("Country code helpers", () => {
  it("validates real ISO codes and rejects nonsense ones", () => {
    expect(isValidCountryCode("CH")).toBe(true);
    expect(isValidCountryCode("ch")).toBe(true);
    expect(isValidCountryCode("XX")).toBe(false);
    expect(isValidCountryCode(null)).toBe(false);
    expect(isValidCountryCode(undefined)).toBe(false);
    expect(isValidCountryCode("")).toBe(false);
  });

  it("normalizes a valid code to uppercase alpha-2", () => {
    expect(toAlpha2("ch")).toBe("CH");
    expect(toAlpha2("CH")).toBe("CH");
    expect(toAlpha2("zz")).toBeUndefined();
  });

  it("renders a flag emoji for every country in the dataset without throwing", () => {
    for (const country of getAllCountries("en")) {
      expect(() => flagEmoji(country.code)).not.toThrow();
      expect(flagEmoji(country.code).length).toBeGreaterThan(0);
    }
  });

  it("flag emoji is built from the correct regional indicator pair", () => {
    // 🇨🇭 = U+1F1E8 U+1F1ED
    expect(flagEmoji("ch")).toBe("\u{1F1E8}\u{1F1ED}");
  });
});
