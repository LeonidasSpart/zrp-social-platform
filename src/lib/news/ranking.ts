import type { NewsConfidence, NewsTopic } from "@prisma/client";
import { isTravelTopic } from "./config";

/*
 * Importance scoring: decides which of the stories available this cycle
 * are worth a slot, and in what order. Nothing here creates content -
 * if the ranked list is empty, the cycle publishes nothing, which is
 * the correct outcome for a quiet hour.
 */

export interface RankingInput {
  sourceCount: number;
  bestTrustTier: number;
  confidence: NewsConfidence;
  isBreaking: boolean;
  topic: NewsTopic;
  firstSeenAt: Date;
  now: Date;
}

/** Hours after which a story is too stale to be worth publishing. */
export const MAX_STORY_AGE_HOURS = 36;

export function ageHours(firstSeenAt: Date, now: Date): number {
  return Math.max(0, (now.getTime() - firstSeenAt.getTime()) / (1000 * 60 * 60));
}

/**
 * Score in roughly 0..10. The weights encode the editorial priorities
 * from the top down: corroboration first, then authority, then
 * freshness, then whether it is genuinely breaking.
 */
export function scoreStory(input: RankingInput): number {
  const { sourceCount, bestTrustTier, confidence, isBreaking, topic, firstSeenAt, now } = input;

  // Corroboration: two sources is worth much more than one, five is not
  // worth much more than four - hence log rather than linear.
  const corroboration = Math.min(3.5, Math.log2(Math.max(1, sourceCount)) * 2);

  // Authority: tier 1 (official) 2.0, tier 2 1.0, tier 3 0.25.
  const authority = bestTrustTier <= 1 ? 2 : bestTrustTier === 2 ? 1 : 0.25;

  // Confidence: an unconfirmed story is actively penalised, so it only
  // ever wins a slot when nothing better exists - and even then it is
  // labelled as unconfirmed in the post itself.
  const confidenceScore =
    confidence === "CONFIRMED" ? 1.5 : confidence === "DEVELOPING" ? 0.5 : -1.5;

  // Freshness decays smoothly to zero at MAX_STORY_AGE_HOURS.
  const age = ageHours(firstSeenAt, now);
  const freshness = age >= MAX_STORY_AGE_HOURS ? 0 : 2 * (1 - age / MAX_STORY_AGE_HOURS);

  // Breaking is a real signal, but only when something corroborates it:
  // a single hedged source shouting "BREAKING" earns nothing.
  const breaking = isBreaking && sourceCount >= 2 && confidence !== "UNCONFIRMED" ? 1.5 : 0;

  // Travel is a first-class category for ZRP, given a small standing
  // bump so travel disruption is not permanently outranked by politics.
  const travel = isTravelTopic(topic) ? 0.5 : 0;

  const score = corroboration + authority + confidenceScore + freshness + breaking + travel;
  return Math.max(0, Math.round(score * 100) / 100);
}

/** A story below this score is not worth a slot in anyone's feed. */
export const MIN_PUBLISHABLE_SCORE = 2.5;

export function isPublishable(score: number, ageHoursValue: number): boolean {
  return score >= MIN_PUBLISHABLE_SCORE && ageHoursValue < MAX_STORY_AGE_HOURS;
}
