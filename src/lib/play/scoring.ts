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

export interface ReactionContent {
  rounds: number; // how many stimulus/tap rounds this challenge has
}

export interface SequenceContent {
  sequence: string[]; // ordered items (words/emoji) the player must reproduce in order
}

export type PlayContent = TriviaContent | MemoryContent | LogicContent | ReactionContent | SequenceContent;

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

  if (type === "REACTION") {
    const c = content as ReactionContent;
    if (!Number.isInteger(c.rounds) || c.rounds < 3 || c.rounds > 10) {
      return "A reaction challenge needs between 3 and 10 rounds.";
    }
    return null;
  }

  if (type === "SEQUENCE") {
    const c = content as SequenceContent;
    if (!Array.isArray(c.sequence) || c.sequence.length < 4 || c.sequence.length > 12) {
      return "A sequence challenge needs between 4 and 12 items.";
    }
    if (c.sequence.some((item) => typeof item !== "string" || !item.trim())) {
      return "Every sequence item needs a value.";
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
  if (type === "REACTION") {
    return content; // no secret to strip - the whole "content" is just a round count
  }
  if (type === "SEQUENCE") {
    return content; // the sequence itself isn't a secret - same rationale as MEMORY pairs
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

// ─── Reaction scoring ────────────────────────────────────────────────
// A reaction-time game is inherently client-measured (the server can't
// observe a human's physical tap latency without a per-tap network
// round trip, which would just add network jitter on top of the
// measurement). So this is NOT full server-authoritative timing the
// way trivia/logic/sequence answers are - it's bounded plausibility:
// anything faster than humanly possible is rejected outright rather
// than trusted, and the score curve rewards genuinely fast-but-plausible
// times. Documented as a known limitation, not silently assumed away.
const REACTION_MIN_PLAUSIBLE_MS = 80; // faster than this is not a human reaction, it's a false-start bot/macro
const REACTION_MAX_COUNTED_MS = 3000; // anything slower just contributes no credit for that round
const REACTION_FASTEST_FOR_MAX_SCORE = 150; // ms - roughly elite human visual reaction time
const REACTION_SLOWEST_FOR_ANY_SCORE = 950; // ms - beyond this a round earns 0 even if "valid"

export function scoreReaction(
  content: ReactionContent,
  submission: { reactionTimesMs?: unknown }
): { score: number; validRounds: number; totalRounds: number; avgMs: number | null } {
  const totalRounds = content.rounds;
  const raw = Array.isArray(submission.reactionTimesMs) ? submission.reactionTimesMs : [];

  // Only trust plausible entries; a false start, timeout, or an
  // impossibly fast tap all count as a missed round rather than being
  // silently coerced into something scoreable.
  const validTimes = raw
    .slice(0, totalRounds)
    .filter(
      (t): t is number =>
        typeof t === "number" && Number.isFinite(t) && t >= REACTION_MIN_PLAUSIBLE_MS && t <= REACTION_MAX_COUNTED_MS
    );

  if (validTimes.length === 0) {
    return { score: 0, validRounds: 0, totalRounds, avgMs: null };
  }

  const avgMs = validTimes.reduce((sum, t) => sum + t, 0) / validTimes.length;
  const span = REACTION_SLOWEST_FOR_ANY_SCORE - REACTION_FASTEST_FOR_MAX_SCORE;
  const speedRatio = Math.max(0, Math.min(1, (REACTION_SLOWEST_FOR_ANY_SCORE - avgMs) / span));
  const completionRatio = validTimes.length / totalRounds;
  const score = Math.round(speedRatio * MAX_SCORE * completionRatio);

  return { score, validRounds: validTimes.length, totalRounds, avgMs: Math.round(avgMs) };
}

// ─── Sequence scoring ────────────────────────────────────────────────
// Fully server-authoritative: the real sequence never left the server
// in a form the client could tamper with (it's shown to the player to
// memorize, same as MEMORY's pairs, then the client's reproduction is
// checked byte-for-byte against the stored content).
export function scoreSequence(
  content: SequenceContent,
  submission: { reproduced?: unknown }
): { score: number; correctPrefix: number; total: number } {
  const total = content.sequence.length;
  const reproduced = Array.isArray(submission.reproduced) ? (submission.reproduced as unknown[]) : [];

  let correctPrefix = 0;
  for (let i = 0; i < total; i++) {
    if (reproduced[i] === content.sequence[i]) {
      correctPrefix += 1;
    } else {
      break; // one wrong step ends the chain, same as the real Simon-says mechanic
    }
  }

  return { score: Math.round((correctPrefix / total) * MAX_SCORE), correctPrefix, total };
}
