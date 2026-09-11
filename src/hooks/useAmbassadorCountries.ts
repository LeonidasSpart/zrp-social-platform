"use client";

import { useEffect, useState } from "react";
import { useLanguage } from "@/contexts/LanguageContext";

export interface AmbassadorCountryStat {
  code: string;
  name: string;
  region:
    | "AFRICA"
    | "ASIA"
    | "EUROPE"
    | "NORTH_AMERICA"
    | "SOUTH_AMERICA"
    | "OCEANIA"
    | "ANTARCTICA";
  ambassadors: number;
  communities: number;
  activeMembers: number;
}

interface State {
  countries: AmbassadorCountryStat[];
  loading: boolean;
  error: boolean;
}

/**
 * Fetches the complete Ambassador country dataset (always all ~250
 * countries - see /api/ambassadors/countries) once per active
 * language, shared by the world map and the country explorer so they
 * never drift out of sync with each other or re-fetch independently.
 */
export function useAmbassadorCountries() {
  const { language } = useLanguage();
  const [state, setState] = useState<State>({ countries: [], loading: true, error: false });

  useEffect(() => {
    let cancelled = false;
    setState((s) => ({ ...s, loading: true, error: false }));

    fetch(`/api/ambassadors/countries?lang=${language}`)
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(String(res.status)))))
      .then((data) => {
        if (cancelled) return;
        setState({ countries: data.countries || [], loading: false, error: false });
      })
      .catch(() => {
        if (cancelled) return;
        setState({ countries: [], loading: false, error: true });
      });

    return () => {
      cancelled = true;
    };
  }, [language]);

  return state;
}
