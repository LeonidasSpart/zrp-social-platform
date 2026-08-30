"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Swords } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import DuelCard from "@/components/play/DuelCard";
import type { PlayDuelSummary } from "@/lib/play/types";

export default function PlayDuelsPage() {
  const { t } = useLanguage();
  const [duels, setDuels] = useState<PlayDuelSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyDuelId, setBusyDuelId] = useState<string | null>(null);

  const load = () => {
    fetch("/api/play/duels")
      .then((res) => res.json())
      .then((data) => setDuels(data.duels || []))
      .catch((err) => console.error("Error loading PLAY duels:", err))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, []);

  const respond = async (duelId: string, action: "accept" | "decline") => {
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

  const incoming = duels.filter((d) => d.status === "PENDING");
  const active = duels.filter((d) => d.status === "ACCEPTED");
  const history = duels.filter((d) => ["COMPLETED", "DECLINED", "EXPIRED"].includes(d.status));

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      <Link href="/play" className="inline-flex items-center gap-1.5 text-sm text-gray-500 dark:text-gray-400 hover:text-zrp-red transition mb-4">
        <ArrowLeft className="w-4 h-4" />
        {t("play.backToPlay")}
      </Link>

      <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{t("play.duelsTitle")}</h1>
      <p className="text-sm text-gray-500 dark:text-gray-400 mt-1 mb-6">{t("play.duelsSubtitle")}</p>

      {loading ? (
        <div className="flex justify-center py-16">
          <div className="w-8 h-8 border-4 border-zrp-red border-t-transparent rounded-full animate-spin" />
        </div>
      ) : duels.length === 0 ? (
        <div className="text-center py-16 text-gray-500 dark:text-gray-400">
          <Swords className="w-10 h-10 mx-auto mb-3 opacity-40" />
          <p>{t("play.noDuelsYet")}</p>
        </div>
      ) : (
        <div className="flex flex-col gap-8">
          {incoming.length > 0 && (
            <section>
              <h2 className="text-sm font-bold uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-3">
                {t("play.incomingDuels")}
              </h2>
              <div className="flex flex-col gap-2">
                {incoming.map((duel) => (
                  <DuelCard
                    key={duel.id}
                    duel={duel}
                    busy={busyDuelId === duel.id}
                    onAccept={(id) => respond(id, "accept")}
                    onDecline={(id) => respond(id, "decline")}
                  />
                ))}
              </div>
            </section>
          )}

          {active.length > 0 && (
            <section>
              <h2 className="text-sm font-bold uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-3">
                {t("play.activeDuels")}
              </h2>
              <div className="flex flex-col gap-2">
                {active.map((duel) => (
                  <DuelCard key={duel.id} duel={duel} />
                ))}
              </div>
            </section>
          )}

          {history.length > 0 && (
            <section>
              <h2 className="text-sm font-bold uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-3">
                {t("play.duelHistory")}
              </h2>
              <div className="flex flex-col gap-2">
                {history.map((duel) => (
                  <DuelCard key={duel.id} duel={duel} />
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  );
}
