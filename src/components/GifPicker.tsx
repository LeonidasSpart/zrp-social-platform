"use client";

import { useState, useEffect, useRef } from "react";
import { Search, X } from "lucide-react";

interface GifPickerProps {
  onSelect: (url: string) => void;
  onClose: () => void;
}

export default function GifPicker({ onSelect, onClose }: GifPickerProps) {
  const [query, setQuery] = useState("");
  const [gifs, setGifs] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [trending, setTrending] = useState<any[]>([]);
  const modalRef = useRef<HTMLDivElement>(null);

  // Load trending GIFs on mount
  useEffect(() => {
    fetchTrending();
  }, []);

  // Close on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (modalRef.current && !modalRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [onClose]);

  const fetchTrending = async () => {
    try {
      const res = await fetch("/api/gifs/trending");
      const data = await res.json();
      setTrending(data.results || []);
    } catch (error) {
      console.error("Error fetching trending GIFs:", error);
    }
  };

  const searchGifs = async () => {
    if (query.length < 2) return;

    setLoading(true);
    try {
      const res = await fetch(`/api/gifs/search?q=${encodeURIComponent(query)}`);
      const data = await res.json();
      setGifs(data.results || []);
    } catch (error) {
      console.error("Error searching GIFs:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      searchGifs();
    }
  };

  const displayGifs = query.length >= 2 ? gifs : trending;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 px-4">
      <div
        ref={modalRef}
        className="bg-white dark:bg-zrp-deepBlack rounded-lg shadow-xl max-w-lg w-full max-h-[80vh] overflow-hidden"
      >
        <div className="p-4 border-b border-gray-200 dark:border-gray-700 flex items-center gap-2">
          <h2 className="text-lg font-bold text-gray-900 dark:text-white">Choose a GIF</h2>
          <button
            onClick={onClose}
            className="ml-auto text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4">
          <div className="flex gap-2">
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Search GIFs..."
              className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-zrp-red focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
            />
            <button
              onClick={searchGifs}
              disabled={query.length < 2}
              className="bg-zrp-red text-white px-4 py-2 rounded-lg hover:bg-zrp-darkRed disabled:opacity-50 disabled:cursor-not-allowed transition"
            >
              <Search className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="p-4 overflow-y-auto max-h-[50vh]">
          {loading ? (
            <div className="text-center py-8 text-gray-500 dark:text-gray-400">Loading...</div>
          ) : displayGifs.length === 0 ? (
            <div className="text-center py-8 text-gray-500 dark:text-gray-400">
              {query.length >= 2 ? "No GIFs found" : "Type to search GIFs"}
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              {displayGifs.map((gif) => (
                <button
                  key={gif.id}
                  onClick={() => onSelect(gif.url)}
                  className="rounded-lg overflow-hidden hover:opacity-80 transition"
                >
                  <img src={gif.url} alt={gif.title} className="w-full h-auto" />
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
