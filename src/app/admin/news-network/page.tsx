"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  Loader2,
  Pause,
  Play,
  RefreshCw,
  Rss,
  Trash2,
} from "lucide-react";

/*
 * ZRP News Network — admin console.
 *
 * ⚠️ TRANSLATION GAP (deliberate, flagged rather than papered over):
 * every other admin screen pulls its copy from src/lib/translations.ts
 * in all 11 ZRP languages. The strings below are English-only and live
 * in this file instead. Adding them to the shared dictionary means
 * writing 11 translations of each, and machine-translating six of those
 * languages to fill the gap is exactly what the ZRP design system
 * forbids. They are collected in one COPY object so moving them into
 * the dictionary later is a mechanical change, once real translations
 * exist. This is a staff-only surface, so the gap is contained.
 *
 * Every number on this screen is a live count from
 * /api/admin/news-network/status. Nothing here is estimated, cached or
 * placeholder data.
 */

const COPY = {
  title: "ZRP News Network",
  subtitle:
    "Automated editorial feeds. Every post is an original summary with its sources attributed and linked.",
  running: "Running",
  paused: "Paused",
  pause: "Pause automation",
  resume: "Resume automation",
  runNow: "Run a cycle now",
  lastCycle: "Last cycle",
  nextCycle: "Next cycle",
  never: "Never",
  activeFeeds: "Active feeds",
  publicationsToday: "Publications today",
  travelToday: "Travel publications",
  scheduled: "Queued to publish",
  failedJobs: "Failed publications",
  failedRenditions: "Failed summaries today",
  duplicatesPrevented: "Duplicate stories prevented",
  awaitingReview: "Sensitive stories awaiting review",
  readyStories: "Validated stories ready",
  sourceHealth: "Sources",
  healthy: "Healthy",
  warning: "Warning",
  failed: "Failed",
  disabled: "Disabled",
  languages: "Languages published today",
  enabledLanguages: "Languages",
  countries: "Countries published today",
  topics: "Categories published today",
  noneYet: "Nothing published yet today.",
  tabs: {
    overview: "Overview",
    feeds: "Feeds",
    sources: "Sources",
    queue: "Editorial queue",
    publications: "Publications",
  },
  loadError: "Could not load the news network status. Check your connection and try again.",
  retry: "Try again",
  provisionPilot: "Provision pilot feeds",
  provisionAll: "Provision the full roster",
  provisionNote:
    "Feeds are always created disabled. Provisioning creates accounts; it never publishes anything.",
  seedSources: "Install the starter source list",
  verify: "Verify",
  enable: "Enable",
  disable: "Disable",
  setAvatar: "Set avatar",
  setCover: "Set banner",
  imageHint: "JPEG, PNG, GIF or WebP, max 5MB. This is the only way to change these - the account has no password and can never sign in to do it itself.",
  clearBackoff: "Clear backoff",
  allowImages: "Allow images",
  blockImages: "Block images",
  remove: "Remove",
  removePrompt: "Why is this post being removed?",
  rejectPrompt: "Why is this story being rejected?",
  correctPrompt: "Correction note (shown on every post for this story):",
  correct: "Add correction",
  reject: "Reject",
  noFeeds:
    "No editorial feeds have been provisioned yet. Start with the pilot feeds, verify them, then expand.",
  noSources:
    "No sources yet. Install the starter list, then verify each one before enabling the automation.",
  noStories: "No stories in this queue.",
  noPublications: "Nothing has been published yet.",
  confirmProvisionAll:
    "Provision the full editorial roster? This creates 100+ editorial accounts, all disabled. Nothing will publish until you enable feeds individually.",
  pilotOnly: "Pilot",
  sources: "sources",
  posts: "posts",
} as const;

// ─── API shapes ──────────────────────────────────────────────────────

