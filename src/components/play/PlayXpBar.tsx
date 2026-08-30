"use client";

import { useLanguage } from "@/contexts/LanguageContext";

interface PlayXpBarProps {
  level: number;
  progressRatio: number;
  xpIntoLevel: number;
  xpForLevel: number;
  compact?: boolean;
}

export default function PlayXpBar({ level, progressRatio, xpIntoLevel, xpForLevel, compact }: PlayXpBarProps) {
  const { t } = useLanguage();
  const pct = Math.max(0, Math.min(1, progressRatio)) * 100;

  return (
    <div className={compact ? "w-full" : "w-full max-w-xs"}>
      <div className="flex items-center justify-between text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
        <span>{t("play.level", { n: level })}</span>
        <span className="text-gray-400 dark:text-gray-500">
          {xpIntoLevel}/{xpForLevel} XP
        </span>
      </div>
      <div className="h-2 rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden">
        <div
          className="h-full rounded-full bg-gradient-to-r from-zrp-red to-zrp-darkRed transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
