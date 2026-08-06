"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { Check, X, Loader2, ExternalLink } from "lucide-react";

// ─── Inline components ──────────────────────────────────────────────
const Button = ({
  children,
  onClick,
  variant = "default",
  disabled,
  className = "",
}: {
  children: React.ReactNode;
  onClick?: () => void;
  variant?: "default" | "outline" | "destructive";
  disabled?: boolean;
  className?: string;
}) => {
  const base =
    "inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 disabled:opacity-50 disabled:pointer-events-none px-4 py-2";
  const variants = {
    default: "bg-red-600 text-white hover:bg-red-700",
    outline: "border border-gray-300 bg-transparent hover:bg-gray-100 dark:hover:bg-gray-800",
    destructive: "bg-red-600 text-white hover:bg-red-700",
  };
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`${base} ${variants[variant] || variants.default} ${className}`}
    >
      {children}
    </button>
  );
};

const Input = ({
  value,
  onChange,
  placeholder,
  disabled,
  className = "",
}: {
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}) => (
  <input
    type="text"
    value={value}
    onChange={onChange}
    placeholder={placeholder}
    disabled={disabled}
    className={`flex h-10 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm ring-offset-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700 dark:bg-gray-800 ${className}`}
  />
);

interface CustomUrlSettingsProps {
  currentUsername: string;
  currentCustomUrl: string | null;
  onUpdate: () => void;
}

export default function CustomUrlSettings({
  currentUsername,
  currentCustomUrl,
  onUpdate,
}: CustomUrlSettingsProps) {
  const { data: session, update } = useSession();
  const [customUrl, setCustomUrl] = useState(currentCustomUrl || "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const features = session?.user?.features;
  const canUseCustomUrl = features?.customProfileUrl ?? false;

  useEffect(() => {
    setCustomUrl(currentCustomUrl || "");
  }, [currentCustomUrl]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    const trimmed = customUrl.trim().toLowerCase();
    if (!trimmed) {
      setError("Custom URL cannot be empty.");
      return;
    }

    // Validate: only alphanumeric, underscore, hyphen
    if (!/^[a-z0-9_-]+$/.test(trimmed)) {
      setError("Only letters, numbers, underscores, and hyphens are allowed.");
      return;
    }

    if (trimmed.length < 3) {
      setError("Must be at least 3 characters.");
      return;
    }

    if (trimmed.length > 30) {
      setError("Must be less than 30 characters.");
      return;
    }

    if (trimmed === currentUsername.toLowerCase()) {
      setError("This is already your username. Choose a different custom URL.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/user/custom-url", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ customUrl: trimmed }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to update custom URL");
      }

      setSuccess(`Your custom URL is now /@${trimmed}`);
      // Update session to reflect new custom URL
      await update();
      onUpdate();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleRemove = async () => {
    if (!confirm("Remove your custom URL? Your profile will revert to your username.")) return;

    setLoading(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch("/api/user/custom-url", {
        method: "DELETE",
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to remove custom URL");
      }

      setCustomUrl("");
      setSuccess("Custom URL removed.");
      await update();
      onUpdate();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  if (!canUseCustomUrl) {
    return (
      <div className="p-4 bg-gray-50 dark:bg-gray-800/30 rounded-lg border border-gray-200 dark:border-gray-700">
        <p className="text-sm text-gray-600 dark:text-gray-400">
          Custom profile URLs are available on <strong>Pro</strong>, <strong>Business</strong>, and <strong>Enterprise</strong> plans.
        </p>
        <Button
          onClick={() => window.location.href = "/pricing"}
          className="mt-2"
        >
          Upgrade to get custom URL
        </Button>
      </div>
    );
  }

  const currentUrl = currentCustomUrl
    ? `${window.location.origin}/@${currentCustomUrl}`
    : `${window.location.origin}/${currentUsername}`;

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-lg font-semibold">Custom Profile URL</h3>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Set a custom URL for your profile. It will replace your username in the profile link.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-500 dark:text-gray-400 whitespace-nowrap">
            {window.location.origin}/@
          </span>
          <Input
            value={customUrl}
            onChange={(e) => setCustomUrl(e.target.value)}
            placeholder="your-custom-url"
            disabled={loading}
            className="flex-1"
          />
        </div>

        {error && (
          <div className="text-red-500 text-sm flex items-center gap-1">
            <X className="w-4 h-4" /> {error}
          </div>
        )}
        {success && (
          <div className="text-green-500 text-sm flex items-center gap-1">
            <Check className="w-4 h-4" /> {success}
          </div>
        )}

        <div className="flex items-center gap-3">
          <Button type="submit" disabled={loading || customUrl === currentCustomUrl}>
            {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
            {loading ? "Saving..." : "Save"}
          </Button>
          {currentCustomUrl && (
            <Button
              type="button"
              variant="destructive"
              onClick={handleRemove}
              disabled={loading}
            >
              Remove
            </Button>
          )}
          <a
            href={currentUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1"
          >
            View profile <ExternalLink className="w-3 h-3" />
          </a>
        </div>
      </form>

      {currentCustomUrl && (
        <div className="text-xs text-gray-500 dark:text-gray-400">
          Current URL: <a href={currentUrl} className="text-blue-600 dark:text-blue-400 hover:underline">{currentUrl}</a>
        </div>
      )}
    </div>
  );
}
