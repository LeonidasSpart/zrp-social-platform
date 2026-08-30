"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { Gamepad2, Plus, Swords, Trophy, Sparkles } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import PlayXpBar from "@/components/play/PlayXpBar";
import ChallengeCard from "@/components/play/ChallengeCard";
import DuelCard from "@/components/play/DuelCard";
import { TYPE_LABEL_KEYS } from "@/lib/play/types";
import type { PlayChallengeDetail, PlayChallengeSummary, PlayDuelSummary, PlayLeaderboardEntry, PlayProfileStats } from "@/lib/play/types";

interface PlayHomeData {
  dailyChallenge: (PlayChallengeDetail & { alreadyPlayed: boolean }) | null;
  trending: PlayChallengeSummary[];
  topLeaderboard: PlayLeaderboardEntry[];
  myProfile: (PlayProfileStats & { userId: string }) | null;
  pendingDuels: PlayDuelSummary[];
  activeDuels: PlayDuelSummary[];
}

export default function PlayHomePage() {
  const { t } = useLanguage();
  const { data: session } = useSession();
  const [data, setData] = useState<PlayHomeData | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyDuelId, setBusyDuelId] = useState<string | null>(null);

  const load = () => {
    fetch("/api/play/home")
      .then((res) => res.json())
      .then(setData)
      .catch((err) => console.error("Error loading PLAY home:", err))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, []);

  const respondToDuel = async (duelId: string, action: "accept" | "decline") => {
    setBusyDuelId(duelId);
    try {
      await fetch(`/api/play/duels/${duelId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      load();
    } catch (err) {
      console.error("Error responding to duel:", err);
    } finally {
      setBusyDuelId(null);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-24">
        <div className="w-8 h-8 border-4 border-zrp-red border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-6">
      {/* Hero */}
      <section className="relative bg-gradient-to-br from-zrp-darkRed to-zrp-deepBlack rounded-2xl px-6 py-10 text-center mb-8">
        <div className="flex items-center justify-center gap-2">
          <Gamepad2 className="w-8 h-8 text-white" />
          <h1 className="text-3xl sm:text-4xl font-extrabold font-orbitron text-white">{t("play.heroTitle")}</h1>
        </div>
        <p className="mt-3 text-white/80 max-w-xl mx-auto">{t("play.heroSubtitle")}</p>

        {session?.user && data?.myProfile && (
          <div className="mt-6 max-w-xs mx-auto">
            <PlayXpBar
              level={data.myProfile.level}
              progressRatio={data.myProfile.progressRatio ?? 0}
              xpIntoLevel={data.myProfile.xpIntoLevel ?? 0}
              xpForLevel={data.myProfile.xpForLevel ?? 100}
            />
          </div>
        )}

        <div className="mt-6 flex flex-wrap justify-center gap-3">
          {session?.user && (
            <Link
              href="/play/create"
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-white text-zrp-darkRed rounded-full font-semibold hover:bg-gray-100 transition text-sm"
            >
              <Plus className="w-4 h-4" />
              {t("play.createChallenge")}
            </Link>
          )}
          <Link
            href="/play/duels"
            className="inline-flex items-center gap-1.5 px-4 py-2 border border-white/40 text-white rounded-full font-semibold hover:bg-white/10 transition text-sm"
          >
            <Swords className="w-4 h-4" />
            {t("play.myDuels")}
          </Link>
          <Link
            href="/play/leaderboard"
            className="inline-flex items-center gap-1.5 px-4 py-2 border border-white/40 text-white rounded-full font-semibold hover:bg-white/10 transition text-sm"
          >
            <Trophy className="w-4 h-4" />
            {t("play.leaderboard")}
          </Link>
        </div>
      </section>

      {/* Incoming duel invites */}
      {data && data.pendingDuels.length > 0 && (
        <section className="mb-8">
          <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-4">{t("play.incomingDuels")}</h2>
          <div className="flex flex-col gap-2">
            {data.pendingDuels.map((duel) => (
              <DuelCard
                key={duel.id}
                duel={duel}
                busy={busyDuelId === duel.id}
                onAccept={(id) => respondToDuel(id, "accept")}
                onDecline={(id) => respondToDuel(id, "decline")}
              />
            ))}
          </div>
        </section>
      )}

      {/* Today's Challenge */}
      <section className="mb-8">
        <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-zrp-red" />
          {t("play.todaysChallenge")}
        </h2>
        {data?.dailyChallenge ? (
          <div className="bg-gradient-to-br from-zrp-red/10 to-transparent rounded-2xl border border-zrp-red/30 p-5 flex flex-col sm:flex-row sm:items-center gap-4">
            <div className="flex-1">
              <p className="text-xs font-semibold uppercase tracking-wide text-zrp-red mb-1">
                {t(TYPE_LABEL_KEYS[data.dailyChallenge.type])}
              </p>
              <h3 className="text-lg font-bold text-gray-900 dark:text-white">{data.dailyChallenge.title}</h3>
              {data.dailyChallenge.description && (
                <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">{data.dailyChallenge.description}</p>
              )}
            </div>
            <Link
              href={`/play/challenge/${data.dailyChallenge.id}`}
              className="flex-shrink-0 px-5 py-2.5 rounded-full bg-zrp-red text-white font-semibold hover:bg-red-600 transition text-center"
            >
              {data.dailyChallenge.alreadyPlayed ? t("play.played") : t("play.playNow")}
            </Link>
          </div>
        ) : (
          <p className="text-center py-10 text-gray-500 dark:text-gray-400">{t("play.noDailyChallenge")}</p>
        )}
      </section>

      {/* Active duels */}
      {data && data.activeDuels.length > 0 && (
        <section className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold text-gray-900 dark:text-white">{t("play.activeDuels")}</h2>
            <Link href="/play/duels" className="text-sm font-semibold text-zrp-red hover:underline">
              {t("play.viewDuels")}
            </Link>
          </div>
          <div className="flex flex-col gap-2">
            {data.activeDuels.slice(0, 3).map((duel) => (
              <DuelCard key={duel.id} duel={duel} />
            ))}
          </div>
        </section>
      )}

      {/* Trending */}
      <section className="mb-8">
        <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-4">{t("play.trending")}</h2>
        {data && data.trending.length > 0 ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
            {data.trending.map((challenge) => (
              <ChallengeCard key={challenge.id} challenge={challenge} />
            ))}
          </div>
        ) : (
          <p className="text-center py-10 text-gray-500 dark:text-gray-400">{t("play.noTrendingYet")}</p>
        )}
      </section>

      {/* Leaderboard snippet */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-gray-900 dark:text-white">{t("play.leaderboard")}</h2>
          <Link href="/play/leaderboard" className="text-sm font-semibold text-zrp-red hover:underline">
            {t("play.viewLeaderboard")}
          </Link>
        </div>
        {data && data.topLeaderboard.length > 0 ? (
          <div className="flex flex-col gap-2">
            {data.topLeaderboard.map((entry) => (
              <Link
                key={entry.userId}
                href={`/play/profile/${entry.user.username}`}
                className="flex items-center gap-3 p-3 bg-white dark:bg-zrp-deepBlack rounded-xl border border-gray-200 dark:border-gray-700 hover:border-zrp-red transition"
              >
                <span className="w-6 text-center font-bold text-sm text-gray-500 dark:text-gray-400">{entry.rank}</span>
                <img
                  src={entry.user.avatarUrl || "/default-avatar.png"}
                  alt={entry.user.username}
                  className="w-8 h-8 rounded-full object-cover"
                />
                <span className="flex-1 text-sm font-semibold text-gray-900 dark:text-white truncate">
                  @{entry.user.username}
                </span>
                <span className="text-sm font-bold text-zrp-red">{t("play.xp", { n: entry.totalXp })}</span>
              </Link>
            ))}
          </div>
        ) : (
          <p className="text-center py-10 text-gray-500 dark:text-gray-400">{t("play.noLeaderboardData")}</p>
        )}
      </section>
    </div>
  );
}
