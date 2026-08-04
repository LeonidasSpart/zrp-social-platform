"use client";

import { useState, useEffect, useRef } from "react";
import { MapPin, Loader2 } from "lucide-react";

interface LocationAutocompleteProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  label?: string;
  required?: boolean;
  className?: string;
}

export default function LocationAutocomplete({
  value,
  onChange,
  placeholder = "Search for a city...",
  label = "Location",
  required = false,
  className = "",
}: LocationAutocompleteProps) {
  const [suggestions, setSuggestions] = useState<
    Array<{ display_name: string; lat: string; lon: string }>
  >([]);
  const [loading, setLoading] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const [inputValue, setInputValue] = useState(value);
  const wrapperRef = useRef<HTMLDivElement>(null);

  // ─── Fetch suggestions from Nominatim ──────────────────────────
  useEffect(() => {
    const fetchSuggestions = async () => {
      if (inputValue.length < 2) {
        setSuggestions([]);
        return;
      }

      setLoading(true);
      try {
        const res = await fetch(
          `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(
            inputValue
          )}&limit=5&addressdetails=1&featuretype=city&featuretype=town&featuretype=village`
        );
        const data = await res.json();
        setSuggestions(data);
      } catch (error) {
        console.error("Location autocomplete error:", error);
        setSuggestions([]);
      } finally {
        setLoading(false);
      }
    };

    const debounce = setTimeout(fetchSuggestions, 300);
    return () => clearTimeout(debounce);
  }, [inputValue]);

  // ─── Handle click outside to close dropdown ────────────────────
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // ─── Handle selection ──────────────────────────────────────────
  const handleSelect = (displayName: string) => {
    setInputValue(displayName);
    onChange(displayName);
    setShowDropdown(false);
    setSuggestions([]);
  };

  // ─── Handle input change ──────────────────────────────────────
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setInputValue(val);
    setShowDropdown(true);
    if (val.length < 2) {
      setSuggestions([]);
    }
  };

  return (
    <div className="relative w-full" ref={wrapperRef}>
      {label && (
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
          {label}
        </label>
      )}
      <div className="relative">
        <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input
          type="text"
          value={inputValue}
          onChange={handleInputChange}
          onFocus={() => inputValue.length >= 2 && setShowDropdown(true)}
          placeholder={placeholder}
          required={required}
          className={`w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-zrp-red focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white ${className}`}
        />
        {loading && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2">
            <Loader2 className="w-4 h-4 animate-spin text-gray-400" />
          </div>
        )}
      </div>

      {/* Dropdown */}
      {showDropdown && suggestions.length > 0 && (
        <ul className="absolute z-10 w-full mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg max-h-60 overflow-y-auto">
          {suggestions.map((item, index) => (
            <li
              key={index}
              className="px-4 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer text-sm text-gray-900 dark:text-white flex items-center gap-2"
              onClick={() => handleSelect(item.display_name)}
            >
              <MapPin className="w-4 h-4 text-gray-400" />
              {item.display_name}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
