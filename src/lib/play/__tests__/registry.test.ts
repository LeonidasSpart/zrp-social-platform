import { describe, it, expect } from "vitest";
import { GAME_REGISTRY, ALL_GAME_TYPES, AI_SUPPORTED_GAME_TYPES, getGame } from "../registry";
import type { PlayChallengeType } from "@prisma/client";

// Every type the Prisma enum actually defines must have exactly one
// registry entry - this is the "complete game inventory" check: a type
// that exists in the schema but not the registry would 500 on submit,
// and an entry whose `type` field disagrees with its own key would
// silently score under the wrong identity.
const EXPECTED_TYPES: PlayChallengeType[] = ["TRIVIA", "MEMORY", "LOGIC", "REACTION", "SEQUENCE"];

describe("GAME_REGISTRY completeness", () => {
  it("has exactly one entry per known PlayChallengeType, no duplicates or gaps", () => {
    expect(new Set(ALL_GAME_TYPES)).toEqual(new Set(EXPECTED_TYPES));
    expect(ALL_GAME_TYPES.length).toBe(EXPECTED_TYPES.length);
  });

  it("every entry's own `type` field matches the key it's registered under", () => {
    for (const type of ALL_GAME_TYPES) {
      expect(GAME_REGISTRY[type].type).toBe(type);
    }
  });

  it("every entry declares a positive estimated duration", () => {
    for (const type of ALL_GAME_TYPES) {
      expect(GAME_REGISTRY[type].estimatedDurationSec).toBeGreaterThan(0);
    }
  });

  it("an AI-generation-supported entry always carries its prompt instructions", () => {
    for (const type of AI_SUPPORTED_GAME_TYPES) {
      expect(GAME_REGISTRY[type].aiInstructions).toBeTruthy();
    }
  });

  it("getGame throws for an unregistered type instead of returning undefined", () => {
    expect(() => getGame("NOT_A_REAL_TYPE" as PlayChallengeType)).toThrow();
  });
});

describe("GAME_REGISTRY.score dispatch matches each game's real scoring rules", () => {
  it("TRIVIA: full marks for all-correct answers", () => {
    const content = { questions: [{ q: "q", options: ["a", "b"], correctIndex: 1 }] };
    expect(getGame("TRIVIA").score(content, { answers: [1] }).score).toBe(100);
  });

  it("REACTION: rejects implausibly fast times via the same bound as scoring.ts", () => {
    const content = { rounds: 3 };
    expect(getGame("REACTION").score(content, { reactionTimesMs: [1, 1, 1] }).score).toBe(0);
  });

  it("SEQUENCE: scores by correct-prefix length", () => {
    const content = { sequence: ["a", "b", "c", "d"] };
    const result = getGame("SEQUENCE").score(content, { reproduced: ["a", "b", "x", "d"] });
    expect(result.score).toBe(50);
    expect(result.extra?.correctPrefix).toBe(2);
  });
});
