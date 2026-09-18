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
});