interface StatusResponse {
  status: {
    paused: boolean;
    lastCycleAt: string | null;
    nextCycleAt: string | null;
    requireHumanReviewForSensitive: boolean;
    enabledLanguages: string[];
    maxPublicationsPerCycle: number;
    maxPublicationsPerDay: number;
    minMinutesBetweenPublications: number;
  };
  lastRun: {
    id: string;
    status: string;
    startedAt: string;
    finishedAt: string | null;
    error: string | null;
  } | null;
  feeds: { total: number; enabled: number };
  publications: { today: number; travelToday: number; scheduled: number; failed: number };
  stories: { ready: number; pendingSensitiveReview: number };
  renditions: { failedToday: number };
  duplicatesPreventedToday: number;
  distribution: {
    languages: Array<{ language: string; count: number }>;
    countries: Array<{ country: string | null; count: number }>;
    topics: Array<{ topic: string; count: number }>;
  };
  sourceHealth: { HEALTHY: number; WARNING: number; FAILED: number; DISABLED: number };
}

interface FeedRow {
  id: string;
  key: string;
  displayName: string;
  language: string;
  region: string;
  country: string | null;
  enabled: boolean;
  isPilot: boolean;
  minMinutesBetweenPosts: number;
  maxPostsPerDay: number;
  lastPublishedAt: string | null;
  user: { username: string; banned: boolean };
  _count: { publications: number };
}

interface SourceRow {
  id: string;
  key: string;
  name: string;
  publisher: string;
  feedUrl: string;
  status: "HEALTHY" | "WARNING" | "FAILED" | "DISABLED";
  enabled: boolean;
  allowImages: boolean;
  trustTier: number;
  consecutiveFailures: number;
  lastError: string | null;
  lastSuccessAt: string | null;
  backoffUntil: string | null;
  _count: { references: number };
}

interface StoryRow {
  id: string;
  title: string;
  topic: string;
  region: string;
  country: string | null;
  confidence: string;
  sensitive: boolean;
  isBreaking: boolean;
  isTravel: boolean;
  importance: number;
  sourceCount: number;
  status: string;
  firstSeenAt: string;
  sourceMaterial: string;
  references: Array<{ id: string; url: string; title: string; source: { publisher: string } }>;
  renditions: Array<{ id: string; language: string; status: string; headline: string; error: string | null }>;
}

interface PublicationRow {
  id: string;
  language: string;
  status: string;
  scheduledFor: string;
  publishedAt: string | null;
  postId: string | null;
  error: string | null;
  feed: { key: string; displayName: string; user: { username: string } };
  rendition: { headline: string; language: string };
  story: { id: string; title: string; topic: string; confidence: string; correctionNote: string | null };
}

type Tab = keyof typeof COPY.tabs;

// ─── Presentational helpers ──────────────────────────────────────────

function formatDateTime(value: string | null): string {
  if (!value) return COPY.never;
  return new Date(value).toLocaleString();
}

function StatTile({ label, value, tone }: { label: string; value: string | number; tone?: "alert" }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
      <p className="text-xs text-gray-500 dark:text-gray-400">{label}</p>
      <p
        className={`mt-1 text-2xl font-semibold ${
          tone === "alert" && Number(value) > 0
            ? "text-zrp-red"
            : "text-gray-900 dark:text-white"
        }`}
      >
        {value}
      </p>
    </div>
  );
}

function SourceStatusPill({ status }: { status: SourceRow["status"] }) {
  const styles: Record<SourceRow["status"], string> = {
    HEALTHY: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
    WARNING: "bg-gray-200 text-gray-700 dark:bg-gray-700 dark:text-gray-200",
    FAILED: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
    DISABLED: "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400",
  };
  return (
    <span className={`inline-flex rounded-md px-2 py-0.5 text-[11px] font-medium ${styles[status]}`}>
      {status}
    </span>
  );
}

// ─── Page ────────────────────────────────────────────────────────────

