"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { ArrowLeft, Trophy } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import VerifiedBadge from "@/components/VerifiedBadge";
import { DUEL_STATUS_LABEL_KEYS, TYPE_LABEL_KEYS, type PlayDuelSummary } from "@/lib/play/types";

export default function PlayDuelDetailPage() {
  const { t } = useLanguage();
  const { data: session } = useSession();
  const params = useParams<{ id: string }>();
  const [duel, setDuel] = useState<PlayDuelSummary | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/play/duels/${params.id}`)
      .then((res) => res.json())
      .then((data) => setDuel(data.duel))
      .catch((err) => console.error("Error loading duel:", err))
      .finally(() => setLoading(false));
  }, [params.id]);

  if (loading) {
    return (
      <div className="flex justify-center py-24">
        <div className="w-8 h-8 border-4 border-zrp-red border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!duel) return null;

  const myId = session?.user?.id;
  const isChallenger = myId === duel.challengerId;
  const myScore = isChallenger ? duel.challengerScore : duel.opponentScore;
  const iHavePlayed = myScore !== null;
  const opponent = isChallenger ? duel.opponent : duel.challenger;
  const me = isChallenger ? duel.challenger : duel.opponent;

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      <Link href="/play/duels" className="inline-flex items-center gap-1.5 text-sm text-gray-500 dark:text-gray-400 hover:text-zrp-red transition mb-4">
        <ArrowLeft className="w-4 h-4" />
        {t("play.duelsTitle")}
      </Link>

      <div className="bg-white dark:bg-zrp-deepBlack rounded-2xl border border-gray-200 dark:border-gray-700 p-6">
        <p className="text-xs font-semibold uppercase tracking-wide text-zrp-red text-center">
          {t(TYPE_LABEL_KEYS[duel.challenge.type])}
        </p>
        <h1 className="text-xl font-bold text-gray-900 dark:text-white text-center mt-1 mb-6">{duel.challenge.title}</h1>

        <div className="flex items-center justify-center gap-6">
          <div className="flex flex-col items-center gap-2">
            <img src={me.avatarUrl || "/default-avatar.png"} alt={me.username} className="w-14 h-14 rounded-full object-cover" />
            <div className="flex items-center gap-1 text-sm font-semibold text-gray-900 dark:text-white">
              @{me.username}
              <VerifiedBadge badgeType={me.badgeType} />
            </div>
            {duel.status === "COMPLETED" && myScore !== null && (
              <p className="text-lg font-extrabold text-gray-900 dark:text-white">{myScore}</p>
            )}
          </div>
          <span className="text-sm font-bold text-gray-400">{t("play.vs")}</span>
          <div className="flex flex-col items-center gap-2">
            <img src={opponent.avatarUrl || "/default-avatar.png"} alt={opponent.username} className="w-14 h-14 rounded-full object-cover" />
            <div className="flex items-center gap-1 text-sm font-semibold text-gray-900 dark:text-white">
              @{opponent.username}
              <VerifiedBadge badgeType={opponent.badgeType} />
            </div>
            {duel.status === "COMPLETED" && (
              <p className="text-lg font-extrabold text-gray-900 dark:text-white">
                {isChallenger ? duel.opponentScore : duel.challengerScore}
              </p>
            )}
          </div>
        </div>

        <div className="text-center mt-6">
          {duel.status === "COMPLETED" ? (
            <>
              <Trophy className="w-10 h-10 text-zrp-red mx-auto mb-2" />
              <p className="font-semibold text-gray-900 dark:text-white">
                {!duel.winnerId ? t("play.tied") : duel.winnerId === myId ? t("play.youWon") : t("play.youLost")}
              </p>
            </>
          ) : duel.status === "ACCEPTED" && !iHavePlayed ? (
            <Link
              href={`/play/challenge/${duel.challenge.id}?duelId=${duel.id}`}
              className="inline-block px-6 py-3 rounded-full bg-zrp-red text-white font-semibold hover:bg-red-600 transition"
            >
              {t("play.play")}
            </Link>
          ) : duel.status === "ACCEPTED" && iHavePlayed ? (
            <p className="text-sm text-gray-500 dark:text-gray-400">{t("play.waitingForOpponent")}</p>
          ) : (
            <span className="inline-block px-4 py-1.5 rounded-full bg-gray-100 dark:bg-gray-800 text-sm font-semibold text-gray-600 dark:text-gray-300">
              {t(DUEL_STATUS_LABEL_KEYS[duel.status])}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
