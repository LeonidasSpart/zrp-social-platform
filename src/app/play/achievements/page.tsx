"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { ArrowLeft } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import AchievementBadge from "@/components/play/AchievementBadge";
import { PLAY_ACHIEVEMENT_CATALOG } from "@/lib/play/types";

export default function PlayAchievementsPage() {
  const { t } = useLanguage();
  const { data: session, status } = useSession();
  const [unlockedKeys, setUnlockedKeys] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (status !== "authenticated" || !session?.user?.username) {
      setLoading(false);
      return;
    }
    fetch(`/api/play/profile/${session.user.username}`)
      .then((res) => res.json())
      .then((data) => setUnlockedKeys(new Set((data.achievements || []).map((a: { key: string }) => a.key))))
      .catch((err) => console.error("Error loading achievements:", err))
      .finally(() => setLoading(false));
  }, [status, session?.user?.username]);

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      <Link href="/play" className="inline-flex items-center gap-1.5 text-sm text-gray-500 dark:text-gray-400 hover:text-zrp-red transition mb-4">
        <ArrowLeft className="w-4 h-4" />
        {t("play.backToPlay")}
      </Link>

      <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{t("play.achievementsTitle")}</h1>
      <p className="text-sm text-gray-500 dark:text-gray-400 mt-1 mb-6">{t("play.achievementsSubtitle")}</p>

      {loading ? (
        <div className="flex justify-center py-16">
          <div className="w-8 h-8 border-4 border-zrp-red border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {PLAY_ACHIEVEMENT_CATALOG.map((achievement) => (
            <AchievementBadge key={achievement.key} achievement={achievement} locked={!unlockedKeys.has(achievement.key)} />
          ))}
        </div>
      )}
    </div>
  );
}
