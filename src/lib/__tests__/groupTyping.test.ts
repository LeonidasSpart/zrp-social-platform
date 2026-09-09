import { describe, it, expect } from "vitest";
import { describeGroupTyping } from "@/lib/groupTyping";

describe("describeGroupTyping", () => {
  it("returns none for an empty list", () => {
    expect(describeGroupTyping([])).toEqual({ kind: "none" });
  });

  it("returns none when every entry is blank", () => {
    expect(describeGroupTyping(["", "   "])).toEqual({ kind: "none" });
  });

  it("returns the single typer's name for exactly one", () => {
    expect(describeGroupTyping(["Alice"])).toEqual({ kind: "one", name: "Alice" });
  });

  it("returns both names, in order, for exactly two", () => {
    expect(describeGroupTyping(["Alice", "Bob"])).toEqual({
      kind: "two",
      name1: "Alice",
      name2: "Bob",
    });
  });

  it("collapses three or more into a count", () => {
    expect(describeGroupTyping(["Alice", "Bob", "Carol"])).toEqual({ kind: "many", count: 3 });
  });

  it("keeps counting correctly well beyond three", () => {
    expect(describeGroupTyping(["A", "B", "C", "D", "E"])).toEqual({ kind: "many", count: 5 });
  });

  it("ignores blank entries mixed in with real names", () => {
    expect(describeGroupTyping(["Alice", "", "Bob"])).toEqual({
      kind: "two",
      name1: "Alice",
      name2: "Bob",
    });
  });
});
