"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { Check, Clock, Copy, Globe2, Loader2, MapPin, ShieldAlert, XCircle } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import { flagEmoji, getCountryName } from "@/lib/ambassadors/countries";
import type { TranslationKey } from "@/lib/translations";

interface AmbassadorProfile {
  status: "PENDING" | "APPROVED" | "REJECTED" | "SUSPENDED";
  level: "EXPLORER" | "AMBASSADOR" | "COMMUNITY_LEADER" | "GLOBAL_AMBASSADOR";
  countryCode: string;
  cityRegion: string | null;
  invitationCode: string;
  rejectionReason: string | null;
  suspensionReason: string | null;
  appliedAt: string;
}

const LEVEL_LABEL: Record<AmbassadorProfile["level"], TranslationKey> = {
  EXPLORER: "ambassadors.levels.explorer",
  AMBASSADOR: "ambassadors.levels.ambassador",
  COMMUNITY_LEADER: "ambassadors.levels.communityLeader",
  GLOBAL_AMBASSADOR: "ambassadors.levels.globalAmbassador",
};

/*
 * /ambassadors/dashboard - the command-center foundation from section
 * 11. Every number/section here reflects the signed-in user's own
 * real AmbassadorProfile row (GET /api/ambassadors/me) - there is no
 * synthetic "sample" state. A user who never applied sees an honest
 * empty state with a real CTA, not a fabricated preview dashboard.
 *
 * "Community activity" / "Achievements" / "Global position" from the
 * brief's list of possible sections are UI foundation only: ZRP has no
 * Community model, activity feed or leaderboard for ambassadors yet
 * (see the PR description), so this deliberately does not render
 * placeholder numbers for them - only the sections backed by a real
 * field on AmbassadorProfile today.
 */
