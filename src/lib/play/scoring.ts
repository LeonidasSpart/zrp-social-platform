import type { PlayChallengeType } from "@prisma/client";

// ─── Content shapes ──────────────────────────────────────────────────
// Kept intentionally flat (one JSON blob per challenge type) rather
// than a table per mini-game - see PlayChallenge.content in schema.prisma.

export interface TriviaQuestion {
  q: string;
  options: string[];
  correctIndex: number;
}
export interface TriviaContent {
  questions: TriviaQuestion[];
}

export interface MemoryContent {
  pairs: string[];
}

export interface LogicContent {
  prompt: string;
  options?: string[];
  correctIndex?: number;
  answer?: string; // free-text answer, matched case-insensitively
}

export type PlayContent = TriviaContent | MemoryContent | LogicContent;

// ─── Validation (on create) ─────────────────────────────────────────

export function validateChallengeContent(type: PlayChallengeType, content: unknown): string | null {
  if (!content || typeof content !== "object") return "Challenge content is required.";

  if (type === "TRIVIA") {
    const c = content as TriviaContent;
    if (!Array.isArray(c.questions) || c.questions.length < 1 || c.questions.length > 20) {
      return "A trivia challenge needs between 1 and 20 questions.";
    }
    for (const q of c.questions) {
      if (typeof q.q !== "string" || !q.q.trim()) return "Every question needs text.";
      if (!Array.isArray(q.options) || q.options.length < 2 || q.options.length > 6) {
        return "Every question needs between 2 and 6 answer options.";
      }
      if (
        typeof q.correctIndex !== "number" ||
        q.correctIndex < 0 ||
        q.correctIndex >= q.options.length
      ) {
        return "Every question needs a valid correct answer.";
      }
    }
    return null;
  }

  if (type === "MEMORY") {
    const c = content as MemoryContent;
    if (!Array.isArray(c.pairs) || c.pairs.length < 3 || c.pairs.length > 12) {
      return "A memory challenge needs between 3 and 12 pairs.";
    }
    if (c.pairs.some((p) => typeof p !== "string" || !p.trim())) {
      return "Every memory pair needs a value.";
    }
    if (new Set(c.pairs).size !== c.pairs.length) {
      return "Memory pairs must be unique.";
    }
    return null;
  }

  if (type === "LOGIC") {
    const c = content as LogicContent;
    if (typeof c.prompt !== "string" || !c.prompt.trim()) return "A logic challenge needs a prompt.";
    const hasMultipleChoice =
      Array.isArray(c.options) &&
      c.options.length >= 2 &&
      c.options.length <= 6 &&
      typeof c.correctIndex === "number" &&
      c.correctIndex >= 0 &&
      c.correctIndex < c.options.length;
    const hasFreeText = typeof c.answer === "string" && c.answer.trim().length > 0;
    if (!hasMultipleChoice && !hasFreeText) {
      return "A logic challenge needs either multiple-choice options with a correct answer, or a free-text answer.";
    }
    return null;
  }

  return "Unknown challenge type.";
}

// ─── Strip answers (for serving a challenge to a player about to attempt it) ──

export function stripAnswers(type: PlayChallengeType, content: PlayContent): unknown {
  if (type === "TRIVIA") {
    const c = content as TriviaContent;
    return {
      questions: c.questions.map((q) => ({ q: q.q, options: q.options })),
    };
  }
  if (type === "MEMORY") {
    return content; // pairs themselves aren't a secret - the game is about memory, not hidden data
  }
  if (type === "LOGIC") {
    const c = content as LogicContent;
    return { prompt: c.prompt, options: c.options };
  }
  return content;
}

// ─── Scoring (on submit) ─────────────────────────────────────────────

const MAX_SCORE = 100;

export function scoreTrivia(content: TriviaContent, answers: unknown): { score: number; correctCount: number; total: number } {
  const submitted = Array.isArray(answers) ? (answers as number[]) : [];
  const total = content.questions.length;
  let correctCount = 0;
  content.questions.forEach((q, i) => {
    if (submitted[i] === q.correctIndex) correctCount += 1;
  });
  return { score: Math.round((correctCount / total) * MAX_SCORE), correctCount, total };
}

export function scoreMemory(content: MemoryContent, submission: { moves?: number; matchedPairs?: number }): { score: number } {
  const pairCount = content.pairs.length;
  const matchedPairs = Math.max(0, Math.min(pairCount, submission.matchedPairs ?? 0));
  const moves = Math.max(matchedPairs, submission.moves ?? pairCount * 2);

  if (matchedPairs < pairCount) {
    // Didn't finish - partial credit for pairs actually matched.
    return { score: Math.round((matchedPairs / pairCount) * MAX_SCORE * 0.5) };
  }

  // Fewest possible moves to match every pair is `pairCount` (perfect
  // memory); efficiency decays smoothly from there.
  const efficiency = pairCount / moves;
  return { score: Math.round(Math.max(0.3, efficiency) * MAX_SCORE) };
}

export function scoreLogic(
  content: LogicContent,
  submission: { answerIndex?: number; answerText?: string }
): { score: number; isCorrect: boolean } {
  let isCorrect = false;
  if (typeof content.correctIndex === "number") {
    isCorrect = submission.answerIndex === content.correctIndex;
  } else if (typeof content.answer === "string") {
    isCorrect = (submission.answerText || "").trim().toLowerCase() === content.answer.trim().toLowerCase();
  }
  return { score: isCorrect ? MAX_SCORE : 0, isCorrect };
}
