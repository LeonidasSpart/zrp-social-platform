import { describe, it, expect } from "vitest";
import {
  validateChallengeContent,
  stripAnswers,
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
} from "../scoring";

describe("validateChallengeContent", () => {
  it("rejects non-object content for any type", () => {
    expect(validateChallengeContent("TRIVIA", null)).toBeTruthy();
    expect(validateChallengeContent("TRIVIA", "nope")).toBeTruthy();
  });

  describe("TRIVIA", () => {
    const valid: TriviaContent = { questions: [{ q: "2+2?", options: ["3", "4"], correctIndex: 1 }] };
    it("accepts valid content", () => {
      expect(validateChallengeContent("TRIVIA", valid)).toBeNull();
    });
    it("rejects zero questions", () => {
      expect(validateChallengeContent("TRIVIA", { questions: [] })).toBeTruthy();
    });
    it("rejects more than 20 questions", () => {
      const questions = Array.from({ length: 21 }, () => ({ q: "x", options: ["a", "b"], correctIndex: 0 }));
      expect(validateChallengeContent("TRIVIA", { questions })).toBeTruthy();
    });
    it("rejects a question with < 2 options", () => {
      expect(
        validateChallengeContent("TRIVIA", { questions: [{ q: "x", options: ["a"], correctIndex: 0 }] })
      ).toBeTruthy();
    });
    it("rejects an out-of-range correctIndex", () => {
      expect(
        validateChallengeContent("TRIVIA", { questions: [{ q: "x", options: ["a", "b"], correctIndex: 5 }] })
      ).toBeTruthy();
    });
  });

  describe("MEMORY", () => {
    it("accepts 3-12 unique pairs", () => {
      expect(validateChallengeContent("MEMORY", { pairs: ["a", "b", "c"] })).toBeNull();
    });
    it("rejects fewer than 3 pairs", () => {
      expect(validateChallengeContent("MEMORY", { pairs: ["a", "b"] })).toBeTruthy();
    });
    it("rejects duplicate pairs", () => {
      expect(validateChallengeContent("MEMORY", { pairs: ["a", "a", "b"] })).toBeTruthy();
    });
  });

  describe("LOGIC", () => {
    it("accepts multiple-choice content", () => {
      expect(
        validateChallengeContent("LOGIC", { prompt: "riddle", options: ["a", "b"], correctIndex: 0 })
      ).toBeNull();
    });
    it("accepts free-text content", () => {
      expect(validateChallengeContent("LOGIC", { prompt: "riddle", answer: "banana" })).toBeNull();
    });
    it("rejects a prompt with neither options nor a free-text answer", () => {
      expect(validateChallengeContent("LOGIC", { prompt: "riddle" })).toBeTruthy();
    });
  });

  describe("REACTION", () => {
    it("accepts a rounds count between 3 and 10", () => {
      expect(validateChallengeContent("REACTION", { rounds: 5 })).toBeNull();
    });
    it("rejects fewer than 3 rounds", () => {
      expect(validateChallengeContent("REACTION", { rounds: 2 })).toBeTruthy();
    });
    it("rejects more than 10 rounds", () => {
      expect(validateChallengeContent("REACTION", { rounds: 11 })).toBeTruthy();
    });
    it("rejects a non-integer rounds value", () => {
      expect(validateChallengeContent("REACTION", { rounds: 5.5 })).toBeTruthy();
    });
  });

  describe("SEQUENCE", () => {
    it("accepts 4-12 items", () => {
      expect(validateChallengeContent("SEQUENCE", { sequence: ["a", "b", "c", "d"] })).toBeNull();
    });
    it("rejects fewer than 4 items", () => {
      expect(validateChallengeContent("SEQUENCE", { sequence: ["a", "b"] })).toBeTruthy();
    });
    it("allows repeated items (unlike MEMORY)", () => {
      expect(validateChallengeContent("SEQUENCE", { sequence: ["a", "a", "a", "a"] })).toBeNull();
    });
    it("rejects a blank item", () => {
      expect(validateChallengeContent("SEQUENCE", { sequence: ["a", "", "c", "d"] })).toBeTruthy();
    });
  });
});

describe("stripAnswers", () => {
  it("removes correctIndex from every TRIVIA question", () => {
    const content: TriviaContent = { questions: [{ q: "2+2?", options: ["3", "4"], correctIndex: 1 }] };
    const stripped = stripAnswers("TRIVIA", content) as TriviaContent;
    expect(stripped.questions[0]).not.toHaveProperty("correctIndex");
    expect(stripped.questions[0].options).toEqual(["3", "4"]);
  });

  it("does not strip MEMORY pairs - the game is about memory, not secrecy", () => {
    const content: MemoryContent = { pairs: ["a", "b", "c"] };
    expect(stripAnswers("MEMORY", content)).toEqual(content);
  });

  it("removes correctIndex/answer from LOGIC content", () => {
    const content: LogicContent = { prompt: "riddle", options: ["a", "b"], correctIndex: 1 };
    const stripped = stripAnswers("LOGIC", content) as LogicContent;
    expect(stripped).not.toHaveProperty("correctIndex");
    expect(stripped.prompt).toBe("riddle");
  });

  it("does not strip SEQUENCE content - same rationale as MEMORY", () => {
    const content: SequenceContent = { sequence: ["a", "b", "c", "d"] };
    expect(stripAnswers("SEQUENCE", content)).toEqual(content);
  });
});

