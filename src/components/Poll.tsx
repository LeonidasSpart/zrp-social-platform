"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";

interface PollProps {
  pollId: string;
  question: string;
  options: string[];
  votes: Record<string, number>;
  userVote?: number;
  expiresAt?: string;
  onVote: () => void;
}

export default function Poll({ pollId, question, options, votes, userVote, expiresAt, onVote }: PollProps) {
  const { data: session } = useSession();
  const [selected, setSelected] = useState<number | null>(userVote ?? null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const totalVotes = Object.values(votes).reduce((a, b) => a + b, 0);

  const handleVote = async (index: number) => {
    if (!session) return;
    if (selected !== null) return; // Already voted

    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/polls/${pollId}/vote`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ optionIndex: index }),
      });

      if (res.ok) {
        setSelected(index);
        onVote();
      } else {
        const data = await res.json();
        setError(data.error || "Failed to vote");
      }
    } catch (error) {
      setError("Failed to vote. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const getPercentage = (count: number) => {
    if (totalVotes === 0) return 0;
    return Math.round((count / totalVotes) * 100);
  };

  const isExpired = expiresAt ? new Date(expiresAt) < new Date() : false;

  return (
    <div className="mt-3 p-3 bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
      <p className="font-semibold text-gray-900 dark:text-white">{question}</p>

      <div className="space-y-2 mt-2">
        {options.map((option, index) => {
          const count = votes[index] || 0;
          const percentage = getPercentage(count);
          const isSelected = selected === index;
          const canVote = !isExpired && selected === null && session;

          return (
            <button
              key={index}
              onClick={() => handleVote(index)}
              disabled={!canVote || submitting}
              className={`w-full text-left relative p-2 rounded-lg transition ${
                isSelected
                  ? "bg-blue-100 dark:bg-blue-900/30 border-2 border-blue-500"
                  : canVote
                  ? "bg-white dark:bg-gray-700 hover:bg-gray-100 dark:hover:bg-gray-600 border border-gray-300 dark:border-gray-600"
                  : "bg-gray-100 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 cursor-default"
              }`}
            >
              <div
                className="absolute left-0 top-0 h-full bg-blue-100 dark:bg-blue-900/30 rounded-lg transition-all duration-300"
                style={{ width: `${percentage}%` }}
              />
              <div className="relative flex items-center justify-between">
                <span className="text-sm text-gray-800 dark:text-gray-200">{option}</span>
                {selected !== null && (
                  <span className="text-sm text-gray-500 dark:text-gray-400">
                    {percentage}% ({count} votes)
                  </span>
                )}
              </div>
            </button>
          );
        })}
      </div>

      {error && (
        <p className="text-red-500 dark:text-red-400 text-sm mt-2">{error}</p>
      )}

      <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400 mt-2">
        <span>{totalVotes} {totalVotes === 1 ? "vote" : "votes"}</span>
        {isExpired && <span>Ended</span>}
        {!isExpired && expiresAt && (
          <span>Ends {new Date(expiresAt).toLocaleDateString()}</span>
        )}
        {selected !== null && !isExpired && <span>✓ Voted</span>}
      </div>
    </div>
  );
}
