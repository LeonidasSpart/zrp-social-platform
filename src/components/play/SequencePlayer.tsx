"use client";

import { useEffect, useRef, useState } from "react";
import { useLanguage } from "@/contexts/LanguageContext";
import type { SequenceContent } from "@/lib/play/types";

interface SequencePlayerProps {
  content: SequenceContent;
  onSubmit: (result: { reproduced: string[] }, timeMs: number) => void;
  submitting: boolean;
}

const WATCH_STEP_MS = 700;

export default function SequencePlayer({ content, onSubmit, submitting }: SequencePlayerProps) {
  const { t } = useLanguage();
  const total = content.sequence.length;
  const palette = Array.from(new Set(content.sequence));

  const [phase, setPhase] = useState<"watch" | "input">("watch");
  const [highlightIndex, setHighlightIndex] = useState(-1);
  const [reproduced, setReproduced] = useState<string[]>([]);
  const startedAt = useRef(Date.now());
  const submittedRef = useRef(false);

  useEffect(() => {
    let step = 0;
    const interval = setInterval(() => {
      setHighlightIndex(step);
      step += 1;
      if (step > total) {
        clearInterval(interval);
        setHighlightIndex(-1);
        setPhase("input");
      }
    }, WATCH_STEP_MS);
    return () => clearInterval(interval);
  }, [total]);

  useEffect(() => {
    if (phase === "input" && reproduced.length === total && !submittedRef.current) {
      submittedRef.current = true;
      onSubmit({ reproduced }, Date.now() - startedAt.current);
    }
  }, [phase, reproduced, total, onSubmit]);

  const correctSoFar = reproduced.reduce((count, item, i) => (item === content.sequence[i] ? count + 1 : count), 0);

  const handlePick = (item: string) => {
    if (submitting || reproduced.length >= total) return;
    setReproduced((prev) => [...prev, item]);
  };

  return (
    <div className="flex flex-col gap-5">
      <p className="text-sm font-semibold text-gray-500 dark:text-gray-400">{t("play.sequenceInstructions")}</p>

      <div className="grid grid-cols-4 gap-2 sm:gap-3" aria-live="polite">
        {content.sequence.map((item, i) => {
          const isRevealed = phase === "watch" ? i === highlightIndex : i < reproduced.length;
          const shown = phase === "watch" ? (i === highlightIndex ? item : "") : reproduced[i] ?? "";
          return (
            <div
              key={i}
              className={`aspect-square rounded-xl flex items-center justify-center text-lg sm:text-2xl font-bold border transition ${
                isRevealed
                  ? "bg-zrp-red/10 border-zrp-red text-zrp-red"
                  : "bg-gray-100 dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-transparent"
              }`}
            >
              {shown || "?"}
            </div>
          );
        })}
      </div>

      {phase === "watch" ? (
        <p className="text-center text-sm text-gray-500 dark:text-gray-400">{t("play.sequenceWatch")}</p>
      ) : (
        <>
          <p className="text-center text-sm font-semibold text-gray-700 dark:text-gray-300">
            {t("play.sequenceYourTurn")}
          </p>
          <div className="flex flex-wrap justify-center gap-2">
            {palette.map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => handlePick(item)}
                disabled={submitting || reproduced.length >= total}
                className="min-w-[3rem] px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 text-lg font-bold text-gray-800 dark:text-gray-200 hover:border-zrp-red hover:text-zrp-red transition disabled:opacity-40"
              >
                {item}
              </button>
            ))}
          </div>
          <p className="text-center text-xs text-gray-500 dark:text-gray-400">
            {t("play.sequenceCorrectSoFar", { n: correctSoFar })}
          </p>
        </>
      )}

      {submitting && <p className="text-center text-sm text-gray-500">{t("play.submitting")}</p>}
    </div>
  );
}
