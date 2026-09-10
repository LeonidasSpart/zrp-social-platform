import { describe, it, expect } from "vitest";
import {
  extractNumbers,
  extractQuotes,
  extractUrls,
  MAX_BODY_LENGTH,
  MIN_BODY_LENGTH,
  spelledNumbersIn,
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

  // Real bug, found via production output: two unrelated numbers in
  // different sentences or paragraphs were merged into one bogus token
  // (e.g. "2026" and "01" became "202601"), which then matched nothing
  // in the source material and failed the whole rendition for a figure
  // the model never actually wrote.
  it("does not merge two unrelated numbers across a sentence boundary", () => {
    expect(extractNumbers("It happened in 2026. 01 officials confirmed it.")).toEqual([
      "2026",
      "1",
    ]);
  });

  it("does not merge two unrelated numbers across a paragraph break", () => {
    expect(extractNumbers("The toll was 47.\n\n200 more are missing.")).toEqual(["47", "200"]);
  });

  it("still treats European space-grouped thousands as one number", () => {
    expect(extractNumbers("1 200 personnes")).toEqual(["1200"]);
    expect(extractNumbers("12 345 678")).toEqual(["12345678"]);
  });

  // Real false rejection, taken verbatim from production: The Guardian
  // wrote "Forty-three people rescued", the summary correctly said
  // "43", and the validator called it an unsupported figure.
  it("accepts a digit the source spelled out in words", () => {
    const source =
      "[The Guardian] Deadly Philippines ferry fire leaves scores of people missing. " +
      "Forty-three people rescued and early death toll stands at five after blaze aboard MV June Aster.";

    const report = validateGrounded(
      bodyOf("A ferry fire off Palawan left five dead, with 43 people rescued from the vessel."),
      source
    );

    expect(report.unsupportedNumbers).toEqual([]);
    expect(report.ok).toBe(true);
  });

  it("reads spelled numbers in the other languages the pipeline writes", () => {
    expect(spelledNumbersIn("Trois volontaires et vingt-deux cyclistes")).toEqual(
      expect.arrayContaining(["3", "20", "22"])
    );
    expect(spelledNumbersIn("Drei Menschen")).toContain("3");
    expect(spelledNumbersIn("Tre volontari in bici")).toContain("3");
  });

  it("still rejects a figure the source never stated in any form", () => {
    const report = validateGrounded(
      bodyOf("Around 340 flights were cancelled after the storm."),
      "[Example Wire] Forty-three flights were cancelled."
    );
    expect(report.ok).toBe(false);
    expect(report.unsupportedNumbers).toContain("340");
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
