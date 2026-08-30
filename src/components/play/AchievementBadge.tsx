"use client";

import {
  Footprints, Rocket, Trophy, Crown, Swords, Sword, ShieldCheck, Flame, Zap, Medal, Award,
  type LucideIcon,
} from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import type { PlayAchievement } from "@/lib/play/types";

const ICONS: Record<string, LucideIcon> = {
  Footprints, Rocket, Trophy, Crown, Swords, Sword, ShieldCheck, Flame, Zap, Medal,
};

interface AchievementBadgeProps {
  achievement: PlayAchievement;
  locked?: boolean;
}

export default function AchievementBadge({ achievement, locked }: AchievementBadgeProps) {
  const { t } = useLanguage();
  const Icon = ICONS[achievement.icon] || Award;

  return (
    <div
      className={`flex flex-col items-center text-center gap-2 p-4 rounded-xl border transition ${
        locked
          ? "bg-gray-50 dark:bg-gray-900 border-gray-200 dark:border-gray-800 opacity-50"
          : "bg-white dark:bg-zrp-deepBlack border-zrp-red/40 shadow-sm"
      }`}
    >
      <div
        className={`w-12 h-12 rounded-full flex items-center justify-center ${
          locked ? "bg-gray-200 dark:bg-gray-800" : "bg-gradient-to-br from-zrp-red to-zrp-darkRed"
        }`}
      >
        <Icon className={`w-6 h-6 ${locked ? "text-gray-400" : "text-white"}`} />
      </div>
      <div>
        <p className="text-sm font-semibold text-gray-900 dark:text-white">{achievement.name}</p>
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{achievement.description}</p>
        {locked && <p className="text-[10px] text-gray-400 mt-1">{t("play.locked")}</p>}
      </div>
    </div>
  );
}
