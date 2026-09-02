"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Music2, ExternalLink, ShieldCheck, ShieldOff, Search } from "lucide-react";

interface AdminMusicArtist {
  id: string;
  displayName: string;
  verified: boolean;
  avatarUrl: string | null;
  createdAt: string;
  user: { id: string; username: string; name: string | null; avatarUrl: string | null; email: string | null };
  _count: { tracks: number; followers: number };
}

export default function AdminMusicPage() {
  const [artists, setArtists] = useState<AdminMusicArtist[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("all");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const fetchArtists = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ status: statusFilter, page: String(page) });
      if (q.trim()) params.set("q", q.trim());
      const res = await fetch(`/api/admin/music/artists?${params.toString()}`);
      const data = await res.json();
      setArtists(data.artists || []);
      setTotalPages(data.totalPages || 1);
    } catch (error) {
      console.error("Error fetching music artists for review:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchArtists();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, statusFilter]);

  const toggleVerified = async (id: string, verified: boolean) => {
    setBusyId(id);
    try {
      const res = await fetch(`/api/admin/music/artists/${id}/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ verified }),
      });
      if (res.ok) {
        setMessage({ type: "success", text: verified ? "Artist verified." : "Artist unverified." });
        fetchArtists();
        setTimeout(() => setMessage(null), 3000);
      } else {
        const data = await res.json();
        setMessage({ type: "error", text: data.error || "Update failed." });
      }
    } catch {
      setMessage({ type: "error", text: "Something went wrong." });
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
          <Music2 className="w-6 h-6" />
          Music Artists
        </h1>

        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  setPage(1);
                  fetchArtists();
                }
              }}
              placeholder="Search artists..."
              className="pl-8 pr-3 py-1.5 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-sm"
            />
          </div>

          <select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              setPage(1);
            }}
            className="px-3 py-1.5 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-sm"
          >
            <option value="all">All</option>
            <option value="verified">Verified</option>
            <option value="unverified">Unverified</option>
          </select>
        </div>
      </div>

      <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
        Verifying an artist here grants that account permission to publish
        tracks in Music Studio even without a Creator status. Never verify
        an artist without confirming their identity - this is the only way
        an unverified artist profile can start publishing.
      </p>

      {message && (
        <div className={`p-3 rounded-lg mb-4 ${
          message.type === "success"
            ? "bg-green-50 text-green-700 border border-green-200 dark:bg-green-900/20 dark:text-green-400 dark:border-green-800"
            : "bg-red-50 text-red-700 border border-red-200 dark:bg-red-900/20 dark:text-red-400 dark:border-red-800"
        }`}>
          {message.text}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-2 border-zrp-red border-t-transparent" />
        </div>
      ) : (
        <div className="space-y-3">
          {artists.length === 0 ? (
            <div className="text-center py-8 text-gray-500 dark:text-gray-400">No artist profiles found.</div>
          ) : (
            artists.map((artist) => (
              <div key={artist.id} className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <img
                      src={artist.avatarUrl || artist.user.avatarUrl || "/logo.png"}
                      alt=""
                      className="w-10 h-10 rounded-full object-cover flex-shrink-0"
                    />
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-semibold text-gray-900 dark:text-white truncate">{artist.displayName}</p>
                        {artist.verified && (
                          <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">
                            <ShieldCheck className="w-3 h-3" /> Verified
                          </span>
                        )}
                      </div>
                      <Link
                        href={`/profile/${artist.user.username}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-800 dark:text-indigo-400"
                      >
                        <ExternalLink className="w-3 h-3" />
                        @{artist.user.username}
                      </Link>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                        {artist._count.tracks} track{artist._count.tracks === 1 ? "" : "s"} · {artist._count.followers} follower{artist._count.followers === 1 ? "" : "s"}
                      </p>
                    </div>
                  </div>

                  <div className="flex gap-2 flex-shrink-0">
                    <Link
                      href={`/music/artists/${artist.id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 px-3 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition"
                    >
                      <ExternalLink className="w-4 h-4" />
                      View
                    </Link>
                    {artist.verified ? (
                      <button
                        disabled={busyId === artist.id}
                        onClick={() => toggleVerified(artist.id, false)}
                        className="flex items-center gap-1 px-3 py-1 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700 transition disabled:opacity-50"
                      >
                        <ShieldOff className="w-4 h-4" />
                        Unverify
                      </button>
                    ) : (
                      <button
                        disabled={busyId === artist.id}
                        onClick={() => toggleVerified(artist.id, true)}
                        className="flex items-center gap-1 px-3 py-1 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 transition disabled:opacity-50"
                      >
                        <ShieldCheck className="w-4 h-4" />
                        Verify
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex justify-center gap-2 mt-4">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
            className="px-3 py-1 border border-gray-300 dark:border-gray-600 rounded disabled:opacity-50 hover:bg-gray-50 dark:hover:bg-gray-800 transition"
          >
            Previous
          </button>
          <span className="px-3 py-1 text-sm text-gray-700 dark:text-gray-300">Page {page} of {totalPages}</span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
            className="px-3 py-1 border border-gray-300 dark:border-gray-600 rounded disabled:opacity-50 hover:bg-gray-50 dark:hover:bg-gray-800 transition"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}
