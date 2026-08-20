"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Search,
  CheckCircle2,
  XCircle,
  Ban,
  RotateCcw,
  Trash2,
  ExternalLink,
} from "lucide-react";
import VerifiedBadge from "@/components/VerifiedBadge";

type JournalistStatus = "PENDING" | "VERIFIED" | "REJECTED" | "SUSPENDED";

interface JournalistProfile {
  id: string;
  status: JournalistStatus;
  outlet: string | null;
  pitch: string | null;
  portfolioUrl: string | null;
  rejectionReason: string | null;
  suspensionReason: string | null;
  appliedAt: string;
  reviewedAt: string | null;
  user: {
    id: string;
    username: string;
    name: string | null;
    email: string;
    avatarUrl: string | null;
    badgeType: string | null;
  };
  reviewedBy: { id: string; username: string; name: string | null } | null;
}

const STATUS_TABS: Array<{ value: JournalistStatus | ""; label: string }> = [
  { value: "PENDING", label: "Pending" },
  { value: "VERIFIED", label: "Verified" },
  { value: "SUSPENDED", label: "Suspended" },
  { value: "REJECTED", label: "Rejected" },
  { value: "", label: "All" },
];

const STATUS_STYLES: Record<JournalistStatus, string> = {
  PENDING: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400",
  VERIFIED: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
  REJECTED: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
  SUSPENDED: "bg-gray-200 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
};

