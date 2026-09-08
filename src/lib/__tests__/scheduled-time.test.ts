import { describe, it, expect } from "vitest";
import { resolveScheduledAt } from "../scheduled-time";

// Regression coverage for F2 (ios-native/PARITY.md): POST /api/posts used
// to do a bare `new Date(scheduledAt)` on whatever naive
// "yyyy-MM-ddTHH:mm" string <input type="datetime-local"> produces,
// which ECMAScript parses as local time IN THE SERVER'S OWN TIMEZONE
// (UTC in production) rather than the author's - an author in UTC+9
// scheduling for "09:00" got published at 09:00 UTC (18:00 for them).
describe("resolveScheduledAt", () => {
  it("parses a string already carrying a Z suffix directly, ignoring any offset argument", () => {
    const result = resolveScheduledAt("2026-06-01T09:00:00.000Z", 999);
    expect(result.toISOString()).toBe("2026-06-01T09:00:00.000Z");
  });

  it("parses a string already carrying an explicit +HH:MM offset directly", () => {
    // 09:00 in UTC+9 is 00:00 UTC the same day.
    const result = resolveScheduledAt("2026-06-01T09:00:00+09:00");
    expect(result.toISOString()).toBe("2026-06-01T00:00:00.000Z");
  });

  it("parses a string carrying a -HH:MM offset directly", () => {
    // 09:00 in UTC-5 is 14:00 UTC the same day.
    const result = resolveScheduledAt("2026-06-01T09:00:00-05:00");
    expect(result.toISOString()).toBe("2026-06-01T14:00:00.000Z");
  });

  it("applies a caller-supplied offset to a naive wall-clock string (UTC+9, matching JS getTimezoneOffset's sign)", () => {
    // An author in UTC+9 scheduling 09:00 local time: their real
    // getTimezoneOffset() there is -540. The true instant is 00:00 UTC
    // the same day - not 09:00 UTC, what the old bare `new Date(...)`
    // would have produced on a UTC server.
    const result = resolveScheduledAt("2026-06-01T09:00", -540);
    expect(result.toISOString()).toBe("2026-06-01T00:00:00.000Z");
  });

  it("applies a caller-supplied offset to a naive wall-clock string (UTC-5)", () => {
    // getTimezoneOffset() in UTC-5 is +300. 09:00 local there is 14:00 UTC.
    const result = resolveScheduledAt("2026-06-01T09:00", 300);
    expect(result.toISOString()).toBe("2026-06-01T14:00:00.000Z");
  });

  it("handles seconds in the naive string when an offset is supplied", () => {
    const result = resolveScheduledAt("2026-06-01T09:30:15", -540);
    expect(result.toISOString()).toBe("2026-06-01T00:30:15.000Z");
  });

  it("two different offsets for the same wall-clock time land on two different real instants (the exact bug this fixes)", () => {
    const tokyo = resolveScheduledAt("2026-06-01T09:00", -540); // UTC+9
    const newYorkSummer = resolveScheduledAt("2026-06-01T09:00", 240); // UTC-4 (EDT)
    expect(tokyo.getTime()).not.toBe(newYorkSummer.getTime());
    expect(tokyo.toISOString()).toBe("2026-06-01T00:00:00.000Z");
    expect(newYorkSummer.toISOString()).toBe("2026-06-01T13:00:00.000Z");
  });

  it("falls back to legacy server-timezone parsing when no offset is supplied - exact prior behavior, unchanged", () => {
    const naive = "2026-06-01T09:00";
    const result = resolveScheduledAt(naive);
    expect(result.getTime()).toBe(new Date(naive).getTime());
  });

  it("falls back to legacy parsing when the offset argument is not a finite number", () => {
    const naive = "2026-06-01T09:00";
    expect(resolveScheduledAt(naive, "not-a-number").getTime()).toBe(new Date(naive).getTime());
    expect(resolveScheduledAt(naive, undefined).getTime()).toBe(new Date(naive).getTime());
    expect(resolveScheduledAt(naive, NaN).getTime()).toBe(new Date(naive).getTime());
  });

  it("falls back to plain parsing for a string that doesn't match the naive wall-clock shape, even with an offset supplied", () => {
    const weird = "not-a-real-date-string";
    const result = resolveScheduledAt(weird, -540);
    expect(Number.isNaN(result.getTime())).toBe(true);
  });

  it("behaves like new Date() for a non-string input", () => {
    const ms = 1_800_000_000_000;
    expect(resolveScheduledAt(ms).getTime()).toBe(new Date(ms).getTime());
  });

  it("produces an Invalid Date for garbage input, matching the pre-existing new Date(scheduledAt) contract", () => {
    const result = resolveScheduledAt("garbage");
    expect(Number.isNaN(result.getTime())).toBe(true);
  });
});
