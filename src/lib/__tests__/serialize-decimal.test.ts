import { describe, it, expect } from "vitest";
import { Prisma } from "@prisma/client";
import { toPlainJson } from "../serialize-decimal";

describe("toPlainJson", () => {
  it("converts a top-level Decimal to a number", () => {
    const result = toPlainJson(new Prisma.Decimal("19.99"));
    expect(result).toBe(19.99);
    expect(typeof result).toBe("number");
  });

  it("converts nested Decimal fields inside an object", () => {
    const input = {
      balance: new Prisma.Decimal("100.5"),
      nested: { fee: new Prisma.Decimal("1.999") },
    };
    const result = toPlainJson(input);
    expect(result.balance).toBe(100.5);
    expect(result.nested.fee).toBe(1.999);
  });

  it("converts Decimal values inside arrays", () => {
    const input = [new Prisma.Decimal("1"), new Prisma.Decimal("2.5")];
    const result = toPlainJson(input);
    expect(result).toEqual([1, 2.5]);
  });

  it("leaves plain values, dates, and null untouched", () => {
    const date = new Date("2026-01-01T00:00:00Z");
    const input = { count: 5, label: "x", when: date, missing: null };
    const result = toPlainJson(input);
    expect(result.count).toBe(5);
    expect(result.label).toBe("x");
    expect(result.when).toBe(date);
    expect(result.missing).toBeNull();
  });

  it("round-trips correctly through JSON.stringify (the actual API response path)", () => {
    const payload = { amount: new Prisma.Decimal("42.42") };
    const serialized = JSON.parse(JSON.stringify(toPlainJson(payload)));
    expect(serialized.amount).toBe(42.42);
    expect(typeof serialized.amount).toBe("number");
  });

  it("confirms a raw (unconverted) Decimal would have serialized as a string - the bug this helper exists to prevent", () => {
    const raw = { amount: new Prisma.Decimal("42.42") };
    const serialized = JSON.parse(JSON.stringify(raw));
    expect(typeof serialized.amount).toBe("string");
  });
});
