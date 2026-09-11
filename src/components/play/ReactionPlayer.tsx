"use client";

import { useEffect, useRef, useState } from "react";
import { Zap } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import type { ReactionContent } from "@/lib/play/types";

interface ReactionPlayerProps {
  content: ReactionContent;
  onSubmit: (result: { reactionTimesMs: number[] }, timeMs: number) => void;
  submitting: boolean;
}

type RoundPhase = "ready" | "waiting" | "go" | "tooSoon";

// Random delay before the stimulus fires each round, so a player can't
// just time a fixed interval instead of actually reacting.
function randomDelayMs() {
  return 1000 + Math.random() * 2500;
}

export default function ReactionPlayer({ content, onSubmit, submitting }: ReactionPlayerProps) {
  const { t } = useLanguage();
  const total = content.rounds;
  const [round, setRound] = useState(0);
  const [phase, setPhase] = useState<RoundPhase>("ready");
  const [times, setTimes] = useState<number[]>([]);
  const stimulusAtRef = useRef<number | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startedAt = useRef(Date.now());
  const submittedRef = useRef(false);

  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  useEffect(() => {
    if (round >= total && !submittedRef.current) {
      submittedRef.current = true;
      onSubmit({ reactionTimesMs: times }, Date.now() - startedAt.current);
    }
  }, [round, total, times, onSubmit]);

  const startRound = () => {
    setPhase("waiting");
    timeoutRef.current = setTimeout(() => {
      stimulusAtRef.current = performance.now();
      setPhase("go");
    }, randomDelayMs());
  };

  const handleTap = () => {
    if (phase === "ready") {
      startRound();
      return;
    }
    if (phase === "waiting") {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      setPhase("tooSoon");
      setTimes((prev) => [...prev, -1]);
      setTimeout(() => {
        setPhase("ready");
        setRound((r) => r + 1);
      }, 900);
      return;
    }
    if (phase === "go" && stimulusAtRef.current !== null) {
      const elapsed = Math.round(performance.now() - stimulusAtRef.current);
      setTimes((prev) => [...prev, elapsed]);
      stimulusAtRef.current = null;
      setPhase("ready");
      setRound((r) => r + 1);
    }
  };

  if (round >= total) {
    return <p className="text-center text-sm text-gray-500 dark:text-gray-400">{t("play.submitting")}</p>;
  }

  const boxStyle =
    phase === "go"
      ? "bg-green-500 border-green-500 text-white"
      : phase === "tooSoon"
        ? "bg-red-500/10 border-red-500 text-red-500"
        : "bg-gray-100 dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400";

  return (
    <div className="flex flex-col gap-4 items-center">
      <div className="w-full flex items-center justify-between text-sm font-semibold text-gray-600 dark:text-gray-300">
        <span className="inline-flex items-center gap-1.5">
          <Zap className="w-4 h-4 text-zrp-red" />
          {t("play.reactionRound", { current: round + 1, total })}
        </span>
      </div>

      <button
        type="button"
        onClick={handleTap}
        disabled={submitting}
        aria-live="assertive"
        className={`w-full aspect-[2/1] rounded-2xl border-2 flex items-center justify-center text-lg sm:text-2xl font-extrabold transition-colors duration-150 ${boxStyle}`}
      >
        {phase === "ready" && t("play.play")}
        {phase === "waiting" && t("play.reactionWait")}
        {phase === "go" && t("play.reactionTapNow")}
        {phase === "tooSoon" && t("play.reactionTooSoon")}
      </button>

      <p className="text-xs text-gray-500 dark:text-gray-400 text-center">{t("play.reactionInstructions")}</p>
    </div>
  );
}
