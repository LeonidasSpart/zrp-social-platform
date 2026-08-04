"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";
import { Mail, X, Loader2 } from "lucide-react";

export default function EmailVerificationBanner() {
  const { data: session, update } = useSession();
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [dismissed, setDismissed] = useState(false);

  if (!session?.user || session.user.emailVerified || dismissed) return null;

  const handleResend = async () => {
    setLoading(true);
    setMessage(null);
    try {
      const res = await fetch("/api/auth/resend-verification", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: session.user.email }),
      });
      const data = await res.json();
      if (res.ok) {
        setMessage({ type: "success", text: "Verification email sent! Check your inbox." });
        await update();
      } else {
        setMessage({ type: "error", text: data.error || "Failed to send email." });
      }
    } catch (error) {
      setMessage({ type: "error", text: "Something went wrong. Please try again." });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4 mb-4 flex items-start justify-between gap-3">
      <div className="flex items-start gap-3">
        <Mail className="w-5 h-5 text-yellow-600 dark:text-yellow-400 flex-shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-medium text-yellow-800 dark:text-yellow-300">
            Verify your email address
          </p>
          <p className="text-sm text-yellow-700 dark:text-yellow-400">
            Please verify your email to unlock all features.{" "}
            <button
              onClick={handleResend}
              disabled={loading}
              className="underline font-medium hover:text-yellow-900 dark:hover:text-yellow-200 disabled:opacity-50"
            >
              {loading ? "Sending..." : "Resend verification email"}
            </button>
          </p>
          {message && (
            <p className={`text-sm mt-1 ${
              message.type === "success" ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"
            }`}>
              {message.text}
            </p>
          )}
        </div>
      </div>
      <button
        onClick={() => setDismissed(true)}
        className="text-yellow-600 dark:text-yellow-400 hover:text-yellow-800 dark:hover:text-yellow-200 transition"
        title="Dismiss"
      >
        <X className="w-5 h-5" />
      </button>
    </div>
  );
}
