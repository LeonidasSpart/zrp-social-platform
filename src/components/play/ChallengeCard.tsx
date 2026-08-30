"use client";

import Link from "next/link";
import { BrainCircuit, LayoutGrid, Puzzle, Sparkles } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import VerifiedBadge from "@/components/VerifiedBadge";
import { DIFFICULTY_LABEL_KEYS, TYPE_LABEL_KEYS, type PlayChallengeSummary } from "@/lib/play/types";

const TYPE_ICON = {
  TRIVIA: BrainCircuit,
  MEMORY: LayoutGrid,
  LOGIC: Puzzle,
} as const;

interface ChallengeCardProps {
  challenge: PlayChallengeSummary;
}

export default function ChallengeCard({ challenge }: ChallengeCardProps) {
  const { t } = useLanguage();
  const Icon = TYPE_ICON[challenge.type];

  return (
    <Link
      href={`/play/challenge/${challenge.id}`}
      className="group flex flex-col gap-2 p-4 bg-white dark:bg-zrp-deepBlack rounded-xl border border-gray-200 dark:border-gray-700 hover:border-zrp-red hover:shadow-md transition"
    >
      <div className="flex items-center justify-between">
        <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-zrp-red">
          <Icon className="w-3.5 h-3.5" />
          {t(TYPE_LABEL_KEYS[challenge.type])}
        </span>
        {challenge.isAiGenerated && <Sparkles className="w-3.5 h-3.5 text-gray-400" aria-hidden="true" />}
      </div>
      <h3 className="font-semibold text-gray-900 dark:text-white line-clamp-2">{challenge.title}</h3>
      {challenge.description && (
        <p className="text-xs text-gray-500 dark:text-gray-400 line-clamp-2">{challenge.description}</p>
      )}
      <div className="flex items-center justify-between mt-1 text-xs text-gray-500 dark:text-gray-400">
        <span className="capitalize">{t(DIFFICULTY_LABEL_KEYS[challenge.difficulty] || DIFFICULTY_LABEL_KEYS.medium)}</span>
        <span>{t("play.plays", { n: challenge.playCount })}</span>
      </div>
      {challenge.creator && (
        <div className="flex items-center gap-1 text-[11px] text-gray-400 dark:text-gray-500">
          {t("play.by", { name: challenge.creator.username })}
          <VerifiedBadge badgeType={challenge.creator.badgeType} />
        </div>
      )}
    </Link>
  );
}
