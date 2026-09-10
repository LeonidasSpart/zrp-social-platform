"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Loader2, Search, X } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import VerifiedBadge from "@/components/VerifiedBadge";

export interface SelectableUser {
  id: string;
  username: string;
  name: string | null;
  avatarUrl: string | null;
  badgeType: string | null;
}

interface UserMultiSelectProps {
  selected: SelectableUser[];
  onChange: (users: SelectableUser[]) => void;
  // Ids to hide from search results entirely (e.g. people already in the
  // group, or the current user) - not just "already selected", which
  // `selected` already covers on its own via the checkbox state below.
  excludeIds?: string[];
  disabled?: boolean;
  // Distinguishes the aria-label of the search input between "search
  // people to start a new group" and "search people to add to this
  // group" without needing a second near-identical component.
  ariaLabel: string;
}

/**
 * Real user search via /api/search?type=users - reused as-is by both
 * group creation (NewGroupModal) and "add participants" (GroupInfoPanel)
 * rather than each building its own picker. The endpoint already
 * excludes blocked/muted/banned users server-side (see
 * src/app/api/search/route.ts's own KDoc), so this never even shows a
 * user the create/add-participant API would reject anyway.
 */
export default function UserMultiSelect({
  selected,
  onChange,
  excludeIds = [],
  disabled = false,
  ariaLabel,
}: UserMultiSelectProps) {
  const { t } = useLanguage();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SelectableUser[]>([]);
  const [searching, setSearching] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const requestIdRef = useRef(0);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    const trimmed = query.trim();
    if (trimmed.length < 2) {
      setResults([]);
      setSearching(false);
      return;
    }

    setSearching(true);
    debounceRef.current = setTimeout(async () => {
      const requestId = ++requestIdRef.current;
      try {
        const res = await fetch(`/api/search?type=users&q=${encodeURIComponent(trimmed)}`, {
          cache: "no-store",
        });
        if (!res.ok) throw new Error("search failed");
        const data = await res.json();
        // Ignore a stale response that resolved after a newer keystroke
        // already fired a fresher request.
        if (requestId !== requestIdRef.current) return;
        setResults(Array.isArray(data.users) ? data.users : []);
      } catch {
        if (requestId === requestIdRef.current) setResults([]);
      } finally {
        if (requestId === requestIdRef.current) setSearching(false);
      }
    }, 300);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query]);

  const selectedIds = new Set(selected.map((u) => u.id));
  const excludedIds = new Set(excludeIds);
  const visibleResults = results.filter((u) => !excludedIds.has(u.id));

  const toggle = (user: SelectableUser) => {
    if (disabled) return;
    if (selectedIds.has(user.id)) {
      onChange(selected.filter((u) => u.id !== user.id));
    } else {
      onChange([...selected, user]);
    }
  };

  const remove = (id: string) => {
    if (disabled) return;
    onChange(selected.filter((u) => u.id !== id));
  };

  return (
    <div className="min-w-0">
      {selected.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-2" role="list" aria-label={ariaLabel}>
          {selected.map((user) => (
            <span
              key={user.id}
              role="listitem"
              className="inline-flex items-center gap-1 pl-1 pr-1.5 py-1 rounded-full bg-zrp-red/10 text-zrp-red text-xs font-medium"
            >
              <span className="w-5 h-5 rounded-full bg-zrp-red/20 overflow-hidden flex items-center justify-center text-[10px] font-bold flex-shrink-0">
                {user.avatarUrl ? (
                  <img src={user.avatarUrl} alt="" className="w-full h-full object-cover" />
                ) : (
                  (user.name || user.username)[0]?.toUpperCase()
                )}
              </span>
              <span className="max-w-[120px] truncate">{user.name || user.username}</span>
              <button
                type="button"
                onClick={() => remove(user.id)}
                disabled={disabled}
                className="rounded-full hover:bg-zrp-red/20 p-0.5 disabled:opacity-50"
                aria-label={`Remove ${user.name || user.username}`}
              >
                <X className="w-3 h-3" />
              </button>
            </span>
          ))}
        </div>
      )}

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          disabled={disabled}
          placeholder={t("group.create.searchPlaceholder")}
          aria-label={ariaLabel}
          className="
            w-full pl-9 pr-9 py-2.5 rounded-xl border border-gray-300 dark:border-gray-600
            bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white
            placeholder:text-gray-400 outline-none transition
            focus:border-zrp-red focus:ring-2 focus:ring-zrp-red/20
            disabled:opacity-50
          "
        />
        {searching && (
          <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 animate-spin" />
        )}
      </div>

      {query.trim().length >= 2 && (
        <div className="mt-2 max-h-56 overflow-y-auto rounded-xl border border-gray-200 dark:border-gray-700 divide-y divide-gray-100 dark:divide-gray-800">
          {!searching && visibleResults.length === 0 ? (
            <p className="px-3 py-3 text-sm text-gray-400 text-center">
              {t("group.create.errNoResults")}
            </p>
          ) : (
            visibleResults.map((user) => {
              const isSelected = selectedIds.has(user.id);
              return (
                <button
                  key={user.id}
                  type="button"
                  onClick={() => toggle(user)}
                  disabled={disabled}
                  aria-pressed={isSelected}
                  className="w-full flex items-center gap-2.5 px-3 py-2.5 text-left hover:bg-gray-50 dark:hover:bg-gray-800/70 transition disabled:opacity-50"
                >
                  <span className="w-8 h-8 rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden flex items-center justify-center text-xs font-bold text-gray-600 dark:text-gray-300 flex-shrink-0">
                    {user.avatarUrl ? (
                      <img src={user.avatarUrl} alt="" className="w-full h-full object-cover" />
                    ) : (
                      (user.name || user.username)[0]?.toUpperCase()
                    )}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1 min-w-0">
                      <span className="truncate text-sm font-medium text-gray-900 dark:text-white">
                        {user.name || user.username}
                      </span>
                      <VerifiedBadge badgeType={user.badgeType} className="flex-shrink-0" />
                    </span>
                    <span className="block text-xs text-gray-400 truncate">@{user.username}</span>
                  </span>
                  <span
                    className={`flex-shrink-0 w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                      isSelected
                        ? "bg-zrp-red border-zrp-red text-white"
                        : "border-gray-300 dark:border-gray-600"
                    }`}
                  >
                    {isSelected && <Check className="w-3 h-3" />}
                  </span>
                </button>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
