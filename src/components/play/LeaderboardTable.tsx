"use client";

import Link from "next/link";
import { useSession } from "next-auth/react";
import { Crown } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import VerifiedBadge from "@/components/VerifiedBadge";
import type { PlayLeaderboardEntry } from "@/lib/play/types";

interface LeaderboardTableProps {
  entries: PlayLeaderboardEntry[];
}

export default function LeaderboardTable({ entries }: LeaderboardTableProps) {
  const { t } = useLanguage();
  const { data: session } = useSession();
  const myId = session?.user?.id;

  return (
    <div className="flex flex-col divide-y divide-gray-100 dark:divide-gray-800 bg-white dark:bg-zrp-deepBlack rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
      {entries.map((entry) => (
        <Link
          key={entry.userId}
          href={`/play/profile/${entry.user.username}`}
          className={`flex items-center gap-3 px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-900 transition ${
            entry.userId === myId ? "bg-zrp-red/5" : ""
          }`}
        >
          <span className="w-6 text-center flex-shrink-0 font-bold text-sm text-gray-500 dark:text-gray-400">
            {entry.rank <= 3 ? (
              <Crown
                className={`w-4 h-4 inline ${
                  entry.rank === 1 ? "text-yellow-500" : entry.rank === 2 ? "text-gray-400" : "text-amber-700"
                }`}
              />
            ) : (
              entry.rank
            )}
          </span>
          <img
            src={entry.user.avatarUrl || "/default-avatar.png"}
            alt={entry.user.username}
            className="w-9 h-9 rounded-full object-cover flex-shrink-0"
          />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1 text-sm font-semibold text-gray-900 dark:text-white truncate">
              @{entry.user.username}
              <VerifiedBadge badgeType={entry.user.badgeType} />
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400">{t("play.level", { n: entry.level })}</p>
          </div>
          <span className="text-sm font-bold text-zrp-red flex-shrink-0">{t("play.xp", { n: entry.totalXp })}</span>
        </Link>
      ))}
    </div>
  );
}
