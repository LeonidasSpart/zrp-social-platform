import { describe, it, expect } from "vitest";
import { textMatchWeight } from "../text-match";

describe("textMatchWeight", () => {
  it("scores an exact match highest", () => {
    expect(textMatchWeight("leonidas", "leonidas")).toBe(100);
    expect(textMatchWeight("Leonidas", "leonidas")).toBe(100); // case-insensitive
  });

  it("ranks exact > prefix > whole-word > substring", () => {
    const exact = textMatchWeight("zrp", "zrp");
    const prefix = textMatchWeight("zrp", "zrpsocial");
    const wholeWord = textMatchWeight("zrp", "the zrp platform");
    const substring = textMatchWeight("zrp", "myzrpaccount");
    expect(exact).toBeGreaterThan(prefix);
    expect(prefix).toBeGreaterThan(wholeWord);
    expect(wholeWord).toBeGreaterThan(substring);
    expect(substring).toBeGreaterThan(0);
  });

  it("returns 0 for no match at all", () => {
    expect(textMatchWeight("switzerland", "argentina")).toBe(0);
  });

  it("takes the best match across multiple fields, not the first", () => {
    const score = textMatchWeight("leonidas", "some unrelated headline", "leonidas");
    expect(score).toBe(100);
  });

  it("ignores null/undefined fields without throwing", () => {
    expect(textMatchWeight("leonidas", null, undefined, "leonidas")).toBe(100);
  });

  it("returns 0 for a blank query", () => {
    expect(textMatchWeight("   ", "leonidas")).toBe(0);
  });

  it("does not treat a substring inside a longer word as a whole-word match", () => {
    // "zrp" inside "myzrpaccount" is a plain substring, not word-bounded.
    const score = textMatchWeight("zrp", "myzrpaccount");
    expect(score).toBe(25);
  });

  it("handles accented/unicode characters as word characters for boundary detection", () => {
    const score = textMatchWeight("zurich", "visiting zürich soon");
    // "zurich" (no umlaut) won't literally match "zürich" - this just
    // confirms the regex doesn't throw on non-ASCII input either way.
    expect(score).toBe(0);
    expect(textMatchWeight("zürich", "visiting zürich soon")).toBe(50);
  });
});
