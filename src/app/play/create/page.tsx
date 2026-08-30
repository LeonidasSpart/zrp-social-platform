"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Plus, Sparkles, Trash2 } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import type { PlayChallengeType } from "@/lib/play/types";

interface TriviaQuestionDraft {
  q: string;
  options: string[];
  correctIndex: number;
}

const TYPES: PlayChallengeType[] = ["TRIVIA", "MEMORY", "LOGIC"];
const DIFFICULTIES = ["easy", "medium", "hard"] as const;

export default function CreateChallengePage() {
  const { t } = useLanguage();
  const router = useRouter();

  const [tab, setTab] = useState<"manual" | "ai">("manual");
  const [type, setType] = useState<PlayChallengeType>("TRIVIA");
  const [difficulty, setDifficulty] = useState<(typeof DIFFICULTIES)[number]>("medium");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");

  const [questions, setQuestions] = useState<TriviaQuestionDraft[]>([
    { q: "", options: ["", ""], correctIndex: 0 },
  ]);
  const [pairs, setPairs] = useState<string[]>(["", "", ""]);
  const [logicPrompt, setLogicPrompt] = useState("");
  const [logicAnswerType, setLogicAnswerType] = useState<"choice" | "text">("choice");
  const [logicOptions, setLogicOptions] = useState<string[]>(["", ""]);
  const [logicCorrectIndex, setLogicCorrectIndex] = useState(0);
  const [logicAnswer, setLogicAnswer] = useState("");

  const [aiTopic, setAiTopic] = useState("");
  const [generating, setGenerating] = useState(false);
  const [aiGenerated, setAiGenerated] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const buildContent = (): unknown => {
    if (type === "TRIVIA") return { questions };
    if (type === "MEMORY") return { pairs: pairs.filter((p) => p.trim()) };
    return logicAnswerType === "choice"
      ? { prompt: logicPrompt, options: logicOptions, correctIndex: logicCorrectIndex }
      : { prompt: logicPrompt, answer: logicAnswer };
  };

  const generate = async () => {
    if (!aiTopic.trim()) return;
    setGenerating(true);
    setError(null);
    try {
      const res = await fetch("/api/play/challenges/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic: aiTopic.trim(), type, difficulty }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to generate");

      setTitle(data.title);
      setDescription(data.description || "");
      if (type === "TRIVIA") setQuestions(data.content.questions);
      if (type === "MEMORY") setPairs(data.content.pairs);
      if (type === "LOGIC") {
        setLogicPrompt(data.content.prompt);
        if (Array.isArray(data.content.options)) {
          setLogicAnswerType("choice");
          setLogicOptions(data.content.options);
          setLogicCorrectIndex(data.content.correctIndex ?? 0);
        } else {
          setLogicAnswerType("text");
          setLogicAnswer(data.content.answer || "");
        }
      }
      setAiGenerated(true);
      setTab("manual");
    } catch (err) {
      setError(err instanceof Error ? err.message : t("play.errGenerateFailed"));
    } finally {
      setGenerating(false);
    }
  };

  const publish = async () => {
    if (!title.trim()) {
      setError(t("play.errTitleRequired"));
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/play/challenges", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, title: title.trim(), description, difficulty, content: buildContent() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to create");
      router.push(`/play/challenge/${data.challenge.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("play.errCreateFailed"));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      <Link href="/play" className="inline-flex items-center gap-1.5 text-sm text-gray-500 dark:text-gray-400 hover:text-zrp-red transition mb-4">
        <ArrowLeft className="w-4 h-4" />
        {t("play.backToPlay")}
      </Link>

      <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{t("play.createTitle")}</h1>
      <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{t("play.createSubtitle")}</p>

      <div className="flex gap-2 mt-6 mb-6">
        <button
          type="button"
          onClick={() => setTab("manual")}
          className={`flex-1 py-2.5 rounded-full font-semibold text-sm transition ${
            tab === "manual" ? "bg-zrp-red text-white" : "border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300"
          }`}
        >
          {t("play.manualTab")}
        </button>
        <button
          type="button"
          onClick={() => setTab("ai")}
          className={`flex-1 inline-flex items-center justify-center gap-1.5 py-2.5 rounded-full font-semibold text-sm transition ${
            tab === "ai" ? "bg-zrp-red text-white" : "border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300"
          }`}
        >
          <Sparkles className="w-4 h-4" />
          {t("play.aiTab")}
        </button>
      </div>

      {error && <p className="text-sm text-red-500 mb-4">{error}</p>}

      <div className="flex flex-col gap-4 mb-6">
        <div>
          <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">{t("play.challengeType")}</label>
          <div className="flex gap-2">
            {TYPES.map((tp) => (
              <button
                key={tp}
                type="button"
                onClick={() => setType(tp)}
                className={`flex-1 py-2 rounded-xl text-sm font-semibold border transition ${
                  type === tp
                    ? "border-zrp-red bg-zrp-red/10 text-zrp-red"
                    : "border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300"
                }`}
              >
                {t(tp === "TRIVIA" ? "play.typeTrivia" : tp === "MEMORY" ? "play.typeMemory" : "play.typeLogic")}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">{t("play.difficultyLabel")}</label>
          <div className="flex gap-2">
            {DIFFICULTIES.map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => setDifficulty(d)}
                className={`flex-1 py-2 rounded-xl text-sm font-semibold border transition capitalize ${
                  difficulty === d
                    ? "border-zrp-red bg-zrp-red/10 text-zrp-red"
                    : "border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300"
                }`}
              >
                {t(d === "easy" ? "play.difficultyEasy" : d === "medium" ? "play.difficultyMedium" : "play.difficultyHard")}
              </button>
            ))}
          </div>
        </div>
      </div>

      {tab === "ai" ? (
        <div className="flex flex-col gap-3 mb-6">
          <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300">{t("play.aiTopicLabel")}</label>
          <input
            value={aiTopic}
            onChange={(e) => setAiTopic(e.target.value)}
            placeholder={t("play.aiTopicPlaceholder")}
            className="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-zrp-red"
          />
          <button
            type="button"
            disabled={!aiTopic.trim() || generating}
            onClick={generate}
            className="inline-flex items-center justify-center gap-1.5 px-5 py-2.5 rounded-full bg-zrp-red text-white font-semibold hover:bg-red-600 transition disabled:opacity-40"
          >
            <Sparkles className="w-4 h-4" />
            {generating ? t("play.generating") : t("play.generate")}
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-4 mb-6">
          {aiGenerated && <p className="text-xs text-gray-500 dark:text-gray-400">{t("play.aiGeneratedNote")}</p>}

          <div>
            <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">{t("play.titleLabel")}</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={t("play.titlePlaceholder")}
              maxLength={120}
              className="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-zrp-red"
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">{t("play.descriptionLabel")}</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t("play.descriptionPlaceholder")}
              maxLength={500}
              rows={2}
              className="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-zrp-red resize-none"
            />
          </div>

          {type === "TRIVIA" && (
            <div>
              <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">{t("play.questionsLabel")}</label>
              <div className="flex flex-col gap-4">
                {questions.map((question, qIndex) => (
                  <div key={qIndex} className="p-3 rounded-xl border border-gray-200 dark:border-gray-700 flex flex-col gap-2">
                    <div className="flex items-center gap-2">
                      <input
                        value={question.q}
                        onChange={(e) => {
                          const next = [...questions];
                          next[qIndex] = { ...next[qIndex], q: e.target.value };
                          setQuestions(next);
                        }}
                        placeholder={t("play.questionPlaceholder")}
                        className="flex-1 px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-zrp-red"
                      />
                      {questions.length > 1 && (
                        <button type="button" onClick={() => setQuestions(questions.filter((_, i) => i !== qIndex))}>
                          <Trash2 className="w-4 h-4 text-gray-400 hover:text-red-500" />
                        </button>
                      )}
                    </div>
                    {question.options.map((option, optIndex) => (
                      <div key={optIndex} className="flex items-center gap-2 pl-4">
                        <input
                          type="radio"
                          checked={question.correctIndex === optIndex}
                          onChange={() => {
                            const next = [...questions];
                            next[qIndex] = { ...next[qIndex], correctIndex: optIndex };
                            setQuestions(next);
                          }}
                          aria-label={t("play.markCorrect")}
                        />
                        <input
                          value={option}
                          onChange={(e) => {
                            const next = [...questions];
                            const nextOptions = [...next[qIndex].options];
                            nextOptions[optIndex] = e.target.value;
                            next[qIndex] = { ...next[qIndex], options: nextOptions };
                            setQuestions(next);
                          }}
                          placeholder={t("play.optionPlaceholder", { n: optIndex + 1 })}
                          className="flex-1 px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-zrp-red"
                        />
                      </div>
                    ))}
                    {question.options.length < 6 && (
                      <button
                        type="button"
                        onClick={() => {
                          const next = [...questions];
                          next[qIndex] = { ...next[qIndex], options: [...next[qIndex].options, ""] };
                          setQuestions(next);
                        }}
                        className="self-start text-xs font-semibold text-zrp-red hover:underline pl-4"
                      >
                        + {t("play.addOption")}
                      </button>
                    )}
                  </div>
                ))}
                {questions.length < 20 && (
                  <button
                    type="button"
                    onClick={() => setQuestions([...questions, { q: "", options: ["", ""], correctIndex: 0 }])}
                    className="inline-flex items-center gap-1.5 self-start text-sm font-semibold text-zrp-red hover:underline"
                  >
                    <Plus className="w-4 h-4" />
                    {t("play.addQuestion")}
                  </button>
                )}
              </div>
            </div>
          )}

          {type === "MEMORY" && (
            <div>
              <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">{t("play.memoryPairsLabel")}</label>
              <div className="grid grid-cols-2 gap-2">
                {pairs.map((pair, pairIndex) => (
                  <input
                    key={pairIndex}
                    value={pair}
                    onChange={(e) => {
                      const next = [...pairs];
                      next[pairIndex] = e.target.value;
                      setPairs(next);
                    }}
                    placeholder={t("play.pairPlaceholder", { n: pairIndex + 1 })}
                    className="px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-zrp-red"
                  />
                ))}
              </div>
              {pairs.length < 12 && (
                <button
                  type="button"
                  onClick={() => setPairs([...pairs, ""])}
                  className="inline-flex items-center gap-1.5 mt-2 text-sm font-semibold text-zrp-red hover:underline"
                >
                  <Plus className="w-4 h-4" />
                  {t("play.addPair")}
                </button>
              )}
            </div>
          )}

          {type === "LOGIC" && (
            <div className="flex flex-col gap-3">
              <div>
                <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">{t("play.logicPromptLabel")}</label>
                <textarea
                  value={logicPrompt}
                  onChange={(e) => setLogicPrompt(e.target.value)}
                  placeholder={t("play.logicPromptPlaceholder")}
                  rows={2}
                  className="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-zrp-red resize-none"
                />
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setLogicAnswerType("choice")}
                  className={`flex-1 py-2 rounded-xl text-sm font-semibold border transition ${
                    logicAnswerType === "choice" ? "border-zrp-red bg-zrp-red/10 text-zrp-red" : "border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300"
                  }`}
                >
                  {t("play.logicAnswerTypeChoice")}
                </button>
                <button
                  type="button"
                  onClick={() => setLogicAnswerType("text")}
                  className={`flex-1 py-2 rounded-xl text-sm font-semibold border transition ${
                    logicAnswerType === "text" ? "border-zrp-red bg-zrp-red/10 text-zrp-red" : "border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300"
                  }`}
                >
                  {t("play.logicAnswerTypeText")}
                </button>
              </div>
              {logicAnswerType === "choice" ? (
                <div className="flex flex-col gap-2">
                  {logicOptions.map((option, optIndex) => (
                    <div key={optIndex} className="flex items-center gap-2">
                      <input
                        type="radio"
                        checked={logicCorrectIndex === optIndex}
                        onChange={() => setLogicCorrectIndex(optIndex)}
                        aria-label={t("play.markCorrect")}
                      />
                      <input
                        value={option}
                        onChange={(e) => {
                          const next = [...logicOptions];
                          next[optIndex] = e.target.value;
                          setLogicOptions(next);
                        }}
                        placeholder={t("play.optionPlaceholder", { n: optIndex + 1 })}
                        className="flex-1 px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-zrp-red"
                      />
                    </div>
                  ))}
                  {logicOptions.length < 6 && (
                    <button
                      type="button"
                      onClick={() => setLogicOptions([...logicOptions, ""])}
                      className="self-start text-xs font-semibold text-zrp-red hover:underline"
                    >
                      + {t("play.addOption")}
                    </button>
                  )}
                </div>
              ) : (
                <div>
                  <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">{t("play.logicFreeTextAnswer")}</label>
                  <input
                    value={logicAnswer}
                    onChange={(e) => setLogicAnswer(e.target.value)}
                    className="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-zrp-red"
                  />
                </div>
              )}
            </div>
          )}

          <button
            type="button"
            disabled={submitting}
            onClick={publish}
            className="mt-2 px-5 py-3 rounded-full bg-zrp-red text-white font-semibold hover:bg-red-600 transition disabled:opacity-50"
          >
            {submitting ? t("play.publishing") : t("play.publish")}
          </button>
        </div>
      )}
    </div>
  );
}
