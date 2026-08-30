"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import VerifiedBadge from "@/components/VerifiedBadge";
import PlayXpBar from "@/components/play/PlayXpBar";
import AchievementBadge from "@/components/play/AchievementBadge";
import { TYPE_LABEL_KEYS, type PlayAchievement, type PlayProfileStats, type PlayUserSummary } from "@/lib/play/types";

interface ProfileData {
  user: PlayUserSummary;
  profile: PlayProfileStats;
  achievements: PlayAchievement[];
  recentAttempts: {
    id: string;
    score: number;
    xpEarned: number;
    createdAt: string;
    challenge: { id: string; type: "TRIVIA" | "MEMORY" | "LOGIC"; title: string; difficulty: string };
  }[];
}

export default function PlayProfilePage() {
  const { t } = useLanguage();
  const params = useParams<{ username: string }>();
  const [data, setData] = useState<ProfileData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/play/profile/${params.username}`)
      .then((res) => res.json())
      .then(setData)
      .catch((err) => console.error("Error loading PLAY profile:", err))
      .finally(() => setLoading(false));
  }, [params.username]);

  if (loading) {
    return (
      <div className="flex justify-center py-24">
        <div className="w-8 h-8 border-4 border-zrp-red border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!data) return null;

  const stats = [
    { label: t("play.challengesCompleted"), value: data.profile.challengesCompleted },
    { label: t("play.duelsWon"), value: data.profile.duelsWon },
    { label: t("play.duelsPlayed"), value: data.profile.duelsPlayed },
    { label: t("play.longestStreak"), value: data.profile.longestStreak },
  ];

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      <Link href="/play" className="inline-flex items-center gap-1.5 text-sm text-gray-500 dark:text-gray-400 hover:text-zrp-red transition mb-4">
        <ArrowLeft className="w-4 h-4" />
        {t("play.backToPlay")}
      </Link>

      <div className="bg-white dark:bg-zrp-deepBlack rounded-2xl border border-gray-200 dark:border-gray-700 p-6 text-center">
        <img
          src={data.user.avatarUrl || "/default-avatar.png"}
          alt={data.user.username}
          className="w-16 h-16 rounded-full object-cover mx-auto"
        />
        <div className="flex items-center justify-center gap-1 mt-2">
          <h1 className="text-lg font-bold text-gray-900 dark:text-white">@{data.user.username}</h1>
          <VerifiedBadge badgeType={data.user.badgeType} />
        </div>
        <div className="mt-4 flex justify-center">
          <PlayXpBar
            level={data.profile.level}
            progressRatio={data.profile.progressRatio ?? 0}
            xpIntoLevel={data.profile.xpIntoLevel ?? 0}
            xpForLevel={data.profile.xpForLevel ?? 100}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4">
        {stats.map((stat) => (
          <div key={stat.label} className="bg-white dark:bg-zrp-deepBlack rounded-xl border border-gray-200 dark:border-gray-700 p-3 text-center">
            <p className="text-xl font-extrabold text-gray-900 dark:text-white">{stat.value}</p>
            <p className="text-xs text-gray-500 dark:text-gray-400">{stat.label}</p>
          </div>
        ))}
      </div>

      {data.achievements.length > 0 && (
        <section className="mt-8">
          <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-4">{t("play.achievements")}</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {data.achievements.map((achievement) => (
              <AchievementBadge key={achievement.key} achievement={achievement} />
            ))}
          </div>
        </section>
      )}

      <section className="mt-8">
        <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-4">{t("play.recentActivity")}</h2>
        {data.recentAttempts.length === 0 ? (
          <p className="text-center py-8 text-gray-500 dark:text-gray-400">{t("play.noActivityYet")}</p>
        ) : (
          <div className="flex flex-col gap-2">
            {data.recentAttempts.map((attempt) => (
              <Link
                key={attempt.id}
                href={`/play/challenge/${attempt.challenge.id}`}
                className="flex items-center justify-between p-3 bg-white dark:bg-zrp-deepBlack rounded-xl border border-gray-200 dark:border-gray-700 hover:border-zrp-red transition"
              >
                <div className="min-w-0">
                  <p className="text-xs font-semibold uppercase tracking-wide text-zrp-red">
                    {t(TYPE_LABEL_KEYS[attempt.challenge.type])}
                  </p>
                  <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">{attempt.challenge.title}</p>
                </div>
                <span className="text-sm font-bold text-gray-700 dark:text-gray-300 flex-shrink-0">{attempt.score}</span>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
