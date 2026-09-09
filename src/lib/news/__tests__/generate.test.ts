import { describe, it, expect, vi } from "vitest";
import type OpenAI from "openai";
import { buildSystemPrompt, generateRendition, generateRenditions, GenerationError } from "../generate";
import type { GenerationContext } from "../generate";

const CONTEXT: GenerationContext = {
  storyTitle: "Geneva airport closed after overnight storm",
  sourceMaterial:
    '[Geneva Airport] Geneva airport closed after overnight storm\nAround 120 flights were cancelled. The authority said "operations will resume at midday".',
  topic: "AVIATION",
  confidence: "CONFIRMED",
  isTravel: true,
  publishers: ["Geneva Airport"],
};

/** Minimal stand-in for the model client - no network in these tests. */
function fakeClient(reply: string | Error): OpenAI {
  const create = vi.fn(async () => {
    if (reply instanceof Error) throw reply;
    return { choices: [{ message: { content: reply } }] };
  });
  return { chat: { completions: { create } } } as unknown as OpenAI;
}

const GOOD_BODY =
  "Geneva airport closed overnight after a storm, and around 120 flights were cancelled. Travellers were told to check with their airline before setting out for the airport.\n\nThe airport authority said operations will resume at midday. Departures and arrivals are both affected until then.";

describe("generateRendition", () => {
  it("returns a validated rendition when the model stays inside the source material", async () => {
    const client = fakeClient(
      JSON.stringify({ headline: "Geneva airport closed after storm", body: GOOD_BODY })
    );
    const rendition = await generateRendition("en", CONTEXT, { client });
    expect(rendition.headline).toBe("Geneva airport closed after storm");
    expect(rendition.validation.ok).toBe(true);
  });

  it("refuses a summary containing a figure the sources never gave", async () => {
    const client = fakeClient(
      JSON.stringify({
        headline: "Geneva airport closed after storm",
        body: GOOD_BODY.replace("120 flights", "480 flights"),
      })
    );
    await expect(generateRendition("en", CONTEXT, { client })).rejects.toThrow(GenerationError);
    await expect(generateRendition("en", CONTEXT, { client })).rejects.toThrow(/480/);
  });

  it("refuses a summary containing an invented quotation", async () => {
    const client = fakeClient(
      JSON.stringify({
        headline: "Geneva airport closed after storm",
        body: `${GOOD_BODY}\n\nA spokesperson said "this is the worst disruption we have ever seen".`,
      })
    );
    await expect(generateRendition("en", CONTEXT, { client })).rejects.toThrow(/quotation/);
  });

  it("refuses a summary containing a model-written link", async () => {
    const client = fakeClient(
      JSON.stringify({
        headline: "Geneva airport closed after storm",
        body: `${GOOD_BODY}\n\nMore at https://invented.example/story.`,
      })
    );
    await expect(generateRendition("en", CONTEXT, { client })).rejects.toThrow(/link/);
  });

  it("refuses when the model says the material is insufficient", async () => {
    await expect(
      generateRendition("en", CONTEXT, { client: fakeClient("INSUFFICIENT") })
    ).rejects.toThrow(/insufficient/i);
  });

  it("refuses unparseable model output rather than publishing something malformed", async () => {
    await expect(
      generateRendition("en", CONTEXT, { client: fakeClient("this is not json") })
    ).rejects.toThrow(/not valid JSON/);
  });

  it("refuses a response missing a headline or body", async () => {
    await expect(
      generateRendition("en", CONTEXT, { client: fakeClient(JSON.stringify({ headline: "x" })) })
    ).rejects.toThrow(/missing/);
  });

  it("surfaces a model outage as a failure, never as a fallback summary", async () => {
    await expect(
      generateRendition("en", CONTEXT, { client: fakeClient(new Error("503 upstream")) })
    ).rejects.toThrow(/Model request failed/);
  });
});

describe("buildSystemPrompt", () => {
  it("names the target language and forbids invention", () => {
    const prompt = buildSystemPrompt("de", CONTEXT);
    expect(prompt).toContain("German");
    expect(prompt).toContain("Never invent");
    expect(prompt).toContain("Never write a URL");
  });

  it("tells the model to say so when a story is not settled", () => {
    const prompt = buildSystemPrompt("en", { ...CONTEXT, confidence: "UNCONFIRMED" });
    expect(prompt).toContain("UNCONFIRMED");
  });

  it("adds the travel checklist only for travel stories", () => {
    expect(buildSystemPrompt("en", CONTEXT)).toContain("ZRP Travel update");
    expect(buildSystemPrompt("en", { ...CONTEXT, isTravel: false })).not.toContain(
      "ZRP Travel update"
    );
  });
});

describe("generateRenditions", () => {
  it("writes every language when the material supports it", async () => {
    const client = fakeClient(
      JSON.stringify({ headline: "Geneva airport closed after storm", body: GOOD_BODY })
    );
    const outcomes = await generateRenditions(["en", "fr", "de", "it"], CONTEXT, { client });
    expect(outcomes).toHaveLength(4);
    expect(outcomes.every((outcome) => outcome.rendition !== null)).toBe(true);
  });

  it("writes English first, so a bad summary cannot become four bad summaries", async () => {
    const client = fakeClient(
      JSON.stringify({
        headline: "Geneva airport closed",
        body: GOOD_BODY.replace("120 flights", "999 flights"),
      })
    );
    const outcomes = await generateRenditions(["fr", "en", "de"], CONTEXT, { client });

    expect(outcomes[0].language).toBe("en");
    expect(outcomes.every((outcome) => outcome.rendition === null)).toBe(true);
    expect(outcomes[1].error).toMatch(/Skipped/);
    expect(outcomes.map((outcome) => outcome.language).sort()).toEqual(["de", "en", "fr"]);
  });
});
