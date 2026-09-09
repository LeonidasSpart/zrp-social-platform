import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  createNewsModelClient,
  generateRendition,
  generateRenditions,
  GenerationError,
  NEWS_MODEL_MAX_RETRIES,
  NEWS_MODEL_TIMEOUT_MS,
  BUDGET_EXHAUSTED_MESSAGE,
  type GenerationContext,
} from "../generate";
import { startModelServer, type ModelServer } from "./model-server";

/*
 * The model integration, exercised through the REAL openai SDK over a
 * REAL socket, using the production client factory (so the production
 * timeout and retry configuration is what is under test).
 *
 * Only the upstream model is substituted: this environment's network
 * policy denies api.deepseek.com. Everything about how ZRP talks to an
 * OpenAI-compatible endpoint - auth header, request shape, timeout,
 * retries, error propagation, JSON handling, groundedness gating - is
 * the real thing.
 */

const CONTEXT: GenerationContext = {
  storyTitle: "Example Test Authority publishes a scheduled maintenance notice",
  sourceMaterial:
    '[Example Test Authority] Scheduled maintenance notice\nAround 120 services are affected. The authority said "work will finish by midday".',
  topic: "AVIATION",
  confidence: "CONFIRMED",
  isTravel: true,
  publishers: ["Example Test Authority"],
};

const GOOD_BODY =
  "The authority published a scheduled maintenance notice affecting around 120 services. Travellers were advised to check before setting out.\n\nThe authority said work will finish by midday. Normal service is expected to resume after that.";

let server: ModelServer;

function client() {
  // The production factory, so timeout/retries are exactly what ships.
  return createNewsModelClient({ apiKey: "test-key", baseURL: server.baseURL });
}

describe("model request bounds", () => {
  it("is bounded well inside the cron route's 300s budget", () => {
    const worstCaseMs = NEWS_MODEL_TIMEOUT_MS * (NEWS_MODEL_MAX_RETRIES + 1);
    // Regression guard for the SDK defaults (600s x 3 = 1800s), which
    // would let one hung call run out the whole function budget.
    expect(worstCaseMs).toBeLessThan(300_000);
  });

  it("applies those bounds to the client the production code builds", () => {
    const built = createNewsModelClient({ apiKey: "test-key" });
    expect(built.timeout).toBe(NEWS_MODEL_TIMEOUT_MS);
    expect(built.maxRetries).toBe(NEWS_MODEL_MAX_RETRIES);
  });

  it("refuses to build a client with no API key configured", () => {
    const original = process.env.DEEPSEEK_API_KEY;
    delete process.env.DEEPSEEK_API_KEY;
    try {
      expect(() => createNewsModelClient()).toThrow(/DEEPSEEK_API_KEY/);
    } finally {
      if (original !== undefined) process.env.DEEPSEEK_API_KEY = original;
    }
  });
});

// File-scoped lifecycle: both describe blocks below share this server, so
// it must outlive the first of them rather than being closed with it.
beforeAll(async () => {
  server = await startModelServer({
    kind: "ok",
    headline: "Authority publishes maintenance notice",
    body: GOOD_BODY,
  });
});

afterAll(async () => {
  await server.close();
});