export default function AdminJournalistsPage() {
  const [profiles, setProfiles] = useState<JournalistProfile[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [statusTab, setStatusTab] = useState<JournalistStatus | "">("PENDING");
  const [search, setSearch] = useState("");
  const [actingOn, setActingOn] = useState<string | null>(null);

  async function load() {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (statusTab) params.set("status", statusTab);
      if (search.trim()) params.set("search", search.trim());

      const response = await fetch(`/api/admin/journalists?${params.toString()}`, { cache: "no-store" });
      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || "Failed to load journalists");
      }

      setProfiles(data.profiles || []);
      setCounts(data.counts || {});
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load journalists");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusTab]);

  async function act(userId: string, action: "approve" | "reject" | "suspend" | "restore" | "remove") {
    let reason: string | null = null;

    if (action === "reject" || action === "suspend" || action === "remove") {
      reason = window.prompt(
        action === "reject"
          ? "Reason for rejecting this application (optional):"
          : action === "suspend"
            ? "Reason for suspending this journalist (optional):"
            : "Reason for removing journalist status (optional):"
      );
      if (reason === null) return; // cancelled
    } else {
      const confirmed = window.confirm(`Are you sure you want to ${action} this journalist?`);
      if (!confirmed) return;
    }

    try {
      setActingOn(userId);
      setError(null);
      setSuccess(null);

      const response = await fetch(`/api/admin/journalists/${userId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, reason: reason || undefined }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || `Failed to ${action}`);
      }

      setSuccess(`Journalist ${action}d successfully.`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : `Failed to ${action}`);
    } finally {
      setActingOn(null);
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
        <Link
          href="/admin"
          className="mb-3 inline-flex items-center gap-2 text-sm text-gray-500 transition hover:text-red-600 dark:text-gray-400"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Admin
        </Link>

        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Journalists</h1>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              Review journalist applications and manage verification status.
            </p>
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              load();
            }}
            className="flex items-center gap-2"
          >
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search username, name, email…"
                className="rounded-lg border border-gray-300 py-2 pl-9 pr-3 text-sm dark:border-gray-700 dark:bg-gray-900 dark:text-white"
              />
            </div>
          </form>
        </div>

        {error && (
          <div className="mb-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300">
            {error}
          </div>
        )}
        {success && (
          <div className="mb-5 rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700 dark:border-green-900/50 dark:bg-green-950/30 dark:text-green-300">
            {success}
          </div>
        )}

        {/* Tabs */}
        <div className="mb-5 flex flex-wrap gap-2">
          {STATUS_TABS.map((tab) => (
            <button
              key={tab.value || "all"}
              type="button"
              onClick={() => setStatusTab(tab.value)}
              className={`rounded-full px-4 py-1.5 text-sm font-medium transition ${
                statusTab === tab.value
                  ? "bg-zrp-red text-white"
                  : "bg-white text-gray-700 hover:bg-gray-100 dark:bg-gray-900 dark:text-gray-300 dark:hover:bg-gray-800"
              }`}
            >
              {tab.label}
              {tab.value && counts[tab.value] !== undefined ? ` (${counts[tab.value]})` : ""}
            </button>
          ))}
        </div>

        {/* List */}
        <div className="rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-900">
          {loading ? (
            <p className="px-5 py-10 text-center text-sm text-gray-500 dark:text-gray-400">Loading…</p>
          ) : profiles.length === 0 ? (
            <p className="px-5 py-10 text-center text-sm text-gray-500 dark:text-gray-400">
              No journalist applications found.
            </p>
          ) : (
            <ul className="divide-y divide-gray-200 dark:divide-gray-800">
              {profiles.map((profile) => (
                <li key={profile.id} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="font-medium text-gray-900 dark:text-white">
                        {profile.user.name || profile.user.username}
                      </p>
                      <span className="text-sm text-gray-500 dark:text-gray-400">@{profile.user.username}</span>
                      {profile.user.badgeType && <VerifiedBadge badgeType={profile.user.badgeType} />}
                      <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${STATUS_STYLES[profile.status]}`}>
                        {profile.status}
                      </span>
                    </div>

                    <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{profile.user.email}</p>

                    {profile.outlet && (
                      <p className="mt-1 text-sm text-gray-700 dark:text-gray-300">
                        <span className="font-medium">Outlet:</span> {profile.outlet}
                      </p>
                    )}
                    {profile.pitch && (
                      <p className="mt-1 max-w-2xl text-sm text-gray-600 dark:text-gray-400">{profile.pitch}</p>
                    )}
                    {profile.portfolioUrl && (
                      <a
                        href={profile.portfolioUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-1 inline-flex items-center gap-1 text-sm text-zrp-red hover:underline"
                      >
                        Portfolio <ExternalLink className="h-3 w-3" />
                      </a>
                    )}
                    {profile.status === "REJECTED" && profile.rejectionReason && (
                      <p className="mt-1 text-sm text-red-600 dark:text-red-400">
                        Rejected: {profile.rejectionReason}
                      </p>
                    )}
                    {profile.status === "SUSPENDED" && profile.suspensionReason && (
                      <p className="mt-1 text-sm text-red-600 dark:text-red-400">
                        Suspended: {profile.suspensionReason}
                      </p>
                    )}
                  </div>

                  <div className="flex shrink-0 flex-wrap gap-2">
                    {profile.status === "PENDING" && (
                      <>
                        <ActionButton
                          label="Approve"
                          icon={CheckCircle2}
                          className="border-green-300 text-green-700 hover:bg-green-50 dark:border-green-800 dark:text-green-400 dark:hover:bg-green-950/30"
                          disabled={actingOn === profile.user.id}
                          onClick={() => act(profile.user.id, "approve")}
                        />
                        <ActionButton
                          label="Reject"
                          icon={XCircle}
                          className="border-red-300 text-red-700 hover:bg-red-50 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-950/30"
                          disabled={actingOn === profile.user.id}
                          onClick={() => act(profile.user.id, "reject")}
                        />
                      </>
                    )}

                    {profile.status === "VERIFIED" && (
                      <>
                        <ActionButton
                          label="Suspend"
                          icon={Ban}
                          className="border-gray-300 text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
                          disabled={actingOn === profile.user.id}
                          onClick={() => act(profile.user.id, "suspend")}
                        />
                        <ActionButton
                          label="Remove"
                          icon={Trash2}
                          className="border-red-300 text-red-700 hover:bg-red-50 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-950/30"
                          disabled={actingOn === profile.user.id}
                          onClick={() => act(profile.user.id, "remove")}
                        />
                      </>
                    )}

                    {profile.status === "SUSPENDED" && (
                      <>
                        <ActionButton
                          label="Restore"
                          icon={RotateCcw}
                          className="border-green-300 text-green-700 hover:bg-green-50 dark:border-green-800 dark:text-green-400 dark:hover:bg-green-950/30"
                          disabled={actingOn === profile.user.id}
                          onClick={() => act(profile.user.id, "restore")}
                        />
                        <ActionButton
                          label="Remove"
                          icon={Trash2}
                          className="border-red-300 text-red-700 hover:bg-red-50 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-950/30"
                          disabled={actingOn === profile.user.id}
                          onClick={() => act(profile.user.id, "remove")}
                        />
                      </>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

function ActionButton({
  label,
  icon: Icon,
  onClick,
  disabled,
  className,
}: {
  label: string;
  icon: typeof CheckCircle2;
  onClick: () => void;
  disabled: boolean;
  className: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition disabled:opacity-50 ${className}`}
    >
      <Icon className="h-3.5 w-3.5" />
      {label}
    </button>
  );
}
