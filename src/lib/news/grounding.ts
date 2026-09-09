import type { GroundednessReport } from "./types";

/*
 * ============================================================
 * Groundedness validation
 * ============================================================
 *
 * The rule the whole system rests on: the model summarises, it never
 * adds. This is the mechanical check that enforces it, run over every
 * generated rendition in every language before anything can be
 * published.
 *
 * It cannot prove a summary is true. What it can do - and does - is
 * catch the specific ways a language model invents things:
 *
 *  - a number that appears nowhere in the source material
 *  - a quotation the sources never contained
 *  - a URL the model produced on its own
 *  - output far shorter or longer than a summary should be
 *
 * A rendition that fails is marked FAILED and never published. There is
 * no "publish anyway" path, and no fallback that writes something
 * generic instead: when generation cannot be trusted, the correct
 * output is nothing.
 */

export const MIN_BODY_LENGTH = 160;
export const MAX_BODY_LENGTH = 1400;

/** Digit-only form of a number, so "1,200" and "1200" compare equal. */
function normalizeNumber(raw: string): string {
  return raw.replace(/[.,\s'’]/g, "");
}

/** Every number-like token in a piece of text, in normalized form. */
export function extractNumbers(text: string): string[] {
  const matches = text.match(/\d[\d.,'’\s]*\d|\d/g) || [];
  return matches
    .map((match) => normalizeNumber(match).replace(/^0+(?=\d)/, ""))
    .filter((value) => value.length > 0);
}

/** Quoted spans long enough to be a real quotation rather than scare quotes. */
export function extractQuotes(text: string): string[] {
  const matches = text.match(/["“”«»]([^"“”«»]{15,300})["“”«»]/g) || [];
  return matches.map((match) => match.replace(/^["“”«»]|["“”«»]$/g, "").trim());
}

export function extractUrls(text: string): string[] {
  return text.match(/https?:\/\/[^\s)>\]]+/gi) || [];
}

function normalizeForComparison(text: string): string {
  return text
    .toLowerCase()
    .replace(/[\s ]+/g, " ")
    .trim();
}

/**
 * Checks generated text against the source material it was written
 * from.
 *
 * Numbers are compared as digit strings and are also accepted when the
 * source contains them with a different thousands separator. A number
 * present in the source in any form passes; anything else is
 * unsupported, and one unsupported number fails the whole rendition -
 * "roughly right" is not a standard news can be published to.
 */
export function validateGrounded(
  generated: string,
  sourceMaterial: string
): GroundednessReport {
  const sourceNumbers = new Set(extractNumbers(sourceMaterial));
  const normalizedSource = normalizeForComparison(sourceMaterial);

  const unsupportedNumbers = Array.from(new Set(extractNumbers(generated))).filter(
    (value) => !sourceNumbers.has(value)
  );

  const fabricatedQuotes = extractQuotes(generated).filter(
    (quote) => !normalizedSource.includes(normalizeForComparison(quote))
  ).length;

  // The source link is attached by format.ts from the stored
  // attribution record, never written by the model. Any URL inside the
  // generated body is therefore invented by definition.
  const injectedUrls = extractUrls(generated);

  const length = generated.trim().length;
  const tooShort = length < MIN_BODY_LENGTH;
  const tooLong = length > MAX_BODY_LENGTH;

  return {
    ok:
      unsupportedNumbers.length === 0 &&
      fabricatedQuotes === 0 &&
      injectedUrls.length === 0 &&
      !tooShort &&
      !tooLong,
    unsupportedNumbers,
    fabricatedQuotes,
    injectedUrls,
    tooLong,
    tooShort,
  };
}

export function describeReport(report: GroundednessReport): string {
  const problems: string[] = [];
  if (report.unsupportedNumbers.length) {
    problems.push(`unsupported figures: ${report.unsupportedNumbers.join(", ")}`);
  }
  if (report.fabricatedQuotes) {
    problems.push(`${report.fabricatedQuotes} quotation(s) not present in the sources`);
  }
  if (report.injectedUrls.length) {
    problems.push(`model-generated link(s): ${report.injectedUrls.join(", ")}`);
  }
  if (report.tooShort) problems.push("summary too short");
  if (report.tooLong) problems.push("summary too long");
  return problems.join("; ") || "ok";
}
