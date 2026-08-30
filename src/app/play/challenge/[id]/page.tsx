"use client";

import { useEffect, useState } from "react";
import { useParams, useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { ArrowLeft, Share2, Swords, Trophy } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import TriviaPlayer from "@/components/play/TriviaPlayer";
import MemoryPlayer from "@/components/play/MemoryPlayer";
import LogicPlayer from "@/components/play/LogicPlayer";
import AchievementBadge from "@/components/play/AchievementBadge";
import OpponentSearch from "@/components/play/OpponentSearch";
import { TYPE_LABEL_KEYS, type PlayAchievement, type PlayChallengeDetail, type PlayUserSummary } from "@/lib/play/types";

interface SubmitResult {
  score: number;
  maxScore: number;
  xpEarned?: number;
  totalXp?: number;
  level?: number;
  streak?: number;
  unlockedAchievements?: PlayAchievement[];
  waitingForOpponent?: boolean;
  duelCompleted?: boolean;
  winnerId?: string | null;
}

export default function PlayChallengePage() {
  const { t } = useLanguage();
  const { data: session } = useSession();
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const duelId = searchParams.get("duelId");

  const [challenge, setChallenge] = useState<PlayChallengeDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<SubmitResult | null>(null);
  const [shared, setShared] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [showDuelPanel, setShowDuelPanel] = useState(false);
  const [opponent, setOpponent] = useState<PlayUserSummary | null>(null);
  const [sendingDuel, setSendingDuel] = useState(false);
  const [duelSent, setDuelSent] = useState(false);

  useEffect(() => {
    fetch(`/api/play/challenges/${params.id}`)
      .then((res) => {
        if (!res.ok) throw new Error("not found");
        return res.json();
      })
      .then((data) => setChallenge(data.challenge))
      .catch(() => setError(t("play.errLoadFailed")))
      .finally(() => setLoading(false));
  }, [params.id, t]);

  const handleSubmit = async (payload: Record<string, unknown>) => {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/play/challenges/${params.id}/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...payload, duelId: duelId || undefined }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to submit");
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("play.errSubmitFailed"));
    } finally {
      setSubmitting(false);
    }
  };

  const sendDuel = async () => {
    if (!opponent) return;
    setSendingDuel(true);
    setError(null);
    try {
      const res = await fetch("/api/play/duels", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ challengeId: params.id, opponentId: opponent.id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to send duel challenge");
      setDuelSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("play.errDuelCreateFailed"));
    } finally {
      setSendingDuel(false);
    }
  };

  const shareResult = async () => {
    if (!challenge || !result) return;
    setSharing(true);
    setError(null);
    try {
      const res = await fetch("/api/posts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: `I just scored ${result.score}/${result.maxScore} on "${challenge.title}" in ZRP PLAY! 🎮`,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to share");
      setShared(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("play.errShareFailed"));
    } finally {
      setSharing(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-24">
        <div className="w-8 h-8 border-4 border-zrp-red border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (error && !challenge) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-16 text-center text-gray-500 dark:text-gray-400">
        <p>{error}</p>
        <Link href="/play" className="inline-block mt-4 text-zrp-red font-semibold hover:underline">
          {t("play.backToPlay")}
        </Link>
      </div>
    );
  }

  if (!challenge) return null;

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      <Link href="/play" className="inline-flex items-center gap-1.5 text-sm text-gray-500 dark:text-gray-400 hover:text-zrp-red transition mb-4">
        <ArrowLeft className="w-4 h-4" />
        {t("play.backToPlay")}
      </Link>

      <div className="bg-white dark:bg-zrp-deepBlack rounded-2xl border border-gray-200 dark:border-gray-700 p-6">
        {!result ? (
          <>
            <div className="mb-5">
              <p className="text-xs font-semibold uppercase tracking-wide text-zrp-red">
                {t(TYPE_LABEL_KEYS[challenge.type])}
              </p>
              <h1 className="text-xl font-bold text-gray-900 dark:text-white mt-1">{challenge.title}</h1>
            </div>

            {!duelId && session?.user && (
              <div className="mb-5">
                {!showDuelPanel ? (
                  <button
                    type="button"
                    onClick={() => setShowDuelPanel(true)}
                    className="inline-flex items-center gap-1.5 text-sm font-semibold text-zrp-red hover:underline"
                  >
                    <Swords className="w-4 h-4" />
                    {t("play.challengeFriend")}
                  </button>
                ) : duelSent ? (
                  <p className="text-sm text-green-600 dark:text-green-400">{t("play.duelSent")}</p>
                ) : (
                  <div className="flex flex-col gap-3 p-4 rounded-xl border border-gray-200 dark:border-gray-700">
                    <p className="text-sm font-semibold text-gray-700 dark:text-gray-300">{t("play.selectOpponent")}</p>
                    <OpponentSearch value={opponent} onChange={setOpponent} excludeUserId={session.user.id} />
                    <button
                      type="button"
                      disabled={!opponent || sendingDuel}
                      onClick={sendDuel}
                      className="self-start px-4 py-2 rounded-full bg-zrp-red text-white font-semibold text-sm hover:bg-red-600 transition disabled:opacity-40"
                    >
                      {sendingDuel ? t("play.sendingChallenge") : t("play.sendChallenge")}
                    </button>
                  </div>
                )}
              </div>
            )}

            {error && <p className="text-sm text-red-500 mb-4">{error}</p>}
            {challenge.type === "TRIVIA" && (
              <TriviaPlayer
                content={challenge.content as any}
                onSubmit={(answers, timeMs) => handleSubmit({ answers, timeMs })}
                submitting={submitting}
              />
            )}
            {challenge.type === "MEMORY" && (
              <MemoryPlayer
                content={challenge.content as any}
                onSubmit={(memoryResult, timeMs) => handleSubmit({ ...memoryResult, timeMs })}
                submitting={submitting}
              />
            )}
            {challenge.type === "LOGIC" && (
              <LogicPlayer
                content={challenge.content as any}
                onSubmit={(answer, timeMs) => handleSubmit({ ...answer, timeMs })}
                submitting={submitting}
              />
            )}
          </>
        ) : result.waitingForOpponent ? (
          <div className="text-center py-8">
            <Swords className="w-10 h-10 text-zrp-red mx-auto mb-3" />
            <p className="text-lg font-bold text-gray-900 dark:text-white">
              {t("play.yourScore")}: {result.score}/{result.maxScore}
            </p>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">{t("play.waitingForOpponent")}</p>
            <Link href="/play/duels" className="inline-block mt-4 text-zrp-red font-semibold hover:underline">
              {t("play.viewDuels")}
            </Link>
          </div>
        ) : (
          <div className="text-center py-4">
            <Trophy className="w-12 h-12 text-zrp-red mx-auto mb-3" />
            <p className="text-2xl font-extrabold text-gray-900 dark:text-white">
              {result.score}/{result.maxScore}
            </p>

            {result.duelCompleted && (
              <p className="text-sm font-semibold mt-2">
                {!result.winnerId
                  ? t("play.duelResultTie")
                  : result.winnerId === session?.user?.id
                    ? t("play.duelResultWin")
                    : t("play.duelResultLoss")}
              </p>
            )}

            {typeof result.xpEarned === "number" && (
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">
                +{result.xpEarned} {t("play.xpEarned")}
                {typeof result.level === "number" && ` · ${t("play.level", { n: result.level })}`}
              </p>
            )}

            {result.unlockedAchievements && result.unlockedAchievements.length > 0 && (
              <div className="mt-6">
                <p className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">{t("play.newAchievement")}</p>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {result.unlockedAchievements.map((achievement) => (
                    <AchievementBadge key={achievement.key} achievement={achievement} />
                  ))}
                </div>
              </div>
            )}

            {error && <p className="text-sm text-red-500 mt-4">{error}</p>}

            <div className="flex flex-wrap justify-center gap-3 mt-6">
              <button
                type="button"
                onClick={shareResult}
                disabled={shared || sharing}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-zrp-red text-white font-semibold hover:bg-red-600 transition text-sm disabled:opacity-50"
              >
                <Share2 className="w-4 h-4" />
                {shared ? t("play.shareSuccess") : sharing ? t("play.sharing") : t("play.shareResult")}
              </button>
              <button
                type="button"
                onClick={() => router.push("/play")}
                className="px-4 py-2 rounded-full border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 font-semibold hover:bg-gray-50 dark:hover:bg-gray-800 transition text-sm"
              >
                {t("play.backToPlay")}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
