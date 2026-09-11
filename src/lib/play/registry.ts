import type { PlayChallengeType } from "@prisma/client";
import type { TranslationKey } from "@/lib/translations";
import {
  scoreTrivia,
  scoreMemory,
  scoreLogic,
  scoreReaction,
  scoreSequence,
  type TriviaContent,
  type MemoryContent,
  type LogicContent,
  type ReactionContent,
  type SequenceContent,
} from "./scoring";

// ─── The game registry ───────────────────────────────────────────────
// Single place that lists every PLAY game type and how its score is
// derived from a raw client submission. Content validation and answer
// stripping stay in scoring.ts (one exhaustive switch each, since those
// need the full PlayContent union anyway); this registry is the layer
// that lets call sites (submit route, create page, AI generation) stop
// hardcoding their own copy of "which types exist" and "how do I score
// type X" - adding game #6+ means adding one entry here plus the
// validate/strip/score functions in scoring.ts, not touching every
// call site's if/else chain.

export type GameCategory = "knowledge" | "memory" | "logic" | "reaction";

export interface ScoreResult {
  score: number;
  extra?: Record<string, unknown>;
}

export interface GameDefinition {
  type: PlayChallengeType;
  category: GameCategory;
  labelKey: TranslationKey;
  estimatedDurationSec: number;
  aiGenerationSupported: boolean;
  aiInstructions?: string;
  score(content: unknown, submission: Record<string, unknown>): ScoreResult;
}

export const GAME_REGISTRY: Record<PlayChallengeType, GameDefinition> = {
  TRIVIA: {
    type: "TRIVIA",
    category: "knowledge",
    labelKey: "play.typeTrivia",
    estimatedDurationSec: 60,
    aiGenerationSupported: true,
    aiInstructions: `Return JSON: {"title": string, "description": string, "content": {"questions": [{"q": string, "options": string[2..4], "correctIndex": number}]}}. Generate exactly 5 questions.`,
    score: (content, submission) => {
      const r = scoreTrivia(content as TriviaContent, submission.answers);
      return { score: r.score, extra: { correctCount: r.correctCount, total: r.total } };
    },
  },
  MEMORY: {
    type: "MEMORY",
    category: "memory",
    labelKey: "play.typeMemory",
    estimatedDurationSec: 45,
    aiGenerationSupported: true,
    aiInstructions: `Return JSON: {"title": string, "description": string, "content": {"pairs": string[6]}}. Each pair value is a short word or emoji-friendly term related to the topic, all unique.`,
    score: (content, submission) => {
      const r = scoreMemory(content as MemoryContent, submission as { moves?: number; matchedPairs?: number });
      return { score: r.score };
    },
  },
  LOGIC: {
    type: "LOGIC",
    category: "logic",
    labelKey: "play.typeLogic",
    estimatedDurationSec: 45,
    aiGenerationSupported: true,
    aiInstructions: `Return JSON: {"title": string, "description": string, "content": {"prompt": string, "options": string[2..4], "correctIndex": number}}. Write one riddle or logic puzzle related to the topic with a single clear correct answer.`,
    score: (content, submission) => {
      const r = scoreLogic(content as LogicContent, submission as { answerIndex?: number; answerText?: string });
      return { score: r.score, extra: { isCorrect: r.isCorrect } };
    },
  },
  REACTION: {
    type: "REACTION",
    category: "reaction",
    labelKey: "play.typeReaction",
    estimatedDurationSec: 20,
    aiGenerationSupported: false, // nothing topic-driven to generate - content is just a round count
    score: (content, submission) => {
      const r = scoreReaction(content as ReactionContent, submission as { reactionTimesMs?: unknown });
      return { score: r.score, extra: { validRounds: r.validRounds, totalRounds: r.totalRounds, avgMs: r.avgMs } };
    },
  },
  SEQUENCE: {
    type: "SEQUENCE",
    category: "memory",
    labelKey: "play.typeSequence",
    estimatedDurationSec: 40,
    aiGenerationSupported: true,
    aiInstructions: `Return JSON: {"title": string, "description": string, "content": {"sequence": string[6]}}. Each sequence item is a short word or emoji related to the topic, in a deliberate order (repeats allowed). Keep every item under 12 characters.`,
    score: (content, submission) => {
      const r = scoreSequence(content as SequenceContent, submission as { reproduced?: unknown });
      return { score: r.score, extra: { correctPrefix: r.correctPrefix, total: r.total } };
    },
  },
};

export const ALL_GAME_TYPES = Object.keys(GAME_REGISTRY) as PlayChallengeType[];
export const AI_SUPPORTED_GAME_TYPES = ALL_GAME_TYPES.filter((t) => GAME_REGISTRY[t].aiGenerationSupported);

export function getGame(type: PlayChallengeType): GameDefinition {
  const game = GAME_REGISTRY[type];
  if (!game) throw new Error(`Unknown PLAY game type: ${type}`);
  return game;
}
