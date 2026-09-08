import { describe, it, expect } from "vitest";
import {
  buttonClasses,
  fieldControlClasses,
  FIELD_BORDER_CLASS,
  FIELD_BORDER_INVALID_CLASS,
} from "../styles";

// ─── Contrast, computed rather than asserted from memory ─────────────
// The primary button's resting colour is a correction, not a
// preference: the codebase's dominant primary is `bg-zrp-red
// text-white`, and white on #FF2D2D does not reach WCAG AA for normal
// text. These helpers keep that decision honest - if someone later
// switches the resting fill back to zrp-red, the contrast test fails
// and says why.
function relativeLuminance(hex: string): number {
  const channels = hex.replace("#", "").match(/../g)!.map((pair) => {
    const v = parseInt(pair, 16) / 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

const WHITE = "#FFFFFF";
const ZRP_RED = "#FF2D2D";
const ZRP_DARK_RED = "#B10000";

describe("brand colour contrast (the reason primary is darkRed)", () => {
  it("white on zrp-red fails AA for normal text, so it cannot be the resting fill", () => {
    expect(contrastRatio(WHITE, ZRP_RED)).toBeLessThan(4.5);
  });

  it("white on zrp-darkRed passes AA comfortably", () => {
    expect(contrastRatio(WHITE, ZRP_DARK_RED)).toBeGreaterThanOrEqual(4.5);
  });

  it("primary resting fill is zrp-darkRed, with zrp-red kept for hover", () => {
    // Tokenised, not substring-matched: "hover:bg-zrp-red" contains
    // "bg-zrp-red", so a naive `not.toContain` would fail on the very
    // class it is meant to allow.
    const tokens = buttonClasses({ variant: "primary" }).split(/\s+/);
    expect(tokens).toContain("bg-zrp-darkRed");
    expect(tokens).toContain("hover:bg-zrp-red");
    expect(tokens).not.toContain("bg-zrp-red");
  });
});

describe("buttonClasses", () => {
  it("defaults to the primary variant at medium size", () => {
    const cls = buttonClasses();
    expect(cls).toBe(buttonClasses({ variant: "primary", size: "md" }));
  });

  it("uses one radius for every variant, so the same button cannot drift", () => {
    const variants = ["primary", "secondary", "quiet", "destructive"] as const;
    for (const variant of variants) {
      expect(buttonClasses({ variant })).toContain("rounded-full");
    }
  });

  it("keeps md and lg at or above the 44px touch minimum", () => {
    expect(buttonClasses({ size: "md" })).toContain("min-h-[44px]");
    expect(buttonClasses({ size: "lg" })).toContain("min-h-[48px]");
  });

  it("gives every variant a visible focus ring", () => {
    const variants = ["primary", "secondary", "quiet", "destructive"] as const;
    for (const variant of variants) {
      expect(buttonClasses({ variant })).toContain("focus-visible:ring-zrp-red");
    }
  });

  it("only the primary variant carries a brand fill", () => {
    expect(buttonClasses({ variant: "secondary" })).not.toContain("bg-zrp-");
    expect(buttonClasses({ variant: "quiet" })).not.toContain("bg-zrp-");
    expect(buttonClasses({ variant: "destructive" })).not.toContain("bg-zrp-");
  });

  it("adds a full-width class only when asked", () => {
    expect(buttonClasses({ fullWidth: true })).toContain("w-full");
    expect(buttonClasses()).not.toContain("w-full");
  });

  it("every variant states a dark-mode treatment", () => {
    const variants = ["primary", "secondary", "quiet", "destructive"] as const;
    for (const variant of variants) {
      expect(buttonClasses({ variant })).toContain("dark:");
    }
  });
});

describe("fieldControlClasses", () => {
  it("uses the container radius, so stacked fields cannot disagree", () => {
    expect(fieldControlClasses()).toContain("rounded-xl");
    expect(fieldControlClasses(true)).toContain("rounded-xl");
  });

  it("carries invalid state on the border rather than tinting the fill", () => {
    expect(fieldControlClasses(true)).toContain(FIELD_BORDER_INVALID_CLASS);
    expect(fieldControlClasses(false)).toContain(FIELD_BORDER_CLASS);
    expect(fieldControlClasses(true)).not.toContain("bg-red");
  });

  it("keeps placeholder text at the readable floor, not gray-400", () => {
    expect(fieldControlClasses()).toContain("placeholder:text-gray-500");
  });
});
