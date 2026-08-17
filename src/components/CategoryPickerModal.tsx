"use client";

import { useMemo, useState } from "react";
import { X, Search, Check } from "lucide-react";
import { PROFESSIONAL_CATEGORIES } from "@/lib/professionalCategories";

interface CategoryPickerModalProps {
  isOpen: boolean;
  currentCategory: string | null;
  onClose: () => void;
  onSave: (category: string) => void;
}

export default function CategoryPickerModal({
  isOpen,
  currentCategory,
  onClose,
  onSave,
}: CategoryPickerModalProps) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string | null>(currentCategory);

  if (!isOpen) return null;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return PROFESSIONAL_CATEGORIES;
    return PROFESSIONAL_CATEGORIES.filter((c) => c.toLowerCase().includes(q));
  }, [query]);

  const handleSave = () => {
    if (selected) onSave(selected);
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center sm:justify-center">
      <div className="bg-white dark:bg-zrp-deepBlack w-full sm:max-w-lg sm:rounded-2xl max-h-[85vh] flex flex-col overflow-hidden">
        {/* ─── Header ─────────────────────────────────────────────── */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700 flex-shrink-0">
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 transition"
          >
            <X className="w-5 h-5" />
          </button>
          <span className="font-semibold text-gray-900 dark:text-white">
            Select a category
          </span>
          <div className="w-5" />
        </div>

        <div className="px-4 pt-4 pb-2 flex-shrink-0">
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-3">
            Choose the category to display on your profile. Pick the one that best describes your account.
          </p>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search categories"
              autoFocus
              className="w-full pl-10 pr-4 py-2.5 bg-gray-100 dark:bg-gray-800 rounded-full text-sm text-gray-900 dark:text-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-zrp-red"
            />
          </div>
        </div>

        {/* ─── List ───────────────────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto px-4">
          {filtered.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-8">
              No categories match "{query}".
            </p>
          ) : (
            filtered.map((category) => (
              <button
                key={category}
                onClick={() => setSelected(category)}
                className="w-full flex items-center justify-between py-3 border-b border-gray-100 dark:border-gray-800 text-left"
              >
                <span
                  className={`text-sm ${
                    selected === category
                      ? "font-semibold text-gray-900 dark:text-white"
                      : "text-gray-700 dark:text-gray-300"
                  }`}
                >
                  {category}
                </span>
                <span
                  className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${
                    selected === category
                      ? "border-zrp-red bg-zrp-red"
                      : "border-gray-300 dark:border-gray-600"
                  }`}
                >
                  {selected === category && <Check className="w-3 h-3 text-white" />}
                </span>
              </button>
            ))
          )}
        </div>

        {/* ─── Save ───────────────────────────────────────────────── */}
        <div className="p-4 border-t border-gray-200 dark:border-gray-700 flex-shrink-0">
          <button
            onClick={handleSave}
            disabled={!selected}
            className="w-full bg-zrp-red text-white font-semibold py-3 rounded-full hover:bg-zrp-darkRed disabled:opacity-50 disabled:cursor-not-allowed transition"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
