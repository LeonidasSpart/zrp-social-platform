"use client";

import { useEffect, useState, FormEvent } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import {
  Newspaper,
  FileText,
  Clock,
  CheckCircle2,
  XCircle,
  Plus,
  Loader2,
  AlertTriangle,
  Ban,
} from "lucide-react";
import VerifiedBadge from "@/components/VerifiedBadge";

type JournalistStatus = "PENDING" | "VERIFIED" | "REJECTED" | "SUSPENDED";

interface Profile {
  id: string;
  status: JournalistStatus;
  outlet: string | null;
  pitch: string | null;
  portfolioUrl: string | null;
  rejectionReason: string | null;
  suspensionReason: string | null;
}

interface ArticleSummary {
  id: string;
  title: string;
  slug: string;
  status: "DRAFT" | "PENDING_REVIEW" | "PUBLISHED" | "REJECTED" | "ARCHIVED";
  category: string;
  coverImage: string | null;
  views: number;
  reviewNote: string | null;
  submittedAt: string | null;
  publishedAt: string | null;
  updatedAt: string;
}

interface Counts {
  total: number;
  draft: number;
  pendingReview: number;
  published: number;
  rejected: number;
  archived: number;
}

const STATUS_STYLES: Record<ArticleSummary["status"], string> = {
  DRAFT: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400",
  PENDING_REVIEW: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  PUBLISHED: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
  REJECTED: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
  ARCHIVED: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
};

