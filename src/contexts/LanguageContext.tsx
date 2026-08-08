"use client";

import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { Language, translations, SUPPORTED_LANGUAGES, type TranslationKey } from "@/lib/translations";

interface LanguageContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (key: TranslationKey, params?: Record<string, string | number>) => string;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

const COOKIE_NAME = "zrp-lang";
const SUPPORTED_CODES = SUPPORTED_LANGUAGES.map((l) => l.code);

function getCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(new RegExp(`(^| )${name}=([^;]+)`));
  return match ? decodeURIComponent(match[2]) : null;
}

function setCookie(name: string, value: string) {
  if (typeof document === "undefined") return;
  document.cookie = `${name}=${encodeURIComponent(value)}; path=/; max-age=${60 * 60 * 24 * 365}; SameSite=Lax`;
}

function detectBrowserLanguage(): Language {
  if (typeof navigator === "undefined") return "en";
  const browserLangs = navigator.languages || [navigator.language];
  for (const bl of browserLangs) {
    const code = bl.slice(0, 2).toLowerCase();
    if (SUPPORTED_CODES.includes(code as Language)) {
      return code as Language;
    }
  }
  return "en";
}

function interpolate(str: string, params?: Record<string, string | number>) {
  if (!params) return str;
  return Object.entries(params).reduce(
    (acc, [key, value]) => acc.replace(new RegExp(`\\{${key}\\}`, "g"), String(value)),
    str
  );
}

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<Language>("en");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const cookieLang = getCookie(COOKIE_NAME) as Language | null;
    if (cookieLang && SUPPORTED_CODES.includes(cookieLang)) {
      setLanguageState(cookieLang);
    } else {
      const detected = detectBrowserLanguage();
      setLanguageState(detected);
      setCookie(COOKIE_NAME, detected);
    }
    setMounted(true);
  }, []);

  const setLanguage = (lang: Language) => {
    setLanguageState(lang);
    setCookie(COOKIE_NAME, lang);
  };

  const t = (key: TranslationKey, params?: Record<string, string | number>) => {
    const raw = translations[language]?.[key] ?? translations.en[key] ?? key;
    return interpolate(raw, params);
  };

  // Avoid a flash of wrong-language content before the cookie/browser check runs
  if (!mounted) {
    return (
      <LanguageContext.Provider
        value={{
          language: "en",
          setLanguage,
          t: (k, p) => interpolate(translations.en[k] ?? k, p),
        }}
      >
        {children}
      </LanguageContext.Provider>
    );
  }

  return (
    <LanguageContext.Provider value={{ language, setLanguage, t }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error("useLanguage must be used within a LanguageProvider");
  return ctx;
}
