import { describe, it, expect } from "vitest";
import {
  extractNumbers,
  extractQuotes,
  extractUrls,
  MAX_BODY_LENGTH,
  MIN_BODY_LENGTH,
  validateGrounded,
} from "../grounding";

const SOURCE = `[Example Wire] Geneva airport closed after overnight storm
Around 120 flights were cancelled. The airport authority said "operations will resume at midday". Roughly 1,400 passengers were affected.`;

function bodyOf(text: string): string {
  // Pad to a realistic summary length so length checks do not mask the
  // thing each test is actually asserting.
  return text.padEnd(MIN_BODY_LENGTH + 20, " filler words about the same event.");
}

describe("validateGrounded", () => {
  it("accepts a summary whose every figure appears in the source material", () => {
    const report = validateGrounded(
      bodyOf("Geneva airport closed overnight. Around 120 flights were cancelled and about 1400 passengers were affected."),
      SOURCE
    );
    expect(report.ok).toBe(true);
    expect(report.unsupportedNumbers).toEqual([]);
  });

  it("rejects a figure the sources never contained", () => {
    const report = validateGrounded(
      bodyOf("Geneva airport closed overnight. Around 340 flights were cancelled."),
      SOURCE
    );
    expect(report.ok).toBe(false);
    expect(report.unsupportedNumbers).toContain("340");
  });

  it("treats a different thousands separator as the same number", () => {
    expect(extractNumbers("1,400 and 1.400 and 1400")).toEqual(["1400", "1400", "1400"]);
    const report = validateGrounded(
      bodyOf("About 1,400 passengers were affected by the closure."),
      SOURCE
    );
    expect(report.ok).toBe(true);
  });

  it("rejects a quotation the sources never carried", () => {
    const report = validateGrounded(
      bodyOf('An official said "this is the worst disruption in a decade" on Tuesday.'),
      SOURCE
    );
    expect(report.ok).toBe(false);
    expect(report.fabricatedQuotes).toBe(1);
  });

  it("accepts a quotation that is present in the source material", () => {
    const report = validateGrounded(
      bodyOf('The airport authority said "operations will resume at midday" in its statement.'),
      SOURCE
    );
    expect(report.ok).toBe(true);
    expect(report.fabricatedQuotes).toBe(0);
  });

  it("rejects any URL, because the system attaches the source link itself", () => {
    const report = validateGrounded(
      bodyOf("Read more at https://example.org/news/geneva-airport for details."),
      SOURCE
    );
    expect(report.ok).toBe(false);
    expect(report.injectedUrls).toEqual(["https://example.org/news/geneva-airport"]);
  });

  it("rejects output that is too short to be a summary", () => {
    const report = validateGrounded("Airport closed.", SOURCE);
    expect(report.ok).toBe(false);
    expect(report.tooShort).toBe(true);
  });

  it("rejects output long enough to be reproducing an article", () => {
    const report = validateGrounded("word ".repeat(MAX_BODY_LENGTH), SOURCE);
    expect(report.ok).toBe(false);
    expect(report.tooLong).toBe(true);
  });
});

describe("extractors", () => {
  it("finds number-like tokens including percentages and separators", () => {
    expect(extractNumbers("up 4% to 1,250 in 2026")).toEqual(["4", "1250", "2026"]);
  });

  it("ignores short scare quotes and finds real quotations", () => {
    expect(extractQuotes('a "short" one')).toEqual([]);
    expect(extractQuotes('he said "this is a long enough quotation to matter"')).toEqual([
      "this is a long enough quotation to matter",
    ]);
  });

  it("finds URLs", () => {
    expect(extractUrls("see http://a.example and https://b.example/x")).toEqual([
      "http://a.example",
      "https://b.example/x",
    ]);
  });
});