export default function AmbassadorDashboardPage() {
  const { t, language } = useLanguage();
  const { data: session, status } = useSession();
  const [profile, setProfile] = useState<AmbassadorProfile | null | undefined>(undefined);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (status !== "authenticated") return;
    let cancelled = false;
    fetch("/api/ambassadors/me")
      .then((res) => (res.ok ? res.json() : { profile: null }))
      .then((data) => {
        if (!cancelled) setProfile(data.profile);
      })
      .catch(() => {
        if (!cancelled) setProfile(null);
      });
    return () => {
      cancelled = true;
    };
  }, [status]);

  const invitationLink =
    typeof window !== "undefined" && profile
      ? `${window.location.origin}/signup?ref=${profile.invitationCode}`
      : "";

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(invitationLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard access can be denied by the browser - the link text
      // itself is still visible and selectable, so nothing is lost.
    }
  };

  let content: React.ReactNode;

  if (status === "loading" || profile === undefined) {
    content = (
      <div className="flex justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-gray-400" aria-hidden="true" />
      </div>
    );
  } else if (!session) {
    content = (
      <div className="rounded-2xl border border-gray-200 bg-gray-50 p-8 text-center dark:border-gray-800 dark:bg-zrp-charcoal">
        <p className="text-sm text-gray-600 dark:text-gray-400">{t("ambassadors.apply.requireLogin")}</p>
        <Link
          href={`/login?callbackUrl=${encodeURIComponent("/ambassadors/dashboard")}`}
          className="mt-4 inline-flex items-center justify-center rounded-full bg-zrp-red px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-zrp-darkRed"
        >
          {t("nav.login")}
        </Link>
      </div>
    );
  } else if (!profile) {
    content = (
      <div className="rounded-2xl border border-dashed border-gray-300 p-10 text-center dark:border-gray-700">
        <Globe2 className="mx-auto h-10 w-10 text-gray-300 dark:text-gray-700" aria-hidden="true" />
        <h2 className="mt-4 font-orbitron text-lg font-bold text-gray-900 dark:text-white">
          {t("ambassadors.dashboard.notAppliedTitle")}
        </h2>
        <p className="mx-auto mt-2 max-w-sm text-sm text-gray-600 dark:text-gray-400">
          {t("ambassadors.dashboard.notAppliedBody")}
        </p>
        <Link
          href="/ambassadors/apply"
          className="mt-5 inline-flex items-center justify-center rounded-full bg-zrp-red px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-zrp-darkRed"
        >
          {t("ambassadors.dashboard.notAppliedCta")}
        </Link>
      </div>
    );
  } else {
    const countryName = getCountryName(profile.countryCode, language) || profile.countryCode;

    content = (
      <div className="space-y-5">
        {profile.status === "PENDING" && (
          <StatusBanner
            icon={Clock}
            tone="pending"
            title={t("ambassadors.dashboard.pendingTitle")}
            body={t("ambassadors.dashboard.pendingBody")}
          />
        )}
        {profile.status === "REJECTED" && (
          <StatusBanner icon={XCircle} tone="rejected" title={t("ambassadors.dashboard.rejectedTitle")} body={t("ambassadors.dashboard.rejectedBody")}>
            <Link
              href="/ambassadors/apply"
              className="mt-3 inline-flex items-center justify-center rounded-full border border-gray-300 px-4 py-2 text-xs font-semibold text-gray-700 transition hover:bg-gray-100 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
            >
              {t("ambassadors.dashboard.reapplyCta")}
            </Link>
          </StatusBanner>
        )}
        {profile.status === "SUSPENDED" && (
          <StatusBanner
            icon={ShieldAlert}
            tone="suspended"
            title={t("ambassadors.dashboard.suspendedTitle")}
            body={t("ambassadors.dashboard.suspendedBody")}
          />
        )}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <DashboardCard label={t("ambassadors.dashboard.myCountry")}>
            <div className="flex items-center gap-2">
              <span className="text-2xl leading-none" aria-hidden="true">
                {flagEmoji(profile.countryCode)}
              </span>
              <div>
                <p className="font-semibold text-gray-900 dark:text-white">{countryName}</p>
                {profile.cityRegion && (
                  <p className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400">
                    <MapPin className="h-3 w-3" aria-hidden="true" />
                    {profile.cityRegion}
                  </p>
                )}
              </div>
            </div>
          </DashboardCard>

          <DashboardCard label={t("ambassadors.dashboard.myLevel")}>
            <p className="font-orbitron font-semibold text-gray-900 dark:text-white">
              {t(LEVEL_LABEL[profile.level])}
            </p>
          </DashboardCard>
        </div>

        {profile.status === "APPROVED" && (
          <DashboardCard label={t("ambassadors.dashboard.myInvitationLink")}>
            <div className="flex items-center gap-2">
              <input
                readOnly
                value={invitationLink}
                onFocus={(e) => e.target.select()}
                className="w-full truncate rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-600 dark:border-gray-700 dark:bg-zrp-deepBlack dark:text-gray-300"
              />
              <button
                type="button"
                onClick={copyLink}
                aria-label={t("ambassadors.dashboard.copyLink")}
                className="shrink-0 rounded-lg border border-gray-300 p-2 text-gray-600 transition hover:bg-gray-100 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
              >
                {copied ? <Check className="h-4 w-4 text-green-600" aria-hidden="true" /> : <Copy className="h-4 w-4" aria-hidden="true" />}
              </button>
            </div>
          </DashboardCard>
        )}

        {/* Community activity, achievements and global position are
            intentionally not shown: there is no real data behind them
            yet (see this page's own top comment) and this dashboard
            never fabricates numbers to fill a section. */}
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <h1 className="font-orbitron text-2xl font-bold text-gray-900 dark:text-white sm:text-3xl">
        {t("ambassadors.dashboard.title")}
      </h1>
      <div className="mt-6">{content}</div>
    </div>
  );
}

function DashboardCard({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-zrp-charcoal">
      <p className="text-[11px] font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">{label}</p>
      <div className="mt-2">{children}</div>
    </div>
  );
}

function StatusBanner({
  icon: Icon,
  tone,
  title,
  body,
  children,
}: {
  icon: typeof Clock;
  tone: "pending" | "rejected" | "suspended";
  title: string;
  body: string;
  children?: React.ReactNode;
}) {
  const toneClass = {
    pending: "border-yellow-200 bg-yellow-50 text-yellow-800 dark:border-yellow-900/40 dark:bg-yellow-900/10 dark:text-yellow-400",
    rejected: "border-gray-200 bg-gray-50 text-gray-700 dark:border-gray-800 dark:bg-zrp-charcoal dark:text-gray-300",
    suspended: "border-red-200 bg-red-50 text-red-700 dark:border-red-900/40 dark:bg-red-900/10 dark:text-red-400",
  }[tone];

  return (
    <div className={`rounded-2xl border p-4 ${toneClass}`}>
      <div className="flex items-start gap-3">
        <Icon className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
        <div>
          <p className="font-semibold">{title}</p>
          <p className="mt-1 text-sm opacity-90">{body}</p>
          {children}
        </div>
      </div>
    </div>
  );
}
