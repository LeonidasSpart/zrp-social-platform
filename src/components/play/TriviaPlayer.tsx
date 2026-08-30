"use client";

import { useRef, useState } from "react";
import { Check } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import type { TriviaContent } from "@/lib/play/types";

interface TriviaPlayerProps {
  content: TriviaContent;
  onSubmit: (answers: number[], timeMs: number) => void;
  submitting: boolean;
}

export default function TriviaPlayer({ content, onSubmit, submitting }: TriviaPlayerProps) {
  const { t } = useLanguage();
  const total = content.questions.length;
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<number[]>(() => new Array(total).fill(-1));
  const startedAt = useRef(Date.now());

  const question = content.questions[index];
  const isLast = index === total - 1;
  const canAdvance = answers[index] !== -1;

  const finish = () => {
    onSubmit(answers, Date.now() - startedAt.current);
  };

  return (
    <div className="flex flex-col gap-5">
      <p className="text-sm font-semibold text-gray-500 dark:text-gray-400">
        {t("play.question", { n: index + 1, total })}
      </p>
      <h2 className="text-xl font-bold text-gray-900 dark:text-white">{question.q}</h2>
      <div className="flex flex-col gap-2">
        {question.options.map((option, optIndex) => {
          const selected = answers[index] === optIndex;
          return (
            <button
              key={optIndex}
              type="button"
              onClick={() => {
                const next = [...answers];
                next[index] = optIndex;
                setAnswers(next);
              }}
              className={`flex items-center justify-between px-4 py-3 rounded-xl border text-left transition ${
                selected
                  ? "border-zrp-red bg-zrp-red/10 text-zrp-red font-semibold"
                  : "border-gray-200 dark:border-gray-700 text-gray-800 dark:text-gray-200 hover:border-zrp-red/50"
              }`}
            >
              {option}
              {selected && <Check className="w-4 h-4 flex-shrink-0" />}
            </button>
          );
        })}
      </div>
      <div className="flex justify-end gap-2">
        {!isLast ? (
          <button
            type="button"
            disabled={!canAdvance}
            onClick={() => setIndex((i) => Math.min(total - 1, i + 1))}
            className="px-5 py-2.5 rounded-full bg-zrp-red text-white font-semibold hover:bg-red-600 transition disabled:opacity-40"
          >
            {t("play.next")}
          </button>
        ) : (
          <button
            type="button"
            disabled={!canAdvance || submitting}
            onClick={finish}
            className="px-5 py-2.5 rounded-full bg-zrp-red text-white font-semibold hover:bg-red-600 transition disabled:opacity-40"
          >
            {submitting ? t("play.submitting") : t("play.finish")}
          </button>
        )}
      </div>
    </div>
  );
}