describe("model integration over real HTTP", () => {
  it("completes a real round trip and returns a validated rendition", async () => {
    server.setBehaviour({
      kind: "ok",
      headline: "Authority publishes maintenance notice",
      body: GOOD_BODY,
    });

    const rendition = await generateRendition("en", CONTEXT, { client: client() });

    expect(rendition.headline).toBe("Authority publishes maintenance notice");
    expect(rendition.validation.ok).toBe(true);
    expect(server.requestCount).toBe(1);
  });

  it("sends the API key as a bearer token", async () => {
    server.setBehaviour({
      kind: "ok",
      headline: "Authority publishes maintenance notice",
      body: GOOD_BODY,
    });
    await generateRendition("en", CONTEXT, { client: client() });
    expect(server.lastAuthHeader).toBe("Bearer test-key");
  });

  it("rejects a real hallucinated figure end to end", async () => {
    // The model answers successfully; the figure is simply not in the
    // sources. This is the single most important guard in the system.
    server.setBehaviour({
      kind: "ok",
      headline: "Authority publishes maintenance notice",
      body: GOOD_BODY.replace("120 services", "870 services"),
    });

    await expect(generateRendition("en", CONTEXT, { client: client() })).rejects.toThrow(
      GenerationError
    );
    await expect(generateRendition("en", CONTEXT, { client: client() })).rejects.toThrow(/870/);
  });

  it("propagates a real 500 as a failure, never as content", async () => {
    server.setBehaviour({ kind: "status", status: 500 });

    await expect(generateRendition("en", CONTEXT, { client: client() })).rejects.toThrow(
      /Model request failed/
    );
  });

  it("retries a 429 exactly once, then fails", async () => {
    server.setBehaviour({ kind: "status", status: 429 });

    await expect(generateRendition("en", CONTEXT, { client: client() })).rejects.toThrow(
      /Model request failed/
    );

    // The production retry budget: initial attempt + NEWS_MODEL_MAX_RETRIES.
    expect(server.requestCount).toBe(NEWS_MODEL_MAX_RETRIES + 1);
  }, 30000);

  it("treats a 401 as a failure rather than publishing anything", async () => {
    server.setBehaviour({ kind: "status", status: 401 });
    await expect(generateRendition("en", CONTEXT, { client: client() })).rejects.toThrow(
      /Model request failed/
    );
  });

  it("fails on a malformed response envelope", async () => {
    server.setBehaviour({ kind: "invalid-json-envelope" });
    await expect(generateRendition("en", CONTEXT, { client: client() })).rejects.toThrow();
  });

  it("fails when the model returns content that is not JSON", async () => {
    server.setBehaviour({ kind: "raw", content: "Here is your summary, in prose." });
    await expect(generateRendition("en", CONTEXT, { client: client() })).rejects.toThrow(
      /not valid JSON/
    );
  });

  it("fails when the model returns empty content", async () => {
    server.setBehaviour({ kind: "empty-content" });
    await expect(generateRendition("en", CONTEXT, { client: client() })).rejects.toThrow(
      /empty response/
    );
  });

  it("fails when the model declares the material insufficient", async () => {
    server.setBehaviour({ kind: "raw", content: "INSUFFICIENT" });
    await expect(generateRendition("en", CONTEXT, { client: client() })).rejects.toThrow(
      /insufficient/i
    );
  });

  it("times out on a hung endpoint instead of hanging the cycle", async () => {
    server.setBehaviour({ kind: "hang" });

    // A short-timeout client built the same way, so the assertion runs in
    // seconds while still exercising the SDK's real timeout path.
    const impatient = createNewsModelClient({ apiKey: "test-key", baseURL: server.baseURL });
    impatient.timeout = 1500;
    impatient.maxRetries = 0;

    const started = Date.now();
    await expect(generateRendition("en", CONTEXT, { client: impatient })).rejects.toThrow(
      /Model request failed/
    );
    expect(Date.now() - started).toBeLessThan(15_000);
  }, 30000);
});

describe("multi-language generation over real HTTP", () => {
  it("produces all four travel languages from one real endpoint", async () => {
    server.setBehaviour({
      kind: "ok",
      headline: "Authority publishes maintenance notice",
      body: GOOD_BODY,
    });

    const outcomes = await generateRenditions(["en", "fr", "de", "it"], CONTEXT, {
      client: client(),
    });

    expect(outcomes).toHaveLength(4);
    expect(outcomes.every((outcome) => outcome.rendition !== null)).toBe(true);
    expect(outcomes.map((outcome) => outcome.language)).toEqual(["en", "fr", "de", "it"]);
  }, 30000);

  it("stops attempting languages once the cycle's generation budget is gone", async () => {
    server.setBehaviour({
      kind: "ok",
      headline: "Authority publishes maintenance notice",
      body: GOOD_BODY,
    });

    // Deadline already passed: nothing should be attempted at all.
    const outcomes = await generateRenditions(["en", "fr", "de", "it"], CONTEXT, {
      client: client(),
      deadline: Date.now() - 1,
    });

    expect(outcomes).toHaveLength(4);
    expect(outcomes.every((outcome) => outcome.skippedForBudget)).toBe(true);
    expect(outcomes.every((outcome) => outcome.error === BUDGET_EXHAUSTED_MESSAGE)).toBe(true);
    expect(server.requestCount).toBe(0);
  });

  it("does not localise a story whose English summary failed validation", async () => {
    server.setBehaviour({
      kind: "ok",
      headline: "Authority publishes maintenance notice",
      body: GOOD_BODY.replace("120 services", "870 services"),
    });

    const outcomes = await generateRenditions(["en", "fr", "de", "it"], CONTEXT, {
      client: client(),
    });

    expect(outcomes.every((outcome) => outcome.rendition === null)).toBe(true);
    // One attempt for English, none for the rest.
    expect(server.requestCount).toBe(1);
  }, 30000);
});
