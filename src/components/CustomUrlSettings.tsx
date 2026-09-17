"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { Check, X, Loader2, ExternalLink } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import { localizeApiMessage } from "@/lib/api-error-i18n";

// ─── Inline components ──────────────────────────────────────────────
interface ButtonProps {
  children: React.ReactNode;
  onClick?: () => void;
  variant?: "default" | "outline" | "destructive";
  disabled?: boolean;
  className?: string;
  type?: "button" | "submit" | "reset"; // ✅ added
}

const Button = ({
  children,
  onClick,
  variant = "default",
  disabled,
  className = "",
  type = "button",
}: ButtonProps) => {
  const base =
    "inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zrp-red disabled:opacity-50 disabled:pointer-events-none px-4 py-2";
  const variants = {
    default: "bg-zrp-red text-white hover:bg-zrp-darkRed",
    outline: "border border-gray-300 bg-transparent hover:bg-gray-100 dark:hover:bg-gray-800",
    destructive: "bg-red-600 text-white hover:bg-red-700",
  };
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`${base} ${variants[variant] || variants.default} ${className}`}
    >
      {children}
    </button>
  );
};

interface InputProps {
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}

const Input = ({ value, onChange, placeholder, disabled, className = "" }: InputProps) => (
  <input
    type="text"
    value={value}
    onChange={onChange}
    placeholder={placeholder}
    disabled={disabled}
    className={`flex h-10 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm ring-offset-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zrp-red focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700 dark:bg-gray-800 ${className}`}
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
  const { t } = useLanguage();
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
      setError(t("customUrl.errEmpty"));
      return;
    }

    if (!/^[a-z0-9_-]+$/.test(trimmed)) {
      setError(t("customUrl.errInvalidChars"));
      return;
    }

    if (trimmed.length < 3) {
      setError(t("customUrl.errTooShort"));
      return;
    }

    if (trimmed.length > 30) {
      setError(t("customUrl.errTooLong"));
      return;
    }

    if (trimmed === currentUsername.toLowerCase()) {
      setError(t("customUrl.errSameAsUsername"));
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
        throw new Error(localizeApiMessage(data.error, t) || t("customUrl.errUpdateFailed"));
      }

      setSuccess(t("customUrl.successUpdated", { url: trimmed }));
      await update();
      onUpdate();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleRemove = async () => {
    if (!confirm(t("customUrl.confirmRemove"))) return;

    setLoading(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch("/api/user/custom-url", {
        method: "DELETE",
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(localizeApiMessage(data.error, t) || t("customUrl.errRemoveFailed"));
      }

      setCustomUrl("");
      setSuccess(t("customUrl.successRemoved"));
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
          {t("customUrl.upgradeNote")}
        </p>
        <Button
          onClick={() => window.location.href = "/pricing"}
          className="mt-2"
        >
          {t("customUrl.upgradeCta")}
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
        <h3 className="text-lg font-semibold">{t("customUrl.title")}</h3>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          {t("customUrl.description")}
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
            {loading ? t("settings.saving") : t("action.save")}
          </Button>
          {currentCustomUrl && (
            <Button
              type="button"
              variant="destructive"
              onClick={handleRemove}
              disabled={loading}
            >
              {t("customUrl.removeButton")}
            </Button>
          )}
          <a
            href={currentUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-zrp-red hover:underline flex items-center gap-1"
          >
            {t("customUrl.viewProfile")} <ExternalLink className="w-3 h-3" />
          </a>
        </div>
      </form>

      {currentCustomUrl && (
        <div className="text-xs text-gray-500 dark:text-gray-400">
          {t("customUrl.currentUrlLabel")} <a href={currentUrl} className="text-zrp-red hover:underline">{currentUrl}</a>
        </div>
      )}
    </div>
  );
}
