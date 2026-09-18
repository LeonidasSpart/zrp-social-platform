import { describe, it, expect } from "vitest";
import { applyGeoBoost, SAME_COUNTRY_BOOST } from "../geo-boost";

describe("applyGeoBoost", () => {
  it("boosts the score when viewer and author share a country", () => {
    expect(applyGeoBoost(100, "CH", "CH")).toBe(100 * SAME_COUNTRY_BOOST);
  });

  it("does not boost when countries differ", () => {
    expect(applyGeoBoost(100, "CH", "FR")).toBe(100);
  });

  it("does not boost when either country is unknown (never guesses)", () => {
    expect(applyGeoBoost(100, null, "CH")).toBe(100);
    expect(applyGeoBoost(100, "CH", null)).toBe(100);
    expect(applyGeoBoost(100, null, null)).toBe(100);
    expect(applyGeoBoost(100, undefined, undefined)).toBe(100);
  });

  it("the boost is modest, never dominant over a genuinely higher base score", () => {
    // A same-country post at score 100 must not outrank an out-of-country
    // post that is meaningfully more engaging (e.g. score 200) - proves
    // this is a nudge, not a filter or an override.
    const boostedLocal = applyGeoBoost(100, "CH", "CH");
    const unboostedForeign = applyGeoBoost(200, "CH", "FR");
    expect(boostedLocal).toBeLessThan(unboostedForeign);
  });
});
