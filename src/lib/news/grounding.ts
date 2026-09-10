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

/*
 * Real bug, found via production output: the previous pattern
 * (`\d[\d.,'’\s]*\d`) let ANY run of digits/separators/whitespace count
 * as one number, with no limit on how much whitespace could sit
 * between two digit groups. Two completely unrelated numbers in
 * different sentences - "...in 2026. 01 officials..." - or different
 * paragraphs - "The toll was 47.\n\n200 more are missing." - got
 * silently merged into one bogus token ("202601", "47200"). That
 * token matches nothing in the source material (it never existed as a
 * single number anywhere), so validateGrounded rejected the whole
 * rendition as an "unsupported figure" the model never actually wrote.
 *
 * Only two separator shapes are genuinely part of one number:
 *  - punctuation immediately followed by a digit, no space: "1,400",
 *    "1.400", "1'400" (thousands or decimal separators)
 *  - a single space immediately followed by exactly three digits,
 *    possibly repeated: "1 200", "12 345 678" (European/French
 *    space-grouped thousands)
 * Anything else - a separator not immediately followed by a digit, or
 * more than one whitespace character, as at a sentence or paragraph
 * boundary - ends the number instead of bridging into the next one.
 *
 * This narrows, rather than removes, the false-merge risk: two
 * genuinely unrelated numbers exactly one space apart where the second
 * happens to be exactly three digits ("scored 47 200 attended") would
 * still merge. That is a rare coincidence next to the previous
 * behaviour, which merged across arbitrarily many sentences.
 */
const NUMBER_PATTERN = /\d{1,3}(?: \d{3})+(?:[.,]\d+)?|\d+(?:[.,'’]\d+)*|\d/g;

/** Every number-like token in a piece of text, in normalized form. */
export function extractNumbers(text: string): string[] {
  const matches = text.match(NUMBER_PATTERN) || [];
  return matches
    .map((match) => normalizeNumber(match).replace(/^0+(?=\d)/, ""))
    .filter((value) => value.length > 0);
}

/*
 * Numbers a source spelled out in words.
 *
 * Real false rejection, found in production: The Guardian's copy read
 * "Forty-three people rescued", the summary correctly said "43", and
 * the figure was reported as unsupported - the model had restated the
 * source exactly right and was rejected for it.
 *
 * Only small whole numbers are covered, and only in the four languages
 * the pipeline writes. That is deliberate: this exists to recognise a
 * figure the source really did state, never to guess at one. Anything
 * outside this list is still treated as unsupported.
 */
const SPELLED_NUMBERS: Record<string, number> = {
  // English
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8,
  nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14,
  fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19,
  twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70,
  eighty: 80, ninety: 90, hundred: 100, thousand: 1000,
  // French
  un: 1, une: 1, deux: 2, trois: 3, quatre: 4, cinq: 5, six_fr: 6, sept: 7,
  huit: 8, neuf: 9, dix: 10, onze: 11, douze: 12, treize: 13, quatorze: 14,
  quinze: 15, seize: 16, vingt: 20, trente: 30, quarante: 40, cinquante: 50,
  soixante: 60, cent: 100, mille: 1000,
  // German
  eins: 1, zwei: 2, drei: 3, vier: 4, fuenf: 5, sechs: 6, sieben: 7, acht: 8,
  neun: 9, zehn: 10, elf: 11, zwoelf: 12, zwanzig: 20, dreissig: 30,
  vierzig: 40, fuenfzig: 50, hundert: 100, tausend: 1000,
  // Italian
  uno: 1, due: 2, tre: 3, quattro: 4, cinque: 5, sei: 6, sette: 7, otto: 8,
  nove: 9, dieci: 10, undici: 11, dodici: 12, venti: 20, trenta: 30,
  quaranta: 40, cinquanta: 50, cento: 100, mille_it: 1000,
};

/**
 * Digit forms of every number the source spelled out in words, so a
 * summary that writes "43" for a source's "Forty-three" is recognised
 * as grounded. Handles the hyphenated tens-and-units forms ("forty-
 * three", "quarante-trois") as well as the bare words.
 */
export function spelledNumbersIn(text: string): string[] {
  const words = text.toLowerCase().split(/[^a-zà-ÿ]+/).filter(Boolean);
  const found: string[] = [];

  for (let index = 0; index < words.length; index += 1) {
    const value = SPELLED_NUMBERS[words[index]];
    if (value === undefined) continue;

    found.push(String(value));

    // "forty-three" / "quarante-trois": a tens word directly followed by
    // a units word is one number, and the source's own hyphen has
    // already been split away above.
    if (value >= 20 && value < 100 && value % 10 === 0) {
      const next = SPELLED_NUMBERS[words[index + 1]];
      if (next !== undefined && next >= 1 && next <= 9) {
        found.push(String(value + next));
      }
    }
  }

  return found;
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
  // A figure counts as present whether the source wrote it in digits or
  // in words - restating "Forty-three" as "43" is accurate reporting,
  // not an invented number.
  const sourceNumbers = new Set([
    ...extractNumbers(sourceMaterial),
    ...spelledNumbersIn(sourceMaterial),
  ]);
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
