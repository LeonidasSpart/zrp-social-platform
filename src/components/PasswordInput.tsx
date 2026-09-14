"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { cn } from "@/lib/utils";
import { useLanguage } from "@/contexts/LanguageContext";

interface PasswordInputProps {
  id?: string;
  name?: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  placeholder?: string;
  label?: string;
  required?: boolean;
  disabled?: boolean;
  className?: string;
  autoComplete?: string;
  minLength?: number;
}

export default function PasswordInput({
  id,
  name,
  value,
  onChange,
  placeholder = "••••••••",
  label,
  required = false,
  disabled = false,
  className = "",
  autoComplete = "current-password",
  minLength,
}: PasswordInputProps) {
  // Every field owns its own toggle state - two PasswordInputs on the
  // same screen (new password / confirm password) must be revealable
  // independently, never as a pair.
  const [showPassword, setShowPassword] = useState(false);
  const { t } = useLanguage();
  const inputRef = useRef<HTMLInputElement>(null);
  // Falls back to a generated id so label/input stay associated even if
  // a caller forgets to pass one - an explicit id prop still wins.
  const generatedId = useId();
  const inputId = id ?? generatedId;
  // Caret position survives the type="password" <-> type="text" swap:
  // some browsers reset selectionStart/selectionEnd (or drop focus
  // entirely) when an input's type attribute changes underneath it, so
  // it's captured before the toggle and reapplied once React has
  // re-rendered with the new type.
  const selectionRef = useRef<{ start: number | null; end: number | null }>({
    start: null,
    end: null,
  });

  useEffect(() => {
    const el = inputRef.current;
    if (!el || selectionRef.current.start === null) return;
    el.focus();
    try {
      el.setSelectionRange(selectionRef.current.start, selectionRef.current.end);
    } catch {
      // Some input types don't support selection ranges; focus alone is
      // still preserved above.
    }
  }, [showPassword]);

  const toggleVisibility = () => {
    const el = inputRef.current;
    selectionRef.current = {
      start: el?.selectionStart ?? null,
      end: el?.selectionEnd ?? null,
    };
    setShowPassword((prev) => !prev);
  };

  return (
    <div className="space-y-1">
      {label && (
        <label htmlFor={inputId} className="block text-sm font-medium text-gray-700 dark:text-gray-300">
          {label}
        </label>
      )}
      <div className="relative">
        <input
          ref={inputRef}
          id={inputId}
          name={name}
          type={showPassword ? "text" : "password"}
          value={value}
          onChange={onChange}
          placeholder={placeholder}
          required={required}
          disabled={disabled}
          autoComplete={autoComplete}
          minLength={minLength}
          // cn() (tailwind-merge) rather than template interpolation:
          // a caller passing e.g. "py-3.5 rounded-xl" to match a taller
          // field next to it was previously fighting the defaults
          // below, and which one won came down to stylesheet order
          // rather than intent. Merging makes the caller's class
          // actually override the matching default, so the auth screens
          // can size this to sit flush with their other inputs without
          // changing the default every Settings field relies on.
          className={cn(
            "w-full px-4 py-2 pr-12 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-zrp-red focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white disabled:cursor-not-allowed disabled:opacity-60",
            className
          )}
        />
        <button
          type="button"
          onClick={toggleVisibility}
          disabled={disabled}
          // No tabIndex={-1}: the toggle must be keyboard-reachable, and
          // being a plain <button> it already picks up the app-wide
          // button:focus-visible ring (globals.css) for free - removing
          // an outline here would leave keyboard users with nothing.
          className="absolute right-3 top-1/2 -translate-y-1/2 rounded text-gray-400 transition hover:text-gray-600 disabled:cursor-not-allowed disabled:opacity-60 dark:hover:text-gray-300"
          aria-label={showPassword ? t("auth.hidePassword") : t("auth.showPassword")}
        >
          {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
        </button>
      </div>
    </div>
  );
}
