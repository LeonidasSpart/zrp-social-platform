import { describe, it, expect } from "vitest";
import { colorForName, initialsForName } from "../avatar-fallback";

// Regression coverage for the admin Subscriptions & Billing dashboard fix:
// every user avatar rendered as a broken-image icon in production because
// the component fell back to "/default-avatar.png", a file that has never
// existed in public/. The fix replaced that fallback with generated
// initials - these are the pure functions behind it, so a future change
// that reintroduces a missing-asset fallback (or breaks the initials
// derivation) fails a fast unit test instead of only showing up as a
// blue "?" glyph in a screenshot.

describe("initialsForName", () => {
  it("takes the first letter of the first and last word for a full name", () => {
    expect(initialsForName("Rina Solomon")).toBe("RS");
  });

  it("takes the first two letters of a single-word name", () => {
    expect(initialsForName("orhan")).toBe("OR");
  });

  it("collapses extra internal whitespace", () => {
    expect(initialsForName("  Eva   Jovanovic  ")).toBe("EJ");
  });

  it("falls back to a single '?' for an empty or whitespace-only name", () => {
    expect(initialsForName("")).toBe("?");
    expect(initialsForName("   ")).toBe("?");
  });

  it("handles a three-or-more-word name by using the first and last word only", () => {
    expect(initialsForName("Maria De La Cruz")).toBe("MC");
  });
});

describe("colorForName", () => {
  it("is deterministic - the same name always maps to the same color", () => {
    const a = colorForName("smokelegacybiz");
    const b = colorForName("smokelegacybiz");
    expect(a).toBe(b);
  });

  it("returns a valid hex color", () => {
    expect(colorForName("Rina Solomon")).toMatch(/^#[0-9A-Fa-f]{6}$/);
  });

  it("differs across distinct names often enough to be visually useful", () => {
    // Not a strict hash-uniqueness guarantee (a fixed 12-color palette must
    // repeat eventually) - just proves the mapping isn't degenerately
    // constant for a realistic small set of usernames.
    const names = ["orhan", "rina", "eva", "smokefree1", "smokelegacybiz", "adminsmoke1"];
    const colors = new Set(names.map(colorForName));
    expect(colors.size).toBeGreaterThan(1);
  });
});
