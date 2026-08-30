import { prisma } from "@/lib/db";
import { awardXp } from "./xp";

export interface PlayAchievementDef {
  key: string;
  name: string;
  description: string;
  icon: string; // lucide-react icon name, rendered by AchievementBadge
  xpReward: number;
  isUnlocked: (profile: {
    challengesCompleted: number;
    duelsWon: number;
    duelsPlayed: number;
    currentStreak: number;
    longestStreak: number;
  }) => boolean;
}

// The full achievement catalog lives here in code rather than the
// database - it's small, static, and shipping a new achievement should
// never need a data migration. Only which ones a user has unlocked is
// stored (PlayUserAchievement).
export const PLAY_ACHIEVEMENTS: PlayAchievementDef[] = [
  {
    key: "first_steps",
    name: "First Steps",
    description: "Complete your first ZRP PLAY challenge.",
    icon: "Footprints",
    xpReward: 10,
    isUnlocked: (p) => p.challengesCompleted >= 1,
  },
  {
    key: "getting_started",
    name: "Getting Started",
    description: "Complete 10 challenges.",
    icon: "Rocket",
    xpReward: 25,
    isUnlocked: (p) => p.challengesCompleted >= 10,
  },
  {
    key: "challenge_champion",
    name: "Challenge Champion",
    description: "Complete 50 challenges.",
    icon: "Trophy",
    xpReward: 75,
    isUnlocked: (p) => p.challengesCompleted >= 50,
  },
  {
    key: "play_legend",
    name: "PLAY Legend",
    description: "Complete 200 challenges.",
    icon: "Crown",
    xpReward: 200,
    isUnlocked: (p) => p.challengesCompleted >= 200,
  },
  {
    key: "duel_debut",
    name: "Duel Debut",
    description: "Complete your first 1v1 duel.",
    icon: "Swords",
    xpReward: 10,
    isUnlocked: (p) => p.duelsPlayed >= 1,
  },
  {
    key: "duel_warrior",
    name: "Duel Warrior",
    description: "Win 10 duels.",
    icon: "Sword",
    xpReward: 50,
    isUnlocked: (p) => p.duelsWon >= 10,
  },
  {
    key: "duel_champion",
    name: "Duel Champion",
    description: "Win 50 duels.",
    icon: "ShieldCheck",
    xpReward: 150,
    isUnlocked: (p) => p.duelsWon >= 50,
  },
  {
    key: "on_fire",
    name: "On Fire",
    description: "Reach a 3-day play streak.",
    icon: "Flame",
    xpReward: 20,
    isUnlocked: (p) => p.currentStreak >= 3,
  },
  {
    key: "unstoppable",
    name: "Unstoppable",
    description: "Reach a 7-day play streak.",
    icon: "Zap",
    xpReward: 50,
    isUnlocked: (p) => p.currentStreak >= 7,
  },
  {
    key: "dedication",
    name: "Dedication",
    description: "Reach a 30-day play streak.",
    icon: "Medal",
    xpReward: 150,
    isUnlocked: (p) => p.longestStreak >= 30,
  },
];

export function getAchievementDef(key: string): PlayAchievementDef | undefined {
  return PLAY_ACHIEVEMENTS.find((a) => a.key === key);
}

// Checks a user's updated PlayProfile counters against the catalog,
// awards XP + records any newly-met achievements, and returns their
// definitions so the caller can surface "Achievement unlocked!" to the
// client and fire notifications.
export async function checkAndAwardAchievements(
  userId: string,
  profile: {
    challengesCompleted: number;
    duelsWon: number;
    duelsPlayed: number;
    currentStreak: number;
    longestStreak: number;
  }
): Promise<PlayAchievementDef[]> {
  const alreadyUnlocked = await prisma.playUserAchievement.findMany({
    where: { userId },
    select: { achievementKey: true },
  });
  const unlockedKeys = new Set(alreadyUnlocked.map((a) => a.achievementKey));

  const newlyUnlocked = PLAY_ACHIEVEMENTS.filter(
    (def) => !unlockedKeys.has(def.key) && def.isUnlocked(profile)
  );

  for (const def of newlyUnlocked) {
    await prisma.playUserAchievement.create({
      data: { userId, achievementKey: def.key },
    });
    await awardXp(userId, def.xpReward);
  }

  return newlyUnlocked;
}