export default function AdminNewsNetworkPage() {
  const [tab, setTab] = useState<Tab>("overview");

  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [feeds, setFeeds] = useState<FeedRow[]>([]);
  const [roster, setRoster] = useState<{ defined: number; provisioned: number } | null>(null);
  const [sources, setSources] = useState<SourceRow[]>([]);
  const [stories, setStories] = useState<StoryRow[]>([]);
  const [publications, setPublications] = useState<PublicationRow[]>([]);

  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const notify = useCallback((type: "success" | "error", text: string) => {
    setMessage({ type, text });
  }, []);

  const loadAll = useCallback(async () => {
    setLoading(true);
    setLoadFailed(false);
    try {
      const [statusRes, feedsRes, sourcesRes, storiesRes, publicationsRes] = await Promise.all([
        fetch("/api/admin/news-network/status", { cache: "no-store" }),
        fetch("/api/admin/news-network/feeds", { cache: "no-store" }),
        fetch("/api/admin/news-network/sources", { cache: "no-store" }),
        fetch("/api/admin/news-network/stories?limit=50", { cache: "no-store" }),
        fetch("/api/admin/news-network/publications?limit=50", { cache: "no-store" }),
      ]);

      if (!statusRes.ok) throw new Error("status");

      const statusData = await statusRes.json();
      setStatus(statusData);

      if (feedsRes.ok) {
        const data = await feedsRes.json();
        setFeeds(data.feeds ?? []);
        setRoster(data.roster ?? null);
      }
      if (sourcesRes.ok) setSources((await sourcesRes.json()).sources ?? []);
      if (storiesRes.ok) setStories((await storiesRes.json()).stories ?? []);
      if (publicationsRes.ok) setPublications((await publicationsRes.json()).publications ?? []);
    } catch {
      setLoadFailed(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const act = useCallback(
    async (
      id: string,
      url: string,
      init: RequestInit,
      successText: string
    ): Promise<boolean> => {
      setBusy(id);
      setMessage(null);
      try {
        const res = await fetch(url, {
          ...init,
          headers: { "Content-Type": "application/json", ...(init.headers ?? {}) },
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || data.success === false) {
          notify("error", data.error || "That action failed.");
          return false;
        }
        notify("success", successText);
        await loadAll();
        return true;
      } catch {
        notify("error", "That action failed. Check your connection and try again.");
        return false;
      } finally {
        setBusy(null);
      }
    },
    [loadAll, notify]
  );

  // Separate from act(): a file upload needs a multipart body with no
  // Content-Type override (the browser sets its own boundary), which
  // act() always forces to application/json.
  const uploadFeedImage = useCallback(
    async (feedId: string, kind: "avatarFile" | "coverFile", file: File): Promise<void> => {
      setBusy(feedId);
      setMessage(null);
      try {
        const formData = new FormData();
        formData.append(kind, file);

        const res = await fetch(`/api/admin/news-network/feeds/${feedId}`, {
          method: "PATCH",
          body: formData,
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || data.success === false) {
          notify("error", data.error || "That upload failed.");
          return;
        }
        notify("success", kind === "avatarFile" ? "Avatar updated." : "Banner updated.");
        await loadAll();
      } catch {
        notify("error", "That upload failed. Check your connection and try again.");
      } finally {
        setBusy(null);
      }
    },
    [loadAll, notify]
  );

  // ─── Loading ──────────────────────────────────────────────────
  if (loading && !status) {
    return (
      <div className="flex h-64 items-center justify-center" aria-busy="true">
        <Loader2 className="h-8 w-8 animate-spin text-zrp-red" aria-label="Loading" />
      </div>
    );
  }

  // ─── Error ────────────────────────────────────────────────────
  if (loadFailed && !status) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-8 text-center dark:border-gray-700 dark:bg-gray-800">
        <AlertTriangle className="mx-auto mb-3 h-8 w-8 text-zrp-red" aria-hidden="true" />
        <p className="mb-4 text-gray-700 dark:text-gray-200">{COPY.loadError}</p>
        <button
          type="button"
          onClick={loadAll}
          className="rounded-full bg-zrp-red px-4 py-2 text-sm font-medium text-white transition hover:bg-zrp-darkRed"
        >
          {COPY.retry}
        </button>
      </div>
    );
  }

  const paused = status?.status.paused ?? true;

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="flex items-center gap-2 text-2xl font-bold text-gray-900 dark:text-white">
            <Rss className="h-6 w-6 flex-shrink-0" aria-hidden="true" />
            {COPY.title}
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-gray-500 dark:text-gray-400">{COPY.subtitle}</p>
        </div>

        <div className="flex flex-shrink-0 flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={busy === "pause"}
            aria-busy={busy === "pause"}
            onClick={() =>
              act(
                "pause",
                "/api/admin/news-network/settings",
                { method: "PATCH", body: JSON.stringify({ paused: !paused }) },
                paused ? "Automation resumed." : "Automation paused."
              )
            }
            className="inline-flex items-center gap-2 rounded-full bg-zrp-red px-4 py-2 text-sm font-medium text-white transition hover:bg-zrp-darkRed disabled:opacity-60"
          >
            {busy === "pause" ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : paused ? (
              <Play className="h-4 w-4" aria-hidden="true" />
            ) : (
              <Pause className="h-4 w-4" aria-hidden="true" />
            )}
            {paused ? COPY.resume : COPY.pause}
          </button>

          <button
            type="button"
            disabled={busy === "run"}
            aria-busy={busy === "run"}
            onClick={() =>
              act("run", "/api/admin/news-network/run", { method: "POST" }, "Cycle finished.")
            }
            className="inline-flex items-center gap-2 rounded-full border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50 disabled:opacity-60 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-700"
          >
            {busy === "run" ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <RefreshCw className="h-4 w-4" aria-hidden="true" />
            )}
            {COPY.runNow}
          </button>
        </div>
      </div>

      <div aria-live="polite">
        {message && (
          <div
            role={message.type === "error" ? "alert" : undefined}
            className={`mb-4 rounded-lg border p-3 text-sm ${
              message.type === "success"
                ? "border-green-200 bg-green-50 text-green-700 dark:border-green-800 dark:bg-green-900/20 dark:text-green-400"
                : "border-red-200 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-400"
            }`}
          >
            {message.text}
          </div>
        )}
      </div>

      {/* ─── Status strip ───────────────────────────────────────── */}
      {status && (
        <div className="mb-6 rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
            <span className="inline-flex items-center gap-2 font-medium text-gray-900 dark:text-white">
              <span
                className={`inline-block h-2.5 w-2.5 rounded-full ${
                  paused ? "bg-gray-400" : "bg-green-500"
                }`}
                aria-hidden="true"
              />
              {paused ? COPY.paused : COPY.running}
            </span>
            <span className="text-gray-500 dark:text-gray-400">
              {COPY.lastCycle}: {formatDateTime(status.status.lastCycleAt)}
            </span>
            <span className="text-gray-500 dark:text-gray-400">
              {COPY.nextCycle}: {formatDateTime(status.status.nextCycleAt)}
            </span>
            <span className="text-gray-500 dark:text-gray-400">
              {COPY.enabledLanguages}:{" "}
              {status.status.enabledLanguages.map((l) => l.toUpperCase()).join(" / ")}
            </span>
          </div>

          {status.lastRun?.status === "FAILED" && status.lastRun.error && (
            <p className="mt-3 rounded-lg bg-red-50 p-2 text-xs text-red-700 dark:bg-red-900/20 dark:text-red-400">
              Last cycle failed: {status.lastRun.error}
            </p>
          )}
        </div>
      )}

      {/* ─── Tabs ───────────────────────────────────────────────── */}
      <nav aria-label="News network sections" className="mb-4 flex flex-wrap gap-2">
        {(Object.keys(COPY.tabs) as Tab[]).map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            aria-current={tab === key ? "page" : undefined}
            className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${
              tab === key
                ? "bg-zrp-red text-white"
                : "border border-gray-300 text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-700"
            }`}
          >
            {COPY.tabs[key]}
          </button>
        ))}
      </nav>

      {/* ─── Overview ───────────────────────────────────────────── */}
      {tab === "overview" && status && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            <StatTile
              label={COPY.activeFeeds}
              value={`${status.feeds.enabled} / ${roster?.defined ?? status.feeds.total}`}
            />
            <StatTile label={COPY.publicationsToday} value={status.publications.today} />
            <StatTile label={COPY.travelToday} value={status.publications.travelToday} />
            <StatTile label={COPY.scheduled} value={status.publications.scheduled} />
            <StatTile label={COPY.readyStories} value={status.stories.ready} />
            <StatTile label={COPY.duplicatesPrevented} value={status.duplicatesPreventedToday} />
            <StatTile label={COPY.failedJobs} value={status.publications.failed} tone="alert" />
            <StatTile label={COPY.failedRenditions} value={status.renditions.failedToday} tone="alert" />
            <StatTile
              label={COPY.awaitingReview}
              value={status.stories.pendingSensitiveReview}
              tone="alert"
            />
          </div>

          <section>
            <h2 className="mb-2 text-sm font-semibold text-gray-900 dark:text-white">
              {COPY.sourceHealth}
            </h2>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <StatTile label={COPY.healthy} value={status.sourceHealth.HEALTHY} />
              <StatTile label={COPY.warning} value={status.sourceHealth.WARNING} />
              <StatTile label={COPY.failed} value={status.sourceHealth.FAILED} tone="alert" />
              <StatTile label={COPY.disabled} value={status.sourceHealth.DISABLED} />
            </div>
          </section>

          <section>
            <h2 className="mb-2 text-sm font-semibold text-gray-900 dark:text-white">
              {COPY.languages}
            </h2>
            {status.distribution.languages.length === 0 ? (
              <p className="text-sm text-gray-500 dark:text-gray-400">{COPY.noneYet}</p>
            ) : (
              <ul className="flex flex-wrap gap-2">
                {status.distribution.languages.map((row) => (
                  <li
                    key={row.language}
                    className="rounded-md border border-gray-200 px-2.5 py-1 text-sm text-gray-700 dark:border-gray-700 dark:text-gray-200"
                  >
                    {row.language.toUpperCase()} · {row.count}
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section>
            <h2 className="mb-2 text-sm font-semibold text-gray-900 dark:text-white">
              {COPY.topics}
            </h2>
            {status.distribution.topics.length === 0 ? (
              <p className="text-sm text-gray-500 dark:text-gray-400">{COPY.noneYet}</p>
            ) : (
              <ul className="flex flex-wrap gap-2">
                {status.distribution.topics.map((row) => (
                  <li
                    key={row.topic}
                    className="rounded-md border border-gray-200 px-2.5 py-1 text-sm text-gray-700 dark:border-gray-700 dark:text-gray-200"
                  >
                    {row.topic} · {row.count}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}

      {/* ─── Feeds ──────────────────────────────────────────────── */}
      {tab === "feeds" && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={busy === "provision-pilot"}
              onClick={() =>
                act(
                  "provision-pilot",
                  "/api/admin/news-network/feeds/provision",
                  { method: "POST", body: JSON.stringify({ scope: "pilot" }) },
                  "Pilot feeds provisioned (disabled)."
                )
              }
              className="rounded-full border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50 disabled:opacity-60 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-700"
            >
              {COPY.provisionPilot}
            </button>
            <button
              type="button"
              disabled={busy === "provision-all"}
              onClick={() => {
                if (!confirm(COPY.confirmProvisionAll)) return;
                act(
                  "provision-all",
                  "/api/admin/news-network/feeds/provision",
                  { method: "POST", body: JSON.stringify({ scope: "all" }) },
                  "Full roster provisioned (all disabled)."
                );
              }}
              className="rounded-full border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50 disabled:opacity-60 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-700"
            >
              {COPY.provisionAll}
            </button>
            <p className="text-xs text-gray-500 dark:text-gray-400">{COPY.provisionNote}</p>
          </div>

          {feeds.length === 0 ? (
            <p className="rounded-xl border border-gray-200 bg-white p-6 text-sm text-gray-500 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400">
              {COPY.noFeeds}
            </p>
          ) : (
            <ul className="space-y-2">
              {feeds.map((feed) => (
                <li
                  key={feed.id}
                  className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800"
                >
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="truncate font-semibold text-gray-900 dark:text-white">
                          {feed.displayName}
                        </p>
                        {feed.isPilot && (
                          <span className="flex-shrink-0 rounded-md bg-gray-200 px-2 py-0.5 text-[11px] text-gray-700 dark:bg-gray-700 dark:text-gray-200">
                            {COPY.pilotOnly}
                          </span>
                        )}
                        {feed.enabled ? (
                          <CheckCircle2
                            className="h-4 w-4 flex-shrink-0 text-green-600"
                            aria-label="Enabled"
                          />
                        ) : null}
                      </div>
                      <Link
                        href={`/profile/${feed.user.username}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-0.5 inline-flex items-center gap-1 text-xs text-gray-600 hover:underline dark:text-gray-300"
                      >
                        <ExternalLink className="h-3 w-3" aria-hidden="true" />@{feed.user.username}
                      </Link>
                      <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                        {feed.language.toUpperCase()} · {feed.country ?? feed.region} ·{" "}
                        {feed._count.publications} {COPY.posts} · max {feed.maxPostsPerDay}/day ·{" "}
                        {feed.minMinutesBetweenPosts} min gap
                      </p>
                    </div>

                    <div className="flex flex-shrink-0 flex-wrap items-center gap-2">
                      <button
                        type="button"
                        disabled={busy === feed.id}
                        aria-busy={busy === feed.id}
                        onClick={() =>
                          act(
                            feed.id,
                            `/api/admin/news-network/feeds/${feed.id}`,
                            { method: "PATCH", body: JSON.stringify({ enabled: !feed.enabled }) },
                            feed.enabled ? "Feed disabled." : "Feed enabled."
                          )
                        }
                        className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm transition hover:bg-gray-50 disabled:opacity-60 dark:border-gray-600 dark:hover:bg-gray-700"
                      >
                        {feed.enabled ? COPY.disable : COPY.enable}
                      </button>

                      <label
                        className={`cursor-pointer rounded-lg border border-gray-300 px-3 py-1.5 text-sm transition hover:bg-gray-50 dark:border-gray-600 dark:hover:bg-gray-700 ${busy === feed.id ? "cursor-not-allowed opacity-60" : ""}`}
                        title={COPY.imageHint}
                      >
                        {COPY.setAvatar}
                        <input
                          type="file"
                          accept="image/jpeg,image/png,image/gif,image/webp"
                          disabled={busy === feed.id}
                          className="sr-only"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            e.target.value = "";
                            if (file) uploadFeedImage(feed.id, "avatarFile", file);
                          }}
                        />
                      </label>

                      <label
                        className={`cursor-pointer rounded-lg border border-gray-300 px-3 py-1.5 text-sm transition hover:bg-gray-50 dark:border-gray-600 dark:hover:bg-gray-700 ${busy === feed.id ? "cursor-not-allowed opacity-60" : ""}`}
                        title={COPY.imageHint}
                      >
                        {COPY.setCover}
                        <input
                          type="file"
                          accept="image/jpeg,image/png,image/gif,image/webp"
                          disabled={busy === feed.id}
                          className="sr-only"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            e.target.value = "";
                            if (file) uploadFeedImage(feed.id, "coverFile", file);
                          }}
                        />
                      </label>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* ─── Sources ────────────────────────────────────────────── */}
      {tab === "sources" && (
        <div className="space-y-4">
          <button
            type="button"
            disabled={busy === "seed"}
            onClick={() =>
              act(
                "seed",
                "/api/admin/news-network/sources/seed",
                { method: "POST" },
                "Starter sources installed. Verify each one before enabling automation."
              )
            }
            className="rounded-full border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50 disabled:opacity-60 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-700"
          >
            {COPY.seedSources}
          </button>

          {sources.length === 0 ? (
            <p className="rounded-xl border border-gray-200 bg-white p-6 text-sm text-gray-500 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400">
              {COPY.noSources}
            </p>
          ) : (
            <ul className="space-y-2">
              {sources.map((source) => (
                <li
                  key={source.id}
                  className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800"
                >
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="truncate font-semibold text-gray-900 dark:text-white">
                          {source.name}
                        </p>
                        <SourceStatusPill status={source.status} />
                        <span className="text-[11px] text-gray-500 dark:text-gray-400">
                          tier {source.trustTier}
                        </span>
                      </div>
                      <p className="mt-0.5 break-all text-xs text-gray-500 dark:text-gray-400">
                        {source.feedUrl}
                      </p>
                      <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                        {source._count.references} {COPY.sources} ingested · last success{" "}
                        {formatDateTime(source.lastSuccessAt)}
                      </p>
                      {source.lastError && (
                        <p className="mt-1 text-xs text-zrp-red">{source.lastError}</p>
                      )}
                    </div>

                    <div className="flex flex-shrink-0 flex-wrap gap-2">
                      <button
                        type="button"
                        disabled={busy === `verify-${source.id}`}
                        aria-busy={busy === `verify-${source.id}`}
                        onClick={async () => {
                          setBusy(`verify-${source.id}`);
                          setMessage(null);
                          try {
                            const res = await fetch(
                              `/api/admin/news-network/sources/${source.id}/verify`,
                              { method: "POST" }
                            );
                            const data = await res.json();
                            if (data.ok) {
                              notify(
                                "success",
                                `${source.name}: ${data.itemCount} items parsed, robots.txt ${
                                  data.robotsAllowed ? "allows" : "disallows"
                                } this feed.`
                              );
                            } else {
                              notify("error", `${source.name}: ${data.error ?? "verification failed"}`);
                            }
                          } catch {
                            notify("error", "Verification failed.");
                          } finally {
                            setBusy(null);
                          }
                        }}
                        className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm transition hover:bg-gray-50 disabled:opacity-60 dark:border-gray-600 dark:hover:bg-gray-700"
                      >
                        {COPY.verify}
                      </button>

                      {source.backoffUntil && (
                        <button
                          type="button"
                          disabled={busy === source.id}
                          onClick={() =>
                            act(
                              source.id,
                              `/api/admin/news-network/sources/${source.id}`,
                              { method: "PATCH", body: JSON.stringify({ clearBackoff: true }) },
                              "Backoff cleared."
                            )
                          }
                          className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm transition hover:bg-gray-50 disabled:opacity-60 dark:border-gray-600 dark:hover:bg-gray-700"
                        >
                          {COPY.clearBackoff}
                        </button>
                      )}

                      <button
                        type="button"
                        disabled={busy === `images-${source.id}`}
                        aria-busy={busy === `images-${source.id}`}
                        title="Only enable once you've confirmed this publisher's terms allow reusing its images."
                        onClick={() =>
                          act(
                            `images-${source.id}`,
                            `/api/admin/news-network/sources/${source.id}`,
                            { method: "PATCH", body: JSON.stringify({ allowImages: !source.allowImages }) },
                            source.allowImages ? "Images blocked for this source." : "Images allowed for this source."
                          )
                        }
                        className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm transition hover:bg-gray-50 disabled:opacity-60 dark:border-gray-600 dark:hover:bg-gray-700"
                      >
                        {source.allowImages ? COPY.blockImages : COPY.allowImages}
                      </button>

                      <button
                        type="button"
                        disabled={busy === source.id}
                        onClick={() =>
                          act(
                            source.id,
                            `/api/admin/news-network/sources/${source.id}`,
                            { method: "PATCH", body: JSON.stringify({ enabled: !source.enabled }) },
                            source.enabled ? "Source disabled." : "Source enabled."
                          )
                        }
                        className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm transition hover:bg-gray-50 disabled:opacity-60 dark:border-gray-600 dark:hover:bg-gray-700"
                      >
                        {source.enabled ? COPY.disable : COPY.enable}
                      </button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* ─── Editorial queue ────────────────────────────────────── */}
      {tab === "queue" && (
        <div className="space-y-3">
          {stories.length === 0 ? (
            <p className="rounded-xl border border-gray-200 bg-white p-6 text-sm text-gray-500 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400">
              {COPY.noStories}
            </p>
          ) : (
            stories.map((story) => (
              <article
                key={story.id}
                className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="min-w-0 flex-1 truncate font-semibold text-gray-900 dark:text-white">
                    {story.title}
                  </h3>
                  <span className="flex-shrink-0 text-xs text-gray-500 dark:text-gray-400">
                    {story.status} · {story.confidence} · score {story.importance.toFixed(2)}
                  </span>
                </div>

                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  {story.topic} · {story.country ?? story.region} · {story.sourceCount}{" "}
                  {COPY.sources}
                  {story.sensitive ? " · sensitive (human review required)" : ""}
                  {story.isBreaking ? " · breaking" : ""}
                  {story.isTravel ? " · travel" : ""}
                </p>

                <ul className="mt-2 space-y-1">
                  {story.references.map((reference) => (
                    <li key={reference.id} className="truncate text-xs">
                      <a
                        href={reference.url}
                        target="_blank"
                        rel="noopener noreferrer nofollow"
                        className="text-gray-600 hover:underline dark:text-gray-300"
                      >
                        {reference.source.publisher}: {reference.title}
                      </a>
                    </li>
                  ))}
                </ul>

                {story.renditions.length > 0 && (
                  <ul className="mt-2 space-y-1">
                    {story.renditions.map((rendition) => (
                      <li key={rendition.id} className="text-xs">
                        <span className="font-medium text-gray-700 dark:text-gray-200">
                          {rendition.language.toUpperCase()}
                        </span>{" "}
                        <span
                          className={
                            rendition.status === "READY"
                              ? "text-gray-600 dark:text-gray-300"
                              : "text-zrp-red"
                          }
                        >
                          {rendition.status === "READY"
                            ? rendition.headline
                            : rendition.error ?? rendition.status}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}

                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={busy === story.id}
                    onClick={() => {
                      const reason = prompt(COPY.rejectPrompt);
                      if (!reason) return;
                      act(
                        story.id,
                        `/api/admin/news-network/stories/${story.id}`,
                        { method: "PATCH", body: JSON.stringify({ action: "reject", reason }) },
                        "Story rejected."
                      );
                    }}
                    className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm transition hover:bg-gray-50 disabled:opacity-60 dark:border-gray-600 dark:hover:bg-gray-700"
                  >
                    {COPY.reject}
                  </button>
                  <button
                    type="button"
                    disabled={busy === story.id}
                    onClick={() => {
                      const note = prompt(COPY.correctPrompt);
                      if (!note) return;
                      act(
                        story.id,
                        `/api/admin/news-network/stories/${story.id}`,
                        { method: "PATCH", body: JSON.stringify({ action: "correct", note }) },
                        "Correction published."
                      );
                    }}
                    className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm transition hover:bg-gray-50 disabled:opacity-60 dark:border-gray-600 dark:hover:bg-gray-700"
                  >
                    {COPY.correct}
                  </button>
                </div>
              </article>
            ))
          )}
        </div>
      )}

      {/* ─── Publications ───────────────────────────────────────── */}
      {tab === "publications" && (
        <div className="space-y-2">
          {publications.length === 0 ? (
            <p className="rounded-xl border border-gray-200 bg-white p-6 text-sm text-gray-500 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400">
              {COPY.noPublications}
            </p>
          ) : (
            publications.map((publication) => (
              <div
                key={publication.id}
                className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800"
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <p className="truncate font-medium text-gray-900 dark:text-white">
                      {publication.rendition.headline || publication.story.title}
                    </p>
                    <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                      {publication.feed.displayName} · {publication.language.toUpperCase()} ·{" "}
                      {publication.status} ·{" "}
                      {formatDateTime(publication.publishedAt ?? publication.scheduledFor)}
                    </p>
                    {publication.story.correctionNote && (
                      <p className="mt-1 text-xs text-gray-700 dark:text-gray-200">
                        Correction: {publication.story.correctionNote}
                      </p>
                    )}
                    {publication.error && (
                      <p className="mt-1 text-xs text-zrp-red">{publication.error}</p>
                    )}
                  </div>

                  <div className="flex flex-shrink-0 gap-2">
                    {publication.postId && (
                      <Link
                        href={`/post/${publication.postId}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 rounded-lg border border-gray-300 px-3 py-1.5 text-sm transition hover:bg-gray-50 dark:border-gray-600 dark:hover:bg-gray-700"
                      >
                        <ExternalLink className="h-4 w-4" aria-hidden="true" />
                        View
                      </Link>
                    )}
                    {publication.status === "PUBLISHED" && (
                      <button
                        type="button"
                        disabled={busy === publication.id}
                        onClick={() => {
                          const reason = prompt(COPY.removePrompt);
                          if (!reason) return;
                          act(
                            publication.id,
                            `/api/admin/news-network/publications/${publication.id}`,
                            { method: "DELETE", body: JSON.stringify({ reason }) },
                            "Post removed."
                          );
                        }}
                        className="inline-flex items-center gap-1 rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-zrp-red transition hover:bg-gray-50 disabled:opacity-60 dark:border-gray-600 dark:hover:bg-gray-700"
                      >
                        <Trash2 className="h-4 w-4" aria-hidden="true" />
                        {COPY.remove}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