describe("scoreTrivia", () => {
  const content: TriviaContent = {
    questions: [
      { q: "q1", options: ["a", "b"], correctIndex: 0 },
      { q: "q2", options: ["a", "b"], correctIndex: 1 },
    ],
  };

  it("scores 100 for all-correct answers", () => {
    expect(scoreTrivia(content, [0, 1]).score).toBe(100);
  });
  it("scores 0 for all-wrong answers", () => {
    expect(scoreTrivia(content, [1, 0]).score).toBe(0);
  });
  it("ignores malformed/non-array answers rather than throwing", () => {
    expect(scoreTrivia(content, null).score).toBe(0);
    expect(scoreTrivia(content, "not an array" as unknown).score).toBe(0);
  });
  it("does not credit an out-of-range or spoofed answer index", () => {
    expect(scoreTrivia(content, [999, 1]).score).toBe(50);
  });
});

describe("scoreMemory", () => {
  const content: MemoryContent = { pairs: ["a", "b", "c", "d"] };

  it("gives partial credit capped below 50 for an incomplete match", () => {
    const r = scoreMemory(content, { matchedPairs: 2, moves: 10 });
    expect(r.score).toBeLessThan(50);
    expect(r.score).toBeGreaterThan(0);
  });
  it("gives full score for a perfect (fewest-moves) completion", () => {
    const r = scoreMemory(content, { matchedPairs: 4, moves: 4 });
    expect(r.score).toBe(100);
  });
  it("never scores below the 0.3 efficiency floor once complete", () => {
    const r = scoreMemory(content, { matchedPairs: 4, moves: 400 });
    expect(r.score).toBe(30);
  });
  it("clamps a spoofed matchedPairs above the real pair count", () => {
    const r = scoreMemory(content, { matchedPairs: 999, moves: 4 });
    expect(r.score).toBeLessThanOrEqual(100);
  });
});

describe("scoreLogic", () => {
  it("scores multiple-choice by exact index match", () => {
    const content: LogicContent = { prompt: "p", options: ["a", "b"], correctIndex: 1 };
    expect(scoreLogic(content, { answerIndex: 1 }).score).toBe(100);
    expect(scoreLogic(content, { answerIndex: 0 }).score).toBe(0);
  });
  it("scores free text case-insensitively and trimmed", () => {
    const content: LogicContent = { prompt: "p", answer: "Banana" };
    expect(scoreLogic(content, { answerText: "  banana  " }).score).toBe(100);
    expect(scoreLogic(content, { answerText: "apple" }).score).toBe(0);
  });
});

describe("scoreReaction", () => {
  const content: ReactionContent = { rounds: 3 };

  it("rejects an impossibly fast time as a false start rather than trusting it", () => {
    const r = scoreReaction(content, { reactionTimesMs: [1, 1, 1] });
    expect(r.validRounds).toBe(0);
    expect(r.score).toBe(0);
  });
  it("scores a plausible fast average highly", () => {
    const r = scoreReaction(content, { reactionTimesMs: [180, 190, 170] });
    expect(r.validRounds).toBe(3);
    expect(r.score).toBeGreaterThan(80);
  });
  it("penalizes missed rounds via the completion ratio, not just the average", () => {
    const complete = scoreReaction(content, { reactionTimesMs: [300, 300, 300] });
    const partial = scoreReaction({ rounds: 3 }, { reactionTimesMs: [300] });
    expect(partial.score).toBeLessThan(complete.score);
  });
  it("treats a non-array / spoofed submission as zero rounds played", () => {
    expect(scoreReaction(content, { reactionTimesMs: "999" as unknown as number[] }).score).toBe(0);
    expect(scoreReaction(content, {}).score).toBe(0);
  });
  it("ignores extra entries beyond the challenge's round count", () => {
    const r = scoreReaction(content, { reactionTimesMs: [200, 200, 200, 1, 1, 1] });
    expect(r.validRounds).toBe(3);
  });
});

describe("scoreSequence", () => {
  const content: SequenceContent = { sequence: ["a", "b", "c", "d"] };

  it("scores 100 for an exact reproduction", () => {
    expect(scoreSequence(content, { reproduced: ["a", "b", "c", "d"] }).score).toBe(100);
  });
  it("scores by correct prefix length, stopping at the first mistake", () => {
    const r = scoreSequence(content, { reproduced: ["a", "b", "x", "d"] });
    expect(r.correctPrefix).toBe(2);
    expect(r.score).toBe(50);
  });
  it("does not give credit for a correct item appearing after a mistake", () => {
    const r = scoreSequence(content, { reproduced: ["x", "b", "c", "d"] });
    expect(r.correctPrefix).toBe(0);
    expect(r.score).toBe(0);
  });
  it("handles a malformed/non-array reproduction without throwing", () => {
    expect(scoreSequence(content, {}).score).toBe(0);
    expect(scoreSequence(content, { reproduced: "abcd" as unknown as string[] }).score).toBe(0);
  });
});
