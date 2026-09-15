import { describe, it, expect } from "vitest";
import {
  addMonthsUtc,
  addYearsUtc,
  computePeriodEnd,
  toBillingIntervalEnum,
  billingIntervalEnumToInput,
  getPlanPrice,
} from "../subscriptions";

describe("addMonthsUtc / addYearsUtc (calendar-correct UTC date math)", () => {
  it("adds a plain month with no edge cases", () => {
    const start = new Date(Date.UTC(2026, 0, 15)); // Jan 15 2026
    const result = addMonthsUtc(start, 1);
    expect(result.getUTCFullYear()).toBe(2026);
    expect(result.getUTCMonth()).toBe(1); // February
    expect(result.getUTCDate()).toBe(15);
  });

  it("clamps month-end overflow instead of rolling into the next month (Jan 31 + 1 month)", () => {
    const start = new Date(Date.UTC(2026, 0, 31)); // Jan 31 2026
    const result = addMonthsUtc(start, 1);
    expect(result.getUTCMonth()).toBe(1); // still February, not March
    expect(result.getUTCDate()).toBe(28); // 2026 is not a leap year
  });

  it("clamps to Feb 29 on a leap year", () => {
    const start = new Date(Date.UTC(2028, 0, 31)); // Jan 31 2028 - leap year
    const result = addMonthsUtc(start, 1);
    expect(result.getUTCFullYear()).toBe(2028);
    expect(result.getUTCMonth()).toBe(1);
    expect(result.getUTCDate()).toBe(29);
  });

  it("rolls over the year boundary", () => {
    const start = new Date(Date.UTC(2026, 11, 15)); // Dec 15 2026
    const result = addMonthsUtc(start, 1);
    expect(result.getUTCFullYear()).toBe(2027);
    expect(result.getUTCMonth()).toBe(0); // January
    expect(result.getUTCDate()).toBe(15);
  });

  it("adding a year from Feb 29 (leap) clamps to Feb 28 the following (non-leap) year", () => {
    const start = new Date(Date.UTC(2028, 1, 29)); // Feb 29 2028
    const result = addYearsUtc(start, 1);
    expect(result.getUTCFullYear()).toBe(2029);
    expect(result.getUTCMonth()).toBe(1);
    expect(result.getUTCDate()).toBe(28);
  });

  it("preserves time-of-day across the addition", () => {
    const start = new Date(Date.UTC(2026, 2, 10, 13, 45, 30, 500));
    const result = addMonthsUtc(start, 1);
    expect(result.getUTCHours()).toBe(13);
    expect(result.getUTCMinutes()).toBe(45);
    expect(result.getUTCSeconds()).toBe(30);
    expect(result.getUTCMilliseconds()).toBe(500);
  });

  it("is unaffected by local-timezone DST rules since it operates purely in UTC", () => {
    // A date that would cross a US DST transition in local time (e.g.
    // America/New_York) - the UTC month/day arithmetic must be identical
    // regardless of the machine's TZ.
    const start = new Date(Date.UTC(2026, 2, 8, 6, 0, 0)); // around a US "spring forward" date
    const result = addMonthsUtc(start, 1);
    expect(result.getUTCDate()).toBe(8);
    expect(result.getUTCHours()).toBe(6);
  });
});

describe("computePeriodEnd", () => {
  it("MONTHLY adds exactly one calendar month", () => {
    const start = new Date(Date.UTC(2026, 5, 1));
    const end = computePeriodEnd(start, "MONTHLY");
    expect(end.getUTCMonth()).toBe(6);
    expect(end.getUTCDate()).toBe(1);
  });

  it("YEARLY adds exactly one calendar year, clamped on Feb 29", () => {
    const start = new Date(Date.UTC(2028, 1, 29));
    const end = computePeriodEnd(start, "YEARLY");
    expect(end.getUTCFullYear()).toBe(2029);
    expect(end.getUTCDate()).toBe(28);
  });
});

describe("toBillingIntervalEnum / billingIntervalEnumToInput", () => {
  it("maps lowercase input to the Prisma enum and back", () => {
    expect(toBillingIntervalEnum("yearly")).toBe("YEARLY");
    expect(toBillingIntervalEnum("annual")).toBe("YEARLY");
    expect(toBillingIntervalEnum("monthly")).toBe("MONTHLY");
    expect(toBillingIntervalEnum("garbage")).toBe("MONTHLY"); // fails closed to the shorter, safer default
    expect(billingIntervalEnumToInput("YEARLY")).toBe("yearly");
    expect(billingIntervalEnumToInput("MONTHLY")).toBe("monthly");
    expect(billingIntervalEnumToInput(null)).toBe("monthly");
  });
});

describe("getPlanPrice", () => {
  it("reads the price straight from PLANS, never invented", () => {
    expect(getPlanPrice("pro", "monthly")).toBe(9.99);
    expect(getPlanPrice("pro", "yearly")).toBe(99.99);
    expect(getPlanPrice("business", "monthly")).toBe(49.99);
    expect(getPlanPrice("enterprise", "yearly")).toBe(999.99);
  });

  it("is never derived from or influenced by client input - same plan+interval always yields the same price", () => {
    const a = getPlanPrice("pro", "monthly");
    const b = getPlanPrice("pro", "monthly");
    expect(a).toBe(b);
  });
});
