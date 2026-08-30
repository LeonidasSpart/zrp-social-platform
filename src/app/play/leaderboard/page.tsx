"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Trophy } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import LeaderboardTable from "@/components/play/LeaderboardTable";
import type { PlayLeaderboardEntry } from "@/lib/play/types";

const SCOPES = ["global", "country", "friends"] as const;

export default function PlayLeaderboardPage() {
  const { t } = useLanguage();
  const [scope, setScope] = useState<(typeof SCOPES)[number]>("global");
  const [entries, setEntries] = useState<PlayLeaderboardEntry[]>([]);
  const [myRank, setMyRank] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/play/leaderboard?scope=${scope}`)
      .then((res) => res.json())
      .then((data) => {
        setEntries(data.leaderboard || []);
        setMyRank(data.myRank ?? null);
      })
      .catch((err) => console.error("Error loading leaderboard:", err))
      .finally(() => setLoading(false));
  }, [scope]);

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      <Link href="/play" className="inline-flex items-center gap-1.5 text-sm text-gray-500 dark:text-gray-400 hover:text-zrp-red transition mb-4">
        <ArrowLeft className="w-4 h-4" />
        {t("play.backToPlay")}
      </Link>

      <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-1">{t("play.leaderboardTitle")}</h1>
      {myRank !== null && (
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">{t("play.yourRank")}: #{myRank}</p>
      )}

      <div className="flex gap-2 mb-6">
        {SCOPES.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setScope(s)}
            className={`flex-1 py-2 rounded-full text-sm font-semibold border transition ${
              scope === s ? "bg-zrp-red text-white border-zrp-red" : "border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300"
            }`}
          >
            {t(s === "global" ? "play.scopeGlobal" : s === "country" ? "play.scopeCountry" : "play.scopeFriends")}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <div className="w-8 h-8 border-4 border-zrp-red border-t-transparent rounded-full animate-spin" />
        </div>
      ) : entries.length === 0 ? (
        <div className="text-center py-16 text-gray-500 dark:text-gray-400">
          <Trophy className="w-10 h-10 mx-auto mb-3 opacity-40" />
          <p>{t("play.noLeaderboardData")}</p>
        </div>
      ) : (
        <LeaderboardTable entries={entries} />
      )}
    </div>
  );
}
