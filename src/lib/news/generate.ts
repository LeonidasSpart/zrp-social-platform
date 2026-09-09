import OpenAI from "openai";
import type { NewsConfidence, NewsTopic } from "@prisma/client";
import { validateGrounded, describeReport, MAX_BODY_LENGTH } from "./grounding";
import type { GroundednessReport, NewsLanguage } from "./types";

/*
 * ============================================================
 * AI summarisation and localisation
 * ============================================================
 *
 * The model's only job is writing: turning source material that has
 * already been fetched, deduplicated, classified and ranked into a
 * concise original summary. It is never asked what happened, only to
 * restate what the sources say.
 *
 * Three hard rules, enforced in code rather than trusted to the prompt:
 *
 *  1. The model receives the source material and nothing else. It has
 *     no tools, no browsing, no memory of other stories.
 *  2. Every output is run through validateGrounded() before it can be
 *     stored as READY. Invented figures, quotes or links fail it.
 *  3. Each language is written from the same source material, not
 *     translated from another translation - so a flaw in the English
 *     summary cannot propagate into French, German and Italian.
 *
 * If generation fails, the rendition is FAILED and nothing publishes.
 * There is no placeholder text anywhere in this file.
 */

/*
 * ⚠️ Request bounds.
 *
 * The OpenAI SDK defaults to a 600s timeout and 2 retries - up to 1800s
 * for a single call. The cron route that drives this pipeline has a 300s
 * budget, and one cycle can make dozens of calls, so on the SDK defaults
 * a single hung request runs the platform's function timeout out: stage
 * 5 never executes, nothing publishes even though summaries were ready,
 * the NewsJobRun is left RUNNING forever, and the dashboard reports a
 * cycle that never finished.
 *
 * These bounds are sized against that 300s budget and are asserted
 * against it in __tests__/generate.http.integration.test.ts.
 */
export const NEWS_MODEL_TIMEOUT_MS = 45_000;

// One retry, not two: a 429 or a blip deserves a second attempt, a third
// just spends the cycle's remaining budget.
export const NEWS_MODEL_MAX_RETRIES = 1;

/**
 * Builds the model client.
 *
 * Same lazy-init pattern as ZRP AI and ZRP PLAY: never constructed at
 * module/build time, only per call, so a missing DEEPSEEK_API_KEY can
 * never break a build.
 *
 * `baseURL` is overridable so tests can point the real SDK at a local
 * OpenAI-compatible endpoint and exercise genuine HTTP behaviour
 * (timeouts, 5xx, malformed bodies) with the exact production timeout
 * and retry configuration.
 */
export function createNewsModelClient(
  options: { apiKey?: string; baseURL?: string } = {}
): OpenAI {
  const apiKey = options.apiKey ?? process.env.DEEPSEEK_API_KEY;
  if (!apiKey) throw new Error("DEEPSEEK_API_KEY is not configured");

  return new OpenAI({
    apiKey,
    baseURL: options.baseURL ?? "https://api.deepseek.com",
    timeout: NEWS_MODEL_TIMEOUT_MS,
    maxRetries: NEWS_MODEL_MAX_RETRIES,
  });
}

function getModelClient(): OpenAI {
  return createNewsModelClient();
}

export const NEWS_MODEL = "deepseek-v4-flash";

const LANGUAGE_NAMES: Record<NewsLanguage, string> = {
  en: "English",
  fr: "French",
  de: "German",
  it: "Italian",
};

export interface GenerationContext {
  storyTitle: string;
  sourceMaterial: string;
  topic: NewsTopic;
  confidence: NewsConfidence;
  isTravel: boolean;
  publishers: string[];
}

export interface GeneratedRendition {
  headline: string;
  body: string;
  model: string;
  validation: GroundednessReport;
}

export class GenerationError extends Error {
  constructor(
    message: string,
    readonly validation: GroundednessReport | null = null
  ) {
    super(message);
    this.name = "GenerationError";
  }
}

/** Marker the model returns when the material will not support a summary. */
const INSUFFICIENT = "INSUFFICIENT";

export function buildSystemPrompt(language: NewsLanguage, context: GenerationContext): string {
  const languageName = LANGUAGE_NAMES[language];

  const travelGuidance = context.isTravel
    ? `
This is a ZRP Travel update. Where — and only where — the source material actually states them, cover: the affected location, the affected services, the expected duration, and the official advice for travellers. Omit any of those the sources do not mention. Never guess at a duration or an advisory.`
    : "";

  const confidenceGuidance =
    context.confidence === "CONFIRMED"
      ? "The sources corroborate this story. Write plainly."
      : context.confidence === "DEVELOPING"
        ? "This story is still developing. Attribute claims to the reporting sources and do not present them as settled."
        : "This story is UNCONFIRMED. Attribute every claim explicitly to the source that made it and make the uncertainty obvious.";

  return `You are an editorial summariser for the ZRP News Network. You write concise, factual, original news summaries in ${languageName}.

ABSOLUTE RULES:
- Use ONLY facts present in the SOURCE MATERIAL below. Add nothing.
- Never invent or estimate a number, date, name, location, statistic or quotation. If a figure is not in the source material, it must not appear in your summary.
- Never include a quotation unless the exact words appear in the source material.
- Never write a URL or a link. Attribution is added separately by the system.
- Do not copy sentences from the source material. Write an original summary in your own words.
- Do not editorialise, sensationalise, speculate, or predict.
- If the source material is too thin to support an accurate summary, reply with exactly: ${INSUFFICIENT}

${confidenceGuidance}${travelGuidance}

FORMAT:
Return a JSON object: {"headline": string, "body": string}
- "headline": a clear factual headline in ${languageName}, at most 110 characters, no publisher name, no clickbait.
- "body": 2 to 4 short paragraphs of natural ${languageName}, separated by blank lines, ${MAX_BODY_LENGTH} characters maximum in total. Write idiomatic ${languageName} — this is an original summary for ${languageName} readers, not a word-for-word translation.
Return ONLY the JSON object.`;
}

