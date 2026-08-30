"use client";

import { useRef, useState } from "react";
import { Check } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import type { LogicContent } from "@/lib/play/types";

interface LogicPlayerProps {
  content: LogicContent;
  onSubmit: (answer: { answerIndex?: number; answerText?: string }, timeMs: number) => void;
  submitting: boolean;
}

export default function LogicPlayer({ content, onSubmit, submitting }: LogicPlayerProps) {
  const { t } = useLanguage();
  const [selected, setSelected] = useState<number | null>(null);
  const [text, setText] = useState("");
  const startedAt = useRef(Date.now());
  const isMultipleChoice = Array.isArray(content.options) && content.options.length > 0;

  const canSubmit = isMultipleChoice ? selected !== null : text.trim().length > 0;

  const finish = () => {
    const timeMs = Date.now() - startedAt.current;
    if (isMultipleChoice) {
      onSubmit({ answerIndex: selected ?? undefined }, timeMs);
    } else {
      onSubmit({ answerText: text.trim() }, timeMs);
    }
  };

  return (
    <div className="flex flex-col gap-5">
      <p className="text-sm font-semibold text-gray-500 dark:text-gray-400">{t("play.logicInstructions")}</p>
      <h2 className="text-xl font-bold text-gray-900 dark:text-white whitespace-pre-line">{content.prompt}</h2>

      {isMultipleChoice ? (
        <div className="flex flex-col gap-2">
          {content.options!.map((option, optIndex) => {
            const isSelected = selected === optIndex;
            return (
              <button
                key={optIndex}
                type="button"
                onClick={() => setSelected(optIndex)}
                className={`flex items-center justify-between px-4 py-3 rounded-xl border text-left transition ${
                  isSelected
                    ? "border-zrp-red bg-zrp-red/10 text-zrp-red font-semibold"
                    : "border-gray-200 dark:border-gray-700 text-gray-800 dark:text-gray-200 hover:border-zrp-red/50"
                }`}
              >
                {option}
                {isSelected && <Check className="w-4 h-4 flex-shrink-0" />}
              </button>
            );
          })}
        </div>
      ) : (
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={t("play.yourAnswer")}
          className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-zrp-red"
        />
      )}

      <div className="flex justify-end">
        <button
          type="button"
          disabled={!canSubmit || submitting}
          onClick={finish}
          className="px-5 py-2.5 rounded-full bg-zrp-red text-white font-semibold hover:bg-red-600 transition disabled:opacity-40"
        >
          {submitting ? t("play.submitting") : t("play.finish")}
        </button>
      </div>
    </div>
  );
}
