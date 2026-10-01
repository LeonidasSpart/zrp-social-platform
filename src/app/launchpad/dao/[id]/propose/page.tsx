"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { Loader2 } from "lucide-react";

export default function ProposeToDaoPage() {
  const params = useParams<{ id: string }>();
  const { data: session, status } = useSession();
  const router = useRouter();

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!title.trim() || title.trim().length > 120) {
      setError("Title is required (max 120 characters).");
      return;
    }
    if (!description.trim() || description.trim().length > 5000) {
      setError("Description is required (max 5000 characters).");
      return;
    }

    setSubmitting(true);
    try {
      const response = await fetch(`/api/launchpad/dao/${params.id}/proposals`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: title.trim(), description: description.trim() }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.error || "Failed to open proposal.");
      router.push(`/launchpad/dao/proposals/${data.proposal.id}`);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to open proposal.");
    } finally {
      setSubmitting(false);
    }
  };

  if (status === "loading") {
    return (
      <div className="flex justify-center py-24">
        <Loader2 className="w-8 h-8 animate-spin text-zrp-red" />
      </div>
    );
  }
  if (!session?.user) {
    return (
      <div className="max-w-md mx-auto px-4 py-16 text-center">
        <p className="text-gray-600 dark:text-gray-400">Sign in and link a verified Solana wallet to open a proposal.</p>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-extrabold font-orbitron text-gray-900 dark:text-white mb-1">New proposal</h1>
      <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
        Your verified wallet must hold at least this DAO&apos;s proposal threshold in governance tokens.
      </p>

      <form onSubmit={handleSubmit} className="space-y-5">
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">Title</label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={120}
            disabled={submitting}
            className="flex h-10 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-white"
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">Description</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            maxLength={5000}
            rows={8}
            disabled={submitting}
            className="flex w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-white"
          />
        </div>

        {error && <div className="rounded-md bg-red-50 p-3 text-sm text-red-600 dark:bg-red-950/30 dark:text-red-400">{error}</div>}

        <button
          type="submit"
          disabled={submitting}
          className="w-full inline-flex items-center justify-center rounded-md bg-red-600 px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-red-700 disabled:opacity-50"
        >
          {submitting ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Submitting...
            </>
          ) : (
            "Open proposal"
          )}
        </button>
      </form>
    </div>
  );
}