export function buildUserPrompt(context: GenerationContext): string {
  return `SOURCE MATERIAL (from ${context.publishers.join(", ")}):

${context.sourceMaterial}

Write the summary now.`;
}

/**
 * Generates one rendition in one language.
 *
 * Throws GenerationError on every failure path - a missing key,
 * malformed model output, an INSUFFICIENT response, or failed
 * groundedness validation. The caller records the failure against the
 * rendition; nothing partial is ever returned.
 */
export async function generateRendition(
  language: NewsLanguage,
  context: GenerationContext,
  options: { client?: OpenAI } = {}
): Promise<GeneratedRendition> {
  const client = options.client ?? getModelClient();

  let response;
  try {
    response = await client.chat.completions.create({
      model: NEWS_MODEL,
      messages: [
        { role: "system", content: buildSystemPrompt(language, context) },
        { role: "user", content: buildUserPrompt(context) },
      ],
      // Low temperature: this is restatement, not creative writing.
      temperature: 0.2,
      max_tokens: 900,
      response_format: { type: "json_object" },
    });
  } catch (error) {
    throw new GenerationError(
      `Model request failed: ${error instanceof Error ? error.message : String(error)}`
    );
  }

  const raw = response.choices[0]?.message?.content?.trim();
  if (!raw) throw new GenerationError("Model returned an empty response");

  if (raw.toUpperCase().includes(INSUFFICIENT) && raw.length < 60) {
    throw new GenerationError("Source material was insufficient for an accurate summary");
  }

  let parsed: { headline?: unknown; body?: unknown };
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new GenerationError("Model returned output that was not valid JSON");
  }

  const headline = typeof parsed.headline === "string" ? parsed.headline.trim() : "";
  const body = typeof parsed.body === "string" ? parsed.body.trim() : "";

  if (!headline || !body) {
    throw new GenerationError("Model response was missing a headline or body");
  }

  // Validate headline and body together: a fabricated figure in the
  // headline is exactly as bad as one in the body.
  const validation = validateGrounded(`${headline}\n\n${body}`, context.sourceMaterial);

  if (!validation.ok) {
    throw new GenerationError(
      `Generated ${LANGUAGE_NAMES[language]} summary failed groundedness validation (${describeReport(validation)})`,
      validation
    );
  }

  return {
    headline: headline.slice(0, 200),
    body,
    model: NEWS_MODEL,
    validation,
  };
}

export interface RenditionOutcome {
  language: NewsLanguage;
  rendition: GeneratedRendition | null;
  error: string | null;
  validation: GroundednessReport | null;
  /**
   * True when this language was never attempted because the cycle ran
   * out of its generation budget. Distinct from a failure: the story is
   * left alone so the next cycle can pick it up, rather than being
   * rejected for something it did not do wrong.
   */
  skippedForBudget?: boolean;
}

export const BUDGET_EXHAUSTED_MESSAGE =
  "Skipped: the cycle's generation budget was exhausted before this language was attempted";

/**
 * Generates renditions for several languages.
 *
 * English is generated first and is treated as a gate: if the story
 * cannot be summarised accurately in English, it is not summarised in
 * any language either. That is deliberate - "translate it anyway and
 * see" is how a bad summary becomes four bad summaries.
 */
export async function generateRenditions(
  languages: NewsLanguage[],
  context: GenerationContext,
  options: { client?: OpenAI; deadline?: number } = {}
): Promise<RenditionOutcome[]> {
  const ordered = [
    ...languages.filter((language) => language === "en"),
    ...languages.filter((language) => language !== "en"),
  ];

  const outcomes: RenditionOutcome[] = [];
  const { deadline } = options;

  for (const language of ordered) {
    // Checked before each language, not just before each story: four
    // languages at the per-request timeout would otherwise be able to
    // overrun the whole cycle on their own.
    if (deadline !== undefined && Date.now() >= deadline) {
      outcomes.push({
        language,
        rendition: null,
        error: BUDGET_EXHAUSTED_MESSAGE,
        validation: null,
        skippedForBudget: true,
      });
      continue;
    }

    try {
      const rendition = await generateRendition(language, context, options);
      outcomes.push({ language, rendition, error: null, validation: rendition.validation });
    } catch (error) {
      const generationError = error instanceof GenerationError ? error : null;
      outcomes.push({
        language,
        rendition: null,
        error: error instanceof Error ? error.message : String(error),
        validation: generationError?.validation ?? null,
      });

      if (language === "en") {
        // English failed: stop, and report the remaining languages as
        // not attempted rather than silently dropping them.
        for (const remaining of ordered.slice(outcomes.length)) {
          outcomes.push({
            language: remaining,
            rendition: null,
            error:
              "Skipped: the English summary failed validation, so no localisation was attempted",
            validation: null,
          });
        }
        break;
      }
    }
  }

  return outcomes;
}