export default function JournalistDashboardPage() {
  const { data: session, status: sessionStatus } = useSession();
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [isJournalist, setIsJournalist] = useState(false);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [counts, setCounts] = useState<Counts | null>(null);
  const [articles, setArticles] = useState<ArticleSummary[]>([]);

  const [outlet, setOutlet] = useState("");
  const [pitch, setPitch] = useState("");
  const [portfolioUrl, setPortfolioUrl] = useState("");
  const [applying, setApplying] = useState(false);
  const [applyError, setApplyError] = useState<string | null>(null);

  async function load() {
    try {
      setLoading(true);
      const response = await fetch("/api/journalist/profile", { cache: "no-store" });
      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || "Failed to load journalist dashboard");
      }

      setIsJournalist(!!data.isJournalist);
      setProfile(data.profile);
      setCounts(data.counts);
      setArticles(data.recentArticles || []);
    } catch {
      // Non-fatal — the apply form still renders.
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (sessionStatus === "loading") return;
    if (!session) {
      router.push("/login");
      return;
    }
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionStatus, session]);

  async function handleApply(event: FormEvent) {
    event.preventDefault();
    setApplyError(null);

    if (!pitch.trim()) {
      setApplyError("Tell us why you'd like to become a ZRP Journalist.");
      return;
    }

    setApplying(true);

    try {
      const response = await fetch("/api/journalist/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ outlet: outlet.trim() || null, pitch: pitch.trim(), portfolioUrl: portfolioUrl.trim() || null }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || "Failed to submit application");
      }

      await load();
    } catch (err) {
      setApplyError(err instanceof Error ? err.message : "Failed to submit application");
    } finally {
      setApplying(false);
    }
  }

  if (sessionStatus === "loading" || loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-zrp-red" />
      </div>
    );
  }

  // ─── Not (yet / anymore) a journalist: show the application form ────
  if (!isJournalist) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
        <div className="mx-auto max-w-2xl px-4 py-10 sm:px-6">
          <div className="mb-6 flex items-center gap-3">
            <div className="rounded-xl bg-zrp-red/10 p-3">
              <Newspaper className="h-6 w-6 text-zrp-red" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Become a ZRP Journalist</h1>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Apply for editorial access to publish articles on ZRP News.
              </p>
            </div>
          </div>

          {profile?.status === "REJECTED" && (
            <div className="mb-6 flex gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300">
              <AlertTriangle className="h-5 w-5 shrink-0" />
              <div>
                <p className="font-semibold">Your previous application wasn't approved</p>
                {profile.rejectionReason && <p className="mt-1">{profile.rejectionReason}</p>}
                <p className="mt-1 text-xs opacity-80">You're welcome to apply again below.</p>
              </div>
            </div>
          )}

          {applyError && (
            <div className="mb-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300">
              {applyError}
            </div>
          )}

          <form onSubmit={handleApply} className="space-y-5 rounded-2xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-800 dark:bg-gray-900">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
                Outlet / affiliation (optional)
              </label>
              <input
                type="text"
                value={outlet}
                onChange={(e) => setOutlet(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 dark:border-gray-700 dark:bg-gray-950 dark:text-white"
                placeholder="e.g. Independent, Radio Zürich…"
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
                Portfolio / clips link (optional)
              </label>
              <input
                type="url"
                value={portfolioUrl}
                onChange={(e) => setPortfolioUrl(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 dark:border-gray-700 dark:bg-gray-950 dark:text-white"
                placeholder="https://…"
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
                Why do you want to write for ZRP News?
              </label>
              <textarea
                value={pitch}
                onChange={(e) => setPitch(e.target.value)}
                rows={5}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 dark:border-gray-700 dark:bg-gray-950 dark:text-white"
                placeholder="Tell us about your background and what you'd like to cover."
              />
            </div>

            <button
              type="submit"
              disabled={applying}
              className="inline-flex items-center gap-2 rounded-lg bg-zrp-red px-5 py-3 text-sm font-semibold text-white hover:bg-zrp-darkRed disabled:opacity-60"
            >
              {applying && <Loader2 className="h-4 w-4 animate-spin" />}
              Submit application
            </button>
          </form>
        </div>
      </div>
    );
  }

  // ─── Pending application ─────────────────────────────────────────
  if (profile?.status === "PENDING") {
    return (
      <div className="flex min-h-screen items-center justify-center px-4">
        <div className="max-w-md rounded-2xl border border-gray-200 bg-white p-8 text-center shadow-sm dark:border-gray-800 dark:bg-gray-900">
          <Clock className="mx-auto mb-4 h-10 w-10 text-yellow-500" />
          <h1 className="mb-2 text-xl font-bold text-gray-900 dark:text-white">Application pending</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Your ZRP Journalist application is being reviewed. You'll get the Journalist badge and be able to
            submit articles for review once an admin approves it.
          </p>
        </div>
      </div>
    );
  }

  // ─── Suspended ──────────────────────────────────────────────────
  if (profile?.status === "SUSPENDED") {
    return (
      <div className="flex min-h-screen items-center justify-center px-4">
        <div className="max-w-md rounded-2xl border border-gray-200 bg-white p-8 text-center shadow-sm dark:border-gray-800 dark:bg-gray-900">
          <Ban className="mx-auto mb-4 h-10 w-10 text-red-500" />
          <h1 className="mb-2 text-xl font-bold text-gray-900 dark:text-white">Journalist account suspended</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {profile.suspensionReason || "Your journalist privileges have been temporarily suspended."}
          </p>
        </div>
      </div>
    );
  }

  // ─── Verified: full dashboard ───────────────────────────────────
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6 lg:px-8">
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Journalist Dashboard</h1>
            <VerifiedBadge badgeType="journalist" />
          </div>

          <Link
            href="/journalist/articles/new"
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-zrp-red px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-zrp-darkRed"
          >
            <Plus className="h-5 w-5" />
            Create News Article
          </Link>
        </div>

        {/* Stats */}
        <div className="mb-8 grid grid-cols-2 gap-4 sm:grid-cols-5">
          <StatCard label="Total Articles" value={counts?.total ?? 0} icon={FileText} color="blue" />
          <StatCard label="Drafts" value={counts?.draft ?? 0} icon={FileText} color="yellow" />
          <StatCard label="Pending Review" value={counts?.pendingReview ?? 0} icon={Clock} color="blue" />
          <StatCard label="Published" value={counts?.published ?? 0} icon={CheckCircle2} color="green" />
          <StatCard label="Rejected" value={counts?.rejected ?? 0} icon={XCircle} color="red" />
        </div>

        {/* Recent articles */}
        <div className="rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-900">
          <div className="border-b border-gray-200 px-5 py-4 dark:border-gray-800">
            <h2 className="font-semibold text-gray-900 dark:text-white">Recent Articles</h2>
          </div>

          {articles.length === 0 ? (
            <p className="px-5 py-10 text-center text-sm text-gray-500 dark:text-gray-400">
              You haven't written any articles yet.
            </p>
          ) : (
            <ul className="divide-y divide-gray-200 dark:divide-gray-800">
              {articles.map((article) => {
                const editable = article.status === "DRAFT" || article.status === "REJECTED";
                return (
                  <li key={article.id} className="flex items-center gap-4 px-5 py-4">
                    {article.coverImage ? (
                      <img src={article.coverImage} alt="" className="h-12 w-16 shrink-0 rounded-md object-cover" />
                    ) : (
                      <div className="h-12 w-16 shrink-0 rounded-md bg-gray-100 dark:bg-gray-800" />
                    )}

                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium text-gray-900 dark:text-white">{article.title}</p>
                      <div className="mt-1 flex items-center gap-2">
                        <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${STATUS_STYLES[article.status]}`}>
                          {article.status.replace("_", " ")}
                        </span>
                        {article.status === "REJECTED" && article.reviewNote && (
                          <span className="truncate text-xs text-gray-500 dark:text-gray-400">
                            {article.reviewNote}
                          </span>
                        )}
                      </div>
                    </div>

                    {editable ? (
                      <Link
                        href={`/journalist/articles/${article.id}/edit`}
                        className="shrink-0 rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
                      >
                        Edit
                      </Link>
                    ) : article.status === "PUBLISHED" ? (
                      <Link
                        href={`/news/${article.slug}`}
                        className="shrink-0 rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
                      >
                        View
                      </Link>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  icon: Icon,
  color,
}: {
  label: string;
  value: number;
  icon: typeof FileText;
  color: "blue" | "yellow" | "green" | "red";
}) {
  const colors: Record<string, string> = {
    blue: "bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400",
    yellow: "bg-yellow-100 text-yellow-600 dark:bg-yellow-900/30 dark:text-yellow-400",
    green: "bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400",
    red: "bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400",
  };

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-gray-900">
      <div className={`mb-2 inline-flex rounded-lg p-2 ${colors[color]}`}>
        <Icon className="h-4 w-4" />
      </div>
      <p className="text-xl font-bold text-gray-900 dark:text-white">{value}</p>
      <p className="text-xs text-gray-500 dark:text-gray-400">{label}</p>
    </div>
  );
}
