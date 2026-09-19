import { describe, it, expect } from "vitest";
import { normalizeCountryInput } from "../country";

describe("normalizeCountryInput", () => {
  it("passes through a valid ISO alpha-2 code, uppercased", () => {
    expect(normalizeCountryInput("CH")).toBe("CH");
    expect(normalizeCountryInput("ch")).toBe("CH");
  });

  it("accepts a valid ISO alpha-3 code", () => {
    expect(normalizeCountryInput("CHE")).toBe("CH");
  });

  it("resolves the same country from every localized official name variant", () => {
    expect(normalizeCountryInput("Switzerland")).toBe("CH");
    expect(normalizeCountryInput("Suisse")).toBe("CH");
    expect(normalizeCountryInput("Schweiz")).toBe("CH");
    expect(normalizeCountryInput("Svizzera")).toBe("CH");
  });

  it("is case-insensitive", () => {
    expect(normalizeCountryInput("switzerland")).toBe("CH");
    expect(normalizeCountryInput("SWITZERLAND")).toBe("CH");
  });

  it("is diacritic-insensitive against the official name", () => {
    expect(normalizeCountryInput("Turkiye")).toBe("TR");
    expect(normalizeCountryInput("Türkiye")).toBe("TR");
    expect(normalizeCountryInput("Cote d'Ivoire")).toBe("CI");
    expect(normalizeCountryInput("Côte d'Ivoire")).toBe("CI");
  });

  it("resolves known common aliases", () => {
    expect(normalizeCountryInput("USA")).toBe("US");
    expect(normalizeCountryInput("UK")).toBe("GB");
    expect(normalizeCountryInput("Ivory Coast")).toBe("CI");
  });

  it("trims surrounding whitespace", () => {
    expect(normalizeCountryInput("  Switzerland  ")).toBe("CH");
  });

  it("returns null rather than guessing for unrecognized input", () => {
    expect(normalizeCountryInput("Narnia")).toBeNull();
    expect(normalizeCountryInput("asdkjasldkj")).toBeNull();
  });

  it("returns null for empty/whitespace-only/null/undefined input", () => {
    expect(normalizeCountryInput("")).toBeNull();
    expect(normalizeCountryInput("   ")).toBeNull();
    expect(normalizeCountryInput(null)).toBeNull();
    expect(normalizeCountryInput(undefined)).toBeNull();
  });

  // Regression: found via the production backfill script's dry run
  // (a real user profile said "North Macedonia") - the official ISO
  // long name is "The Republic of North Macedonia", which is a
  // different string from the common short name people actually type.
  // Indexing only the official name (the original implementation)
  // missed this and every country like it.
  it("resolves a country whose common short name differs from its official long name", () => {
    expect(normalizeCountryInput("North Macedonia")).toBe("MK");
  });

  // Regression: widening the index to include short names (above)
  // introduces real ambiguity for a few bare short names shared by two
  // different countries - bare "Congo" alone must stay unresolved
  // rather than silently picking one of the two Congos, while each
  // country's own full, unambiguous name still resolves correctly.
  it("never guesses between two countries that share a bare short name", () => {
    expect(normalizeCountryInput("Congo")).toBeNull();
    expect(normalizeCountryInput("Democratic Republic of the Congo")).toBe("CD");
    expect(normalizeCountryInput("Republic of the Congo")).toBe("CG");
  });
});
