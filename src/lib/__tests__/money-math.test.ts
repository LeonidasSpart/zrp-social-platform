import { describe, it, expect } from "vitest";
import { Prisma } from "@prisma/client";

// Regression coverage for the exact fee-split pattern used in the tip
// and premium-purchase routes: platformFee = amount * 10%,
// charityAmount = platformFee * 35%, creatorAmount = amount - platformFee.
// This must be exact (creatorAmount + platformFee === amount) - the
// whole reason this migrated from Float to Decimal.
function splitFee(amount: Prisma.Decimal) {
  const PLATFORM_FEE = 0.1;
  const CHARITY_PERCENTAGE = 0.35;
  const platformFee = amount.times(PLATFORM_FEE);
  const charityAmount = platformFee.times(CHARITY_PERCENTAGE);
  const creatorAmount = amount.minus(platformFee);
  return { platformFee, charityAmount, creatorAmount };
}

describe("Decimal fee-split precision", () => {
  it("creatorAmount + platformFee reconstructs the original amount exactly", () => {
    const amounts = ["19.99", "0.01", "1000000", "3.333333", "0.1", "50"];
    for (const raw of amounts) {
      const amount = new Prisma.Decimal(raw);
      const { platformFee, creatorAmount } = splitFee(amount);
      expect(creatorAmount.plus(platformFee).equals(amount)).toBe(true);
    }
  });

  it("matches the known-bad floating point case (0.1 + 0.2 style drift)", () => {
    // 19.99 * 0.1 in plain float math is 1.9990000000000003, not 1.999 -
    // Decimal must not reproduce that drift.
    const amount = new Prisma.Decimal("19.99");
    const { platformFee } = splitFee(amount);
    expect(platformFee.toString()).toBe("1.999");
  });

  it("charityAmount is a fraction of platformFee, not of the full amount", () => {
    const amount = new Prisma.Decimal("100");
    const { platformFee, charityAmount } = splitFee(amount);
    expect(platformFee.toString()).toBe("10");
    expect(charityAmount.toString()).toBe("3.5");
  });
});

describe("Decimal comparison operator trap", () => {
  it("plain `<` on two Decimal instances is lexicographic, not numeric (must never be used)", () => {
    const small = new Prisma.Decimal("9.5");
    const big = new Prisma.Decimal("10.0");
    // This is the actual bug found and fixed in ads/serve/route.ts -
    // asserting it stays broken keeps the regression test honest about
    // *why* .lessThan() is required, not just that it works.
    expect(small < big).toBe(false);
  });

  it(".lessThan()/.greaterThan() give the numerically correct answer", () => {
    const small = new Prisma.Decimal("9.5");
    const big = new Prisma.Decimal("10.0");
    expect(small.lessThan(big)).toBe(true);
    expect(big.greaterThan(small)).toBe(true);
  });

  it("plain `+` on two Decimal instances throws or produces string concatenation, not a sum", () => {
    const a = new Prisma.Decimal("9.5");
    const b = new Prisma.Decimal("0.5");
    // valueOf() returns a string, so `+` concatenates rather than adds.
    expect((a as unknown as string) + (b as unknown as string)).toBe("9.50.5");
    expect(a.plus(b).toString()).toBe("10");
  });
});
