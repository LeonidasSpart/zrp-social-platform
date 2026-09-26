"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import type { MyAmbassadorStatus } from "./entry";

export interface MyAmbassadorProfileSummary {
  status: MyAmbassadorStatus;
  level: "EXPLORER" | "AMBASSADOR" | "COMMUNITY_LEADER" | "GLOBAL_AMBASSADOR";
  countryCode: string;
}

export interface MyAmbassadorProfileState {
  /** `undefined` while the real profile is still being fetched, `null` once we know there is none. */
  profile: MyAmbassadorProfileSummary | null | undefined;
  /** Convenience: the status, or null for "never applied" / signed out. `undefined` while loading. */
  status: MyAmbassadorStatus | null | undefined;
  loading: boolean;
}

/**
 * The signed-in viewer's own real ambassador state, from
 * GET /api/ambassadors/me - a fresh, uncached DB read on every mount.
 * Ambassador status is deliberately NOT a JWT/session claim (approval
 * never touches User.role), so nothing here can be stale from a
 * cached token; the only way to get it wrong is to not ask, which is
 * what the landing page's entry points used to do.
 *
 * Signed-out viewers resolve immediately to `null` (they get the
 * public "apply" entry, and /ambassadors/apply asks them to log in).
 */
export function useMyAmbassadorProfile(): MyAmbassadorProfileState {
  const { status: sessionStatus } = useSession();
  const [profile, setProfile] = useState<MyAmbassadorProfileSummary | null | undefined>(undefined);

  useEffect(() => {
    if (sessionStatus === "loading") return;
    if (sessionStatus !== "authenticated") {
      setProfile(null);
      return;
    }
    let cancelled = false;
    setProfile(undefined);
    fetch("/api/ambassadors/me", { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : { profile: null }))
      .then((data) => {
        if (!cancelled) setProfile(data?.profile ?? null);
      })
      .catch(() => {
        if (!cancelled) setProfile(null);
      });
    return () => {
      cancelled = true;
    };
  }, [sessionStatus]);

  return {
    profile,
    status: profile === undefined ? undefined : profile?.status ?? null,
    loading: sessionStatus === "loading" || profile === undefined,
  };
}
