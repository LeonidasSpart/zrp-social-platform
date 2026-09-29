import { describe, it, expect } from "vitest";
import { buildKeysetPage, parseOffsetCursor } from "../paginate";

describe("buildKeysetPage", () => {
  it("returns a null cursor when the batch is exactly the page size (no more rows)", () => {
    const rows = [{ id: "a" }, { id: "b" }];
    const page = buildKeysetPage(rows, 2);
    expect(page.items).toEqual(rows);
    expect(page.nextCursor).toBeNull();
  });

  it("trims the overfetched row and returns the last visible row's id as the cursor", () => {
    const rows = [{ id: "a" }, { id: "b" }, { id: "c" }]; // limit+1 overfetch
    const page = buildKeysetPage(rows, 2);
    expect(page.items).toEqual([{ id: "a" }, { id: "b" }]);
    expect(page.nextCursor).toBe("b");
  });

  it("handles an empty batch", () => {
    const page = buildKeysetPage([], 10);
    expect(page.items).toEqual([]);
    expect(page.nextCursor).toBeNull();
  });
});

describe("parseOffsetCursor", () => {
  it("defaults to 0 for null/invalid/negative input - never crashes on a malformed cursor", () => {
    expect(parseOffsetCursor(null)).toBe(0);
    expect(parseOffsetCursor("not-a-number")).toBe(0);
    expect(parseOffsetCursor("-5")).toBe(0);
    expect(parseOffsetCursor("")).toBe(0);
  });

  it("parses a valid positive numeric cursor", () => {
    expect(parseOffsetCursor("40")).toBe(40);
  });
});
