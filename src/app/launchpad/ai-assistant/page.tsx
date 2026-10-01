"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";
import { Sparkles, Loader2, Copy, Check } from "lucide-react";

export default function AiTokenAssistantPage() {
  const { data: session, status } = useSession();
  const [theme, setTheme] = useState("");
  const [suggestion, setSuggestion] = useState<string | null>(null);
  const [remaining, setRemaining] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuggestion(null);
    if (!theme.trim()) return;
    setLoading(true);
    try {
      const res = await fetch("/api/launchpad/ai/describe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ theme: theme.trim() }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || "Failed to generate a suggestion.");
      setSuggestion(data.suggestion);
      setRemaining(data.remaining ?? null);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to generate a suggestion.");
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = async () => {
    if (!suggestion) return;
    try {
      await navigator.clipboard.writeText(suggestion);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard access can fail silently - the text is still visible.
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
        <p className="text-gray-600 dark:text-gray-400">Sign in to use the AI token assistant.</p>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <div className="flex items-center gap-2 mb-1">
        <Sparkles className="w-6 h-6 text-zrp-red" />
        <h1 className="text-2xl font-extrabold font-orbitron text-gray-900 dark:text-white">AI token assistant</h1>
      </div>
      <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
        Describe your token&apos;s theme and get a name, ticker, and one-line description to start from. Text only - shares your daily AI
        message quota with ZRP AI chat.
      </p>

      <form onSubmit={handleGenerate} className="space-y-4">
        <textarea
          value={theme}
          onChange={(e) => setTheme(e.target.value)}
          placeholder="e.g. a community token for indie game developers"
          maxLength={300}
          rows={3}
          disabled={loading}
          className="flex w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-white"
        />

        {error && <div className="rounded-md bg-red-50 p-3 text-sm text-red-600 dark:bg-red-950/30 dark:text-red-400">{error}</div>}

        <button
          type="submit"
          disabled={loading}
          className="w-full inline-flex items-center justify-center rounded-md bg-red-600 px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-red-700 disabled:opacity-50"
        >
          {loading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Generating...
            </>
          ) : (
            "Generate suggestion"
          )}
        </button>
      </form>

      {suggestion && (
        <div className="mt-6 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
          <div className="flex items-start justify-between gap-2">
            <pre className="whitespace-pre-wrap text-sm text-gray-900 dark:text-white font-sans">{suggestion}</pre>
            <button type="button" onClick={handleCopy} className="flex-shrink-0 text-gray-400 hover:text-zrp-red transition">
              {copied ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
            </button>
          </div>
          {remaining !== null && <p className="mt-2 text-xs text-gray-400 dark:text-gray-500">{remaining} AI messages left today.</p>}
        </div>
      )}
    </div>
  );
}
