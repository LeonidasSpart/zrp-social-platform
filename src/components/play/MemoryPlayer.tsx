"use client";

import { useEffect, useRef, useState } from "react";
import { useLanguage } from "@/contexts/LanguageContext";
import type { MemoryContent } from "@/lib/play/types";

interface MemoryPlayerProps {
  content: MemoryContent;
  onSubmit: (result: { moves: number; matchedPairs: number }, timeMs: number) => void;
  submitting: boolean;
}

interface Card {
  id: number;
  value: string;
  pairKey: number;
}

function buildDeck(pairs: string[]): Card[] {
  const deck: Card[] = pairs.flatMap((value, pairKey) => [
    { id: pairKey * 2, value, pairKey },
    { id: pairKey * 2 + 1, value, pairKey },
  ]);
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

export default function MemoryPlayer({ content, onSubmit, submitting }: MemoryPlayerProps) {
  const { t } = useLanguage();
  const [deck] = useState(() => buildDeck(content.pairs));
  const [flipped, setFlipped] = useState<number[]>([]);
  const [matched, setMatched] = useState<Set<number>>(new Set());
  const [moves, setMoves] = useState(0);
  const startedAt = useRef(Date.now());
  const submittedRef = useRef(false);
  const totalPairs = content.pairs.length;

  useEffect(() => {
    if (flipped.length !== 2) return;
    const [a, b] = flipped;
    const cardA = deck[a];
    const cardB = deck[b];
    setMoves((m) => m + 1);
    const timeout = setTimeout(() => {
      if (cardA.pairKey === cardB.pairKey) {
        setMatched((prev) => new Set(prev).add(cardA.pairKey));
      }
      setFlipped([]);
    }, 700);
    return () => clearTimeout(timeout);
  }, [flipped, deck]);

  useEffect(() => {
    if (matched.size === totalPairs && !submittedRef.current) {
      submittedRef.current = true;
      onSubmit({ moves, matchedPairs: matched.size }, Date.now() - startedAt.current);
    }
  }, [matched, totalPairs, moves, onSubmit]);

  const handleFlip = (cardIndex: number) => {
    if (submitting || flipped.length === 2) return;
    if (flipped.includes(cardIndex)) return;
    if (matched.has(deck[cardIndex].pairKey)) return;
    setFlipped((prev) => [...prev, cardIndex]);
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between text-sm font-semibold text-gray-600 dark:text-gray-300">
        <span>{t("play.moves", { n: moves })}</span>
        <span>{t("play.matched", { matched: matched.size, total: totalPairs })}</span>
      </div>
      <div className="grid grid-cols-4 gap-2 sm:gap-3">
        {deck.map((card, cardIndex) => {
          const isFlipped = flipped.includes(cardIndex) || matched.has(card.pairKey);
          return (
            <button
              key={card.id}
              type="button"
              onClick={() => handleFlip(cardIndex)}
              className={`aspect-square rounded-xl flex items-center justify-center text-lg sm:text-2xl font-bold border transition ${
                isFlipped
                  ? matched.has(card.pairKey)
                    ? "bg-green-500/10 border-green-500 text-green-600 dark:text-green-400"
                    : "bg-zrp-red/10 border-zrp-red text-zrp-red"
                  : "bg-gray-100 dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-transparent"
              }`}
            >
              {isFlipped ? card.value : "?"}
            </button>
          );
        })}
      </div>
      {submitting && <p className="text-center text-sm text-gray-500">{t("play.submitting")}</p>}
    </div>
  );
}
