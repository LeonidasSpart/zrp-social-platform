"use client";

import { useEffect, useState } from "react";
import { Search, X } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import VerifiedBadge from "@/components/VerifiedBadge";
import type { PlayUserSummary } from "@/lib/play/types";

interface OpponentSearchProps {
  value: PlayUserSummary | null;
  onChange: (user: PlayUserSummary | null) => void;
  excludeUserId?: string;
}

export default function OpponentSearch({ value, onChange, excludeUserId }: OpponentSearchProps) {
  const { t } = useLanguage();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PlayUserSummary[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (query.trim().length < 2) {
      setResults([]);
      return;
    }
    setLoading(true);
    const timeout = setTimeout(() => {
      fetch(`/api/search?type=users&q=${encodeURIComponent(query.trim())}`)
        .then((res) => res.json())
        .then((data) => setResults((data.users || []).filter((u: PlayUserSummary) => u.id !== excludeUserId)))
        .catch(() => setResults([]))
        .finally(() => setLoading(false));
    }, 300);
    return () => clearTimeout(timeout);
  }, [query, excludeUserId]);

  if (value) {
    return (
      <div className="flex items-center gap-3 p-3 rounded-xl border border-zrp-red bg-zrp-red/5">
        <img src={value.avatarUrl || "/default-avatar.png"} alt={value.username} className="w-9 h-9 rounded-full object-cover" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1 text-sm font-semibold text-gray-900 dark:text-white truncate">
            @{value.username}
            <VerifiedBadge badgeType={value.badgeType} />
          </div>
        </div>
        <button type="button" onClick={() => onChange(null)} aria-label={t("play.selectOpponent")}>
          <X className="w-4 h-4 text-gray-400" />
        </button>
      </div>
    );
  }

  return (
    <div className="relative">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("play.searchUsers")}
          className="w-full pl-9 pr-3 py-2.5 rounded-full border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-zrp-red"
        />
      </div>
      {(loading || results.length > 0) && query.trim().length >= 2 && (
        <div className="absolute z-10 mt-1 w-full bg-white dark:bg-zrp-deepBlack rounded-xl border border-gray-200 dark:border-gray-700 shadow-lg max-h-64 overflow-y-auto">
          {results.map((user) => (
            <button
              key={user.id}
              type="button"
              onClick={() => {
                onChange(user);
                setQuery("");
                setResults([]);
              }}
              className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-gray-50 dark:hover:bg-gray-800 transition text-left"
            >
              <img src={user.avatarUrl || "/default-avatar.png"} alt={user.username} className="w-8 h-8 rounded-full object-cover" />
              <div className="flex items-center gap-1 text-sm text-gray-800 dark:text-gray-200">
                @{user.username}
                <VerifiedBadge badgeType={user.badgeType} />
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
