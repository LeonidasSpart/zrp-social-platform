import type { NewsConfidence, NewsTopic } from "@prisma/client";
import type { NewsLanguage } from "./types";
import { isTravelTopic } from "./config";

/*
 * ============================================================
 * Post composition
 * ============================================================
 *
 * Builds the text of the ZRP post from a generated rendition plus the
 * stored attribution records. Every label is written natively in each
 * of the four languages rather than machine-translated at runtime.
 *
 * What a post always contains:
 *   - a status label when the story is breaking, developing or
 *     unconfirmed (never silently absent)
 *   - the headline
 *   - the original 2-4 paragraph summary
 *   - a correction note, when one exists, above the sources
 *   - every source that reported it, by publisher name
 *   - the canonical link to the primary source
 *
 * What it never contains: source article text, more than a short
 * excerpt-free summary, or a link the model invented.
 */

interface Labels {
  breaking: string;
  developing: string;
  unconfirmed: string;
  travelUpdate: string;
  source: string;
  sources: string;
  correction: string;
  moreSources: (count: number) => string;
}

const LABELS: Record<NewsLanguage, Labels> = {
  en: {
    breaking: "BREAKING",
    developing: "DEVELOPING STORY",
    unconfirmed: "UNCONFIRMED — reported by a single source",
    travelUpdate: "TRAVEL UPDATE",
    source: "Source",
    sources: "Sources",
    correction: "CORRECTION",
    moreSources: (count) => `and ${count} more source${count === 1 ? "" : "s"}`,
  },
  fr: {
    breaking: "ALERTE INFO",
    developing: "INFORMATION EN COURS",
    unconfirmed: "NON CONFIRMÉ — rapporté par une seule source",
    travelUpdate: "INFO VOYAGE",
    source: "Source",
    sources: "Sources",
    correction: "CORRECTION",
    moreSources: (count) => `et ${count} autre${count === 1 ? "" : "s"} source${count === 1 ? "" : "s"}`,
  },
  de: {
    breaking: "EILMELDUNG",
    developing: "LAUFENDE MELDUNG",
    unconfirmed: "UNBESTÄTIGT — nur von einer Quelle gemeldet",
    travelUpdate: "REISE-UPDATE",
    source: "Quelle",
    sources: "Quellen",
    correction: "KORREKTUR",
    moreSources: (count) => `und ${count} weitere Quelle${count === 1 ? "" : "n"}`,
  },
  it: {
    breaking: "ULTIM'ORA",
    developing: "NOTIZIA IN AGGIORNAMENTO",
    unconfirmed: "NON CONFERMATO — riportato da una sola fonte",
    travelUpdate: "AGGIORNAMENTO VIAGGI",
    source: "Fonte",
    sources: "Fonti",
    correction: "CORREZIONE",
    moreSources: (count) => `e altre ${count} font${count === 1 ? "e" : "i"}`,
  },
};

export function labelsFor(language: string): Labels {
  return LABELS[(language as NewsLanguage)] ?? LABELS.en;
}

export interface PostSource {
  publisher: string;
  url: string;
}

export interface ComposePostInput {
  language: string;
  headline: string;
  body: string;
  topic: NewsTopic;
  confidence: NewsConfidence;
  isBreaking: boolean;
  sources: PostSource[];
  correctionNote?: string | null;
}

// Post.content is a text column, but an unbounded post is a UI problem
// as much as a storage one. This is comfortably above a 4-paragraph
// summary plus attribution.
export const MAX_POST_LENGTH = 2200;

/** How many publishers to name inline before collapsing to a count. */
const MAX_NAMED_PUBLISHERS = 4;

export function composePostContent(input: ComposePostInput): string {
  const labels = labelsFor(input.language);
  const lines: string[] = [];

  // ─── Status banner ────────────────────────────────────────────
  const banners: string[] = [];
  if (input.isBreaking && input.confidence !== "UNCONFIRMED") banners.push(labels.breaking);
  if (isTravelTopic(input.topic)) banners.push(labels.travelUpdate);
  if (input.confidence === "DEVELOPING") banners.push(labels.developing);
  if (input.confidence === "UNCONFIRMED") banners.push(labels.unconfirmed);

  if (banners.length > 0) {
    lines.push(banners.join(" · "));
    lines.push("");
  }

  lines.push(input.headline.trim());
  lines.push("");
  lines.push(input.body.trim());

  // ─── Correction ───────────────────────────────────────────────
  // Placed above the sources and clearly labelled: a correction that a
  // reader has to hunt for is not a correction.
  if (input.correctionNote && input.correctionNote.trim()) {
    lines.push("");
    lines.push(`${labels.correction}: ${input.correctionNote.trim()}`);
  }

  // ─── Attribution ──────────────────────────────────────────────
  const publishers = Array.from(new Set(input.sources.map((source) => source.publisher)));

  if (publishers.length > 0) {
    lines.push("");
    const named = publishers.slice(0, MAX_NAMED_PUBLISHERS);
    const remaining = publishers.length - named.length;
    const label = publishers.length === 1 ? labels.source : labels.sources;
    const list =
      remaining > 0
        ? `${named.join(", ")} ${labels.moreSources(remaining)}`
        : named.join(", ");
    lines.push(`${label}: ${list}`);
  }

  const primaryUrl = input.sources[0]?.url;
  if (primaryUrl) {
    lines.push(primaryUrl);
  }

  const content = lines.join("\n").trim();

  // Truncation would cut a summary mid-sentence or, worse, cut off the
  // attribution. Anything this long is a generation bug, so the caller
  // treats it as a failure rather than publishing a mangled post.
  return content;
}

export function isPostLengthValid(content: string): boolean {
  return content.length > 0 && content.length <= MAX_POST_LENGTH;
}
