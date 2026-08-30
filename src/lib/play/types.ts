import type { TranslationKey } from "@/lib/translations";

export type PlayChallengeType = "TRIVIA" | "MEMORY" | "LOGIC";
export type PlayDuelStatus = "PENDING" | "ACCEPTED" | "DECLINED" | "COMPLETED" | "EXPIRED";

export interface PlayUserSummary {
  id: string;
  username: string;
  name: string | null;
  avatarUrl: string | null;
  badgeType?: string | null;
}

export interface PlayChallengeSummary {
  id: string;
  type: PlayChallengeType;
  title: string;
  description: string | null;
  difficulty: string;
  maxScore: number;
  isDaily?: boolean;
  isAiGenerated?: boolean;
  playCount: number;
  createdAt?: string;
  creator: PlayUserSummary | null;
  _count?: { attempts: number };
}

export interface TriviaQuestion {
  q: string;
  options: string[];
  correctIndex?: number;
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
  answer?: string;
}

export interface PlayChallengeDetail extends PlayChallengeSummary {
  content: TriviaContent | MemoryContent | LogicContent;
  status?: string;
  alreadyPlayed?: boolean;
}

export interface PlayDuelSummary {
  id: string;
  status: PlayDuelStatus;
  challengerId: string;
  opponentId: string;
  challengerScore: number | null;
  opponentScore: number | null;
  winnerId: string | null;
  createdAt: string;
  expiresAt: string;
  completedAt: string | null;
  challenge: {
    id: string;
    type: PlayChallengeType;
    title: string;
    difficulty: string;
  };
  challenger: PlayUserSummary;
  opponent: PlayUserSummary;
}

export interface PlayProfileStats {
  totalXp: number;
  level: number;
  currentStreak: number;
  longestStreak: number;
  challengesCompleted: number;
  duelsWon: number;
  duelsPlayed: number;
  xpIntoLevel?: number;
  xpForLevel?: number;
  xpToNextLevel?: number;
  progressRatio?: number;
}

export interface PlayAchievement {
  key: string;
  name: string;
  description: string;
  icon: string;
  xpReward: number;
  unlockedAt?: string;
}

export interface PlayLeaderboardEntry {
  rank: number;
  userId: string;
  totalXp: number;
  level: number;
  currentStreak?: number;
  challengesCompleted?: number;
  duelsWon?: number;
  user: PlayUserSummary & { country?: string | null };
}

export const DIFFICULTY_LABEL_KEYS: Record<string, TranslationKey> = {
  easy: "play.difficultyEasy",
  medium: "play.difficultyMedium",
  hard: "play.difficultyHard",
};

export const TYPE_LABEL_KEYS: Record<PlayChallengeType, TranslationKey> = {
  TRIVIA: "play.typeTrivia",
  MEMORY: "play.typeMemory",
  LOGIC: "play.typeLogic",
};

// Client-safe display metadata mirroring src/lib/play/achievements.ts
// (server-only: it imports prisma). Kept in sync manually since unlock
// predicates live server-side only - this array never needs them, it's
// used purely to render the full catalog (locked + unlocked) on the
// achievements page.
export const PLAY_ACHIEVEMENT_CATALOG: PlayAchievement[] = [
  { key: "first_steps", name: "First Steps", description: "Complete your first ZRP PLAY challenge.", icon: "Footprints", xpReward: 10 },
  { key: "getting_started", name: "Getting Started", description: "Complete 10 challenges.", icon: "Rocket", xpReward: 25 },
  { key: "challenge_champion", name: "Challenge Champion", description: "Complete 50 challenges.", icon: "Trophy", xpReward: 75 },
  { key: "play_legend", name: "PLAY Legend", description: "Complete 200 challenges.", icon: "Crown", xpReward: 200 },
  { key: "duel_debut", name: "Duel Debut", description: "Complete your first 1v1 duel.", icon: "Swords", xpReward: 10 },
  { key: "duel_warrior", name: "Duel Warrior", description: "Win 10 duels.", icon: "Sword", xpReward: 50 },
  { key: "duel_champion", name: "Duel Champion", description: "Win 50 duels.", icon: "ShieldCheck", xpReward: 150 },
  { key: "on_fire", name: "On Fire", description: "Reach a 3-day play streak.", icon: "Flame", xpReward: 20 },
  { key: "unstoppable", name: "Unstoppable", description: "Reach a 7-day play streak.", icon: "Zap", xpReward: 50 },
  { key: "dedication", name: "Dedication", description: "Reach a 30-day play streak.", icon: "Medal", xpReward: 150 },
];

export const DUEL_STATUS_LABEL_KEYS: Record<PlayDuelStatus, TranslationKey> = {
  PENDING: "play.pending",
  ACCEPTED: "play.accepted",
  DECLINED: "play.declined",
  COMPLETED: "play.completed",
  EXPIRED: "play.expired",
};
