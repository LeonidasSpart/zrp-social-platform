"use client";

import { createContext, useContext, useEffect, useState } from "react";

type Theme = "light" | "dark";

interface ThemeContextType {
  theme: Theme;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<Theme>("light");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const savedTheme = localStorage.getItem("theme") as Theme | null;
    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;

    if (savedTheme) {
      setTheme(savedTheme);
    } else if (prefersDark) {
      setTheme("dark");
    }
  }, []);

  useEffect(() => {
    if (mounted) {
      document.documentElement.classList.toggle("dark", theme === "dark");
      localStorage.setItem("theme", theme);

      // Keep the iOS status bar style in sync with the active theme.
      // "black-translucent" overlays a translucent black tint over the
      // status bar area, which looks correct against a dark background
      // but reads as a washed-out gray over light content - this was
      // previously hardcoded to black-translucent regardless of theme,
      // which is exactly what caused light mode to look gray specifically
      // on mobile (desktop/iPad browser chrome has no equivalent overlay).
      const statusBarMeta = document.querySelector(
        'meta[name="apple-mobile-web-app-status-bar-style"]'
      );
      if (statusBarMeta) {
        statusBarMeta.setAttribute(
          "content",
          theme === "dark" ? "black-translucent" : "default"
        );
      }
    }
  }, [theme, mounted]);

  const toggleTheme = () => {
    setTheme(theme === "light" ? "dark" : "light");
  };

  if (!mounted) return null;

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error("useTheme must be used within a ThemeProvider");
  }
  return context;
}
