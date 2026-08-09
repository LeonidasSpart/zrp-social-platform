"use client";

import { useState, useEffect, useRef } from "react";
import { useDebounce } from "@/hooks/useDebounce";
import VerifiedBadge from "@/components/VerifiedBadge";

interface UserSuggestion {
  id: string;
  username: string;
  name: string | null;
  avatarUrl: string | null;
  badgeType: string | null;
}

interface MentionAutocompleteProps {
  text: string;
  cursorPosition: number;
  onSelect: (mention: string) => void;
  onClose: () => void;
}

export default function MentionAutocomplete({
  text,
  cursorPosition,
  onSelect,
  onClose,
}: MentionAutocompleteProps) {
  const [query, setQuery] = useState("");
  const [users, setUsers] = useState<UserSuggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const debouncedQuery = useDebounce(query, 200);

  // ─── Detect if we're inside a mention ────────────────────────────
  useEffect(() => {
    const textBeforeCursor = text.slice(0, cursorPosition);
    const match = textBeforeCursor.match(/@(\w*)$/);
    if (match) {
      setQuery(match[1] || "");
      setIsOpen(true);
    } else {
      setIsOpen(false);
      onClose();
    }
  }, [text, cursorPosition, onClose]);

  // ─── Fetch users ──────────────────────────────────────────────────
  useEffect(() => {
    if (!isOpen || debouncedQuery.length === 0) {
      setUsers([]);
      return;
    }

    const fetchUsers = async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(debouncedQuery)}&type=users`);
        if (res.ok) {
          const data = await res.json();
          setUsers(data.users || []);
          setSelectedIndex(0);
        }
      } catch (error) {
        console.error("Mention search error:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchUsers();
  }, [debouncedQuery, isOpen]);

  // ─── Keyboard navigation ──────────────────────────────────────────
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isOpen) return;

      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex((prev) => (prev + 1) % users.length);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex((prev) => (prev - 1 + users.length) % users.length);
      } else if (e.key === "Enter" && users.length > 0) {
        e.preventDefault();
        const user = users[selectedIndex];
        if (user) {
          onSelect(`@${user.username} `);
          setIsOpen(false);
          onClose();
        }
      } else if (e.key === "Escape") {
        e.preventDefault();
        setIsOpen(false);
        onClose();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, users, selectedIndex, onSelect, onClose]);

  if (!isOpen || users.length === 0) return null;

  return (
    <div
      ref={containerRef}
      className="absolute z-50 w-64 max-h-64 overflow-y-auto bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg"
      style={{ top: "100%", left: 0, marginTop: "4px" }}
    >
      {loading ? (
        <div className="px-4 py-2 text-sm text-gray-500 dark:text-gray-400">Loading...</div>
      ) : (
        <div>
          {users.map((user, index) => (
            <button
              key={user.id}
              onClick={() => {
                onSelect(`@${user.username} `);
                setIsOpen(false);
                onClose();
              }}
              className={`flex items-center gap-3 w-full text-left px-4 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 transition ${
                index === selectedIndex ? "bg-gray-100 dark:bg-gray-700" : ""
              }`}
            >
              <div className="w-8 h-8 rounded-full bg-gray-200 dark:bg-gray-600 overflow-hidden flex-shrink-0">
                {user.avatarUrl ? (
                  <img src={user.avatarUrl} alt={user.username} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-sm font-bold text-gray-600 dark:text-gray-300">
                    {(user.name || user.username)[0].toUpperCase()}
                  </div>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 dark:text-white truncate flex items-center gap-1">
                  <span className="truncate">{user.name || user.username}</span>
                  <VerifiedBadge badgeType={user.badgeType} className="flex-shrink-0" />
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400">@{user.username}</p>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
