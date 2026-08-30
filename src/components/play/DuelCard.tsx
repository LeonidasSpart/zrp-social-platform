"use client";

import Link from "next/link";
import { useSession } from "next-auth/react";
import { useLanguage } from "@/contexts/LanguageContext";
import VerifiedBadge from "@/components/VerifiedBadge";
import { TYPE_LABEL_KEYS, DUEL_STATUS_LABEL_KEYS, type PlayDuelSummary } from "@/lib/play/types";

interface DuelCardProps {
  duel: PlayDuelSummary;
  onAccept?: (duelId: string) => void;
  onDecline?: (duelId: string) => void;
  busy?: boolean;
}

const STATUS_STYLES: Record<string, string> = {
  PENDING: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  ACCEPTED: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
  DECLINED: "bg-gray-500/10 text-gray-500",
  COMPLETED: "bg-green-500/10 text-green-600 dark:text-green-400",
  EXPIRED: "bg-gray-500/10 text-gray-500",
};

export default function DuelCard({ duel, onAccept, onDecline, busy }: DuelCardProps) {
  const { t } = useLanguage();
  const { data: session } = useSession();
  const myId = session?.user?.id;
  const isChallenger = myId === duel.challengerId;
  const opponent = isChallenger ? duel.opponent : duel.challenger;

  const iWon = duel.status === "COMPLETED" && duel.winnerId === myId;
  const iLost = duel.status === "COMPLETED" && duel.winnerId && duel.winnerId !== myId;
  const isTie = duel.status === "COMPLETED" && !duel.winnerId;

  const canRespond = duel.status === "PENDING" && myId === duel.opponentId;
  const canPlay = duel.status === "ACCEPTED";

  return (
    <div className="flex items-center gap-3 p-3 bg-white dark:bg-zrp-deepBlack rounded-xl border border-gray-200 dark:border-gray-700">
      <img
        src={opponent.avatarUrl || "/default-avatar.png"}
        alt={opponent.username}
        className="w-10 h-10 rounded-full object-cover flex-shrink-0"
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1 text-sm font-semibold text-gray-900 dark:text-white truncate">
          @{opponent.username}
          <VerifiedBadge badgeType={opponent.badgeType} />
        </div>
        <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
          {t(TYPE_LABEL_KEYS[duel.challenge.type])} - {duel.challenge.title}
        </p>
        {duel.status === "COMPLETED" && (
          <p className="text-xs font-semibold mt-0.5">
            {iWon && <span className="text-green-600 dark:text-green-400">{t("play.youWon")}</span>}
            {iLost && <span className="text-gray-500">{t("play.youLost")}</span>}
            {isTie && <span className="text-gray-500">{t("play.tied")}</span>}
          </p>
        )}
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">
        {canRespond ? (
          <>
            <button
              disabled={busy}
              onClick={() => onDecline?.(duel.id)}
              className="px-3 py-1.5 text-xs font-semibold rounded-full border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition disabled:opacity-50"
            >
              {t("play.decline")}
            </button>
            <button
              disabled={busy}
              onClick={() => onAccept?.(duel.id)}
              className="px-3 py-1.5 text-xs font-semibold rounded-full bg-zrp-red text-white hover:bg-red-600 transition disabled:opacity-50"
            >
              {t("play.accept")}
            </button>
          </>
        ) : canPlay ? (
          <Link
            href={`/play/duel/${duel.id}`}
            className="px-3 py-1.5 text-xs font-semibold rounded-full bg-zrp-red text-white hover:bg-red-600 transition"
          >
            {t("play.play")}
          </Link>
        ) : (
          <span className={`px-2.5 py-1 rounded-full text-[11px] font-semibold ${STATUS_STYLES[duel.status]}`}>
            {t(DUEL_STATUS_LABEL_KEYS[duel.status])}
          </span>
        )}
      </div>
    </div>
  );
}
