"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Key, Plus, Trash2, Copy, Check, Loader2, X, ExternalLink, Code } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";

// ─── Types ────────────────────────────────────────────────────────────
interface ApiKey {
  id: string;
  name: string;
  lastUsed: string | null;
  expiresAt: string | null;
  createdAt: string;
  revoked: boolean;
}

interface Notification {
  type: "success" | "error" | "info";
  title: string;
  description?: string;
}

// ─── Inline components ──────────────────────────────────────────────

interface ButtonProps {
  children: React.ReactNode;
  onClick?: () => void;
  variant?: "default" | "outline" | "destructive" | "ghost";
  disabled?: boolean;
  className?: string;
}

const Button = ({ children, onClick, variant = "default", disabled, className = "" }: ButtonProps) => {
  const base =
    "inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zrp-red disabled:opacity-50 disabled:pointer-events-none px-4 py-2";
  const variants = {
    default: "bg-zrp-red text-white hover:bg-zrp-darkRed",
    outline: "border border-gray-300 bg-transparent hover:bg-gray-100 dark:hover:bg-gray-800",
    destructive: "bg-red-600 text-white hover:bg-red-700",
    ghost: "hover:bg-gray-100 dark:hover:bg-gray-800",
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

interface BadgeProps {
  children: React.ReactNode;
  className?: string;
}

const Badge = ({ children, className = "" }: BadgeProps) => (
  <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${className}`}>
    {children}
  </span>
);

// ─── Main component ──────────────────────────────────────────────────

export default function ApiKeysPage() {
  const { data: session } = useSession();
  const router = useRouter();
  const { t, language } = useLanguage();

  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [keyName, setKeyName] = useState("");
  const [expiresIn, setExpiresIn] = useState<number>(365);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [newKey, setNewKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [notification, setNotification] = useState<Notification | null>(null);

  const localeMap: Record<string, string> = { en: "en-US", fr: "fr-FR", de: "de-DE", it: "it-IT" };

  const showToast = (notif: Notification) => {
    setNotification(notif);
    setTimeout(() => setNotification(null), 5000);
  };

  // ─── Check permission ────────────────────────────────────────────
  useEffect(() => {
    if (session?.user && !session.user.features?.apiAccess) {
      showToast({
        type: "error",
        title: t("apiKeys.errUpgradeTitle"),
        description: t("apiKeys.errUpgradeApiDesc"),
      });
      router.push("/pricing?feature=api");
    }
  }, [session, router]);

  // ─── Fetch keys ──────────────────────────────────────────────────
  const fetchKeys = async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/api-keys");
      if (!res.ok) {
        if (res.status === 403) {
          showToast({
            type: "error",
            title: t("apiKeys.errUpgradeTitle"),
            description: t("apiKeys.errUpgradeBusinessDesc"),
          });
          router.push("/pricing?feature=api");
          return;
        }
        throw new Error("Failed to fetch keys");
      }
      const data = await res.json();
      setKeys(data.keys || []);
    } catch (error) {
      console.error(error);
      showToast({ type: "error", title: t("apiKeys.errTitle"), description: t("apiKeys.errLoadFailed") });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (session?.user?.features?.apiAccess) {
      fetchKeys();
    }
  }, [session]);

  // ─── Create key ──────────────────────────────────────────────────
  const handleCreateKey = async () => {
    if (!keyName.trim()) {
      showToast({ type: "error", title: t("apiKeys.errTitle"), description: t("apiKeys.errEnterName") });
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await fetch("/api/api-keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: keyName.trim(), expiresInDays: expiresIn }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to create key");

      setNewKey(data.plainKey);
      await fetchKeys();
      setShowCreateDialog(false);
      setKeyName("");
      setExpiresIn(365);
    } catch (error: any) {
      showToast({ type: "error", title: t("apiKeys.errTitle"), description: error.message });
    } finally {
      setIsSubmitting(false);
    }
  };

  // ─── Revoke key ──────────────────────────────────────────────────
  const handleRevoke = async (keyId: string) => {
    if (!confirm(t("apiKeys.errRevokeConfirm"))) return;

    try {
      const res = await fetch(`/api/api-keys/${keyId}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to revoke key");
      }
      showToast({ type: "success", title: t("apiKeys.revokedTitle"), description: t("apiKeys.revokedDesc") });
      fetchKeys();
    } catch (error: any) {
      showToast({ type: "error", title: t("apiKeys.errTitle"), description: error.message });
    }
  };

  // ─── Copy to clipboard ──────────────────────────────────────────
  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 3000);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="w-8 h-8 animate-spin text-zrp-red" />
      </div>
    );
  }

  return (
    <div className="container max-w-5xl py-8 space-y-8">
      {/* Notification */}
      {notification && (
        <div
          className={`p-4 rounded-lg border flex items-start justify-between ${
            notification.type === "success"
              ? "bg-green-50 border-green-200 text-green-800 dark:bg-green-900/20 dark:border-green-800 dark:text-green-200"
              : notification.type === "error"
              ? "bg-red-50 border-red-200 text-red-800 dark:bg-red-900/20 dark:border-red-800 dark:text-red-200"
              : "bg-blue-50 border-blue-200 text-blue-800 dark:bg-blue-900/20 dark:border-blue-800 dark:text-blue-200"
          }`}
        >
          <div>
            <div className="font-medium">{notification.title}</div>
            {notification.description && <div className="text-sm mt-1">{notification.description}</div>}
          </div>
          <button onClick={() => setNotification(null)} className="p-1 hover:bg-black/10 rounded">
            <X className="w-5 h-5" />
          </button>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">{t("apiKeys.title")}</h1>
          <p className="text-gray-500 mt-1">{t("apiKeys.subtitle")}</p>
        </div>
        <Button onClick={() => setShowCreateDialog(true)}>
          <Plus className="w-4 h-4 mr-2" /> {t("apiKeys.generateKey")}
        </Button>
      </div>

      {/* Key list */}
      <div className="border rounded-lg overflow-hidden">
        <div className="p-4 border-b bg-gray-50 dark:bg-gray-800/50">
          <h2 className="text-lg font-semibold">{t("apiKeys.yourKeys")}</h2>
          <p className="text-sm text-gray-500">{t("apiKeys.keyCount", { n: keys.length, s: keys.length !== 1 ? "s" : "" })}</p>
        </div>
        <div className="overflow-x-auto">
          {keys.length === 0 ? (
            <div className="p-8 text-center text-gray-500">
              <Key className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p>{t("apiKeys.noKeysYet")}</p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-gray-50 dark:bg-gray-800/50 border-b">
                <tr>
                  <th className="text-left p-3 font-medium">{t("apiKeys.colName")}</th>
                  <th className="text-left p-3 font-medium">{t("apiKeys.colCreated")}</th>
                  <th className="text-left p-3 font-medium">{t("apiKeys.colLastUsed")}</th>
                  <th className="text-left p-3 font-medium">{t("apiKeys.colExpires")}</th>
                  <th className="text-right p-3 font-medium">{t("apiKeys.colActions")}</th>
                </tr>
              </thead>
              <tbody>
                {keys.map((key) => (
                  <tr key={key.id} className="border-t">
                    <td className="p-3 font-medium">{key.name}</td>
                    <td className="p-3">{new Date(key.createdAt).toLocaleDateString(localeMap[language] || "en-US")}</td>
                    <td className="p-3">{key.lastUsed ? new Date(key.lastUsed).toLocaleDateString(localeMap[language] || "en-US") : t("apiKeys.never")}</td>
                    <td className="p-3">
                      {key.expiresAt ? (
                        <Badge className={new Date(key.expiresAt) < new Date() ? "bg-red-100 text-red-800" : "bg-green-100 text-green-800"}>
                          {new Date(key.expiresAt).toLocaleDateString(localeMap[language] || "en-US")}
                        </Badge>
                      ) : (
                        <Badge className="bg-gray-100 text-gray-800">{t("apiKeys.never")}</Badge>
                      )}
                    </td>
                    <td className="p-3 text-right">
                      <Button variant="ghost" onClick={() => handleRevoke(key.id)} className="text-red-600 hover:text-red-800">
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* ─── How to use section ──────────────────────────────────── */}
      <div className="border rounded-lg p-6 space-y-4">
        <div className="flex items-center gap-2">
          <Code className="w-5 h-5 text-gray-500" />
          <h2 className="text-lg font-semibold">{t("apiKeys.howToUse")}</h2>
        </div>
        <p className="text-sm text-gray-600 dark:text-gray-400">
          {t("apiKeys.howToUseDesc")}
        </p>

        <div className="bg-gray-900 rounded-lg p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-gray-400 font-mono">{t("apiKeys.exampleCurl")}</span>
            <button
              onClick={() => {
                const example = `curl -H "Authorization: Bearer YOUR_API_KEY" \\\n  https://${window.location.host}/api/external/me`;
                copyToClipboard(example);
              }}
              className="text-xs text-gray-400 hover:text-white transition flex items-center gap-1"
            >
              {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
              {copied ? t("apiKeys.copied") : t("apiKeys.copy")}
            </button>
          </div>
          <pre className="text-xs text-green-400 font-mono whitespace-pre-wrap break-all">
{`curl -H "Authorization: Bearer YOUR_API_KEY" \\
  https://${window.location.host}/api/external/me`}
          </pre>
        </div>

        <div className="bg-zrp-red/5 dark:bg-zrp-red/10 border border-zrp-red/20 dark:border-zrp-red/30 rounded-lg p-4">
          <h4 className="text-sm font-medium text-zrp-red dark:text-zrp-red">{t("apiKeys.availableEndpoints")}</h4>
          <ul className="mt-2 text-xs space-y-1 text-gray-700 dark:text-gray-300">
            <li><code className="bg-zrp-red/10 dark:bg-zrp-red/20 px-1.5 py-0.5 rounded">GET /api/external/me</code>: {t("apiKeys.endpointMe")}</li>
            <li><code className="bg-zrp-red/10 dark:bg-zrp-red/20 px-1.5 py-0.5 rounded">GET /api/external/me/posts</code>: {t("apiKeys.endpointPosts")}</li>
          </ul>
          <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
            {t("apiKeys.moreEndpoints")}
          </p>
        </div>

        <div className="text-xs text-gray-500">
          <p>
            <strong>{t("apiKeys.security")}</strong> {t("apiKeys.securityDesc")}
          </p>
          <p className="mt-1">
            <strong>{t("apiKeys.rateLimiting")}</strong> {t("apiKeys.rateLimitingDesc")}
          </p>
        </div>
      </div>

      {/* Plan Info */}
      <div className="border rounded-lg p-6">
        <h2 className="text-lg font-semibold">{t("apiKeys.accessPlan")}</h2>
        <p className="text-sm text-gray-500">{t("apiKeys.accessPlanDesc")}</p>
        <div className="mt-4 flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-800/30 rounded-lg">
          <div>
            <p className="font-medium">{t("apiKeys.currentPlan")}</p>
            <p className="text-sm text-gray-500 capitalize">{session?.user?.plan || "Free"}</p>
          </div>
          <Badge className={session?.user?.features?.apiAccess ? "bg-green-500 text-white" : "bg-red-500 text-white"}>
            {session?.user?.features?.apiAccess ? t("apiKeys.accessEnabled") : t("apiKeys.upgradeRequired")}
          </Badge>
        </div>
        {!session?.user?.features?.apiAccess && (
          <Button onClick={() => router.push("/pricing")} className="w-full mt-4">
            {t("apiKeys.upgradeButton")}
          </Button>
        )}
      </div>

      {/* ─── Create Key Dialog ───────────────────────────────────── */}
      {showCreateDialog && (
        <div className="fixed inset-0 flex items-center justify-center bg-black/50 z-50">
          <div className="bg-white dark:bg-gray-900 rounded-lg p-6 max-w-md w-full shadow-xl">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-xl font-bold">{t("apiKeys.generateDialogTitle")}</h3>
              <button onClick={() => setShowCreateDialog(false)} className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">{t("apiKeys.keyName")}</label>
                <Input
                  value={keyName}
                  onChange={(e) => setKeyName(e.target.value)}
                  placeholder={t("apiKeys.keyNamePlaceholder")}
                  disabled={isSubmitting}
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">{t("apiKeys.expiresIn")}</label>
                <select
                  value={expiresIn}
                  onChange={(e) => setExpiresIn(Number(e.target.value))}
                  disabled={isSubmitting}
                  className="flex h-10 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm ring-offset-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zrp-red focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700 dark:bg-gray-800"
                >
                  <option value={30}>{t("apiKeys.days30")}</option>
                  <option value={90}>{t("apiKeys.days90")}</option>
                  <option value={365}>{t("apiKeys.days365")}</option>
                  <option value={0}>{t("apiKeys.neverExpires")}</option>
                </select>
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-6">
              <Button variant="outline" onClick={() => setShowCreateDialog(false)} disabled={isSubmitting}>
                {t("apiKeys.cancel")}
              </Button>
              <Button onClick={handleCreateKey} disabled={isSubmitting}>
                {isSubmitting ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> {t("apiKeys.generating")}</> : t("apiKeys.generate")}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ─── New Key Display Dialog ──────────────────────────────── */}
      {newKey && (
        <div className="fixed inset-0 flex items-center justify-center bg-black/50 z-50">
          <div className="bg-white dark:bg-gray-900 rounded-lg p-6 max-w-md w-full shadow-xl">
            <h3 className="text-xl font-bold text-green-600">{t("apiKeys.keyGenerated")}</h3>
            <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
              {t("apiKeys.copyNowWarning")}
            </p>
            <div className="mt-4 p-3 bg-gray-100 dark:bg-gray-800 rounded-lg flex items-center justify-between">
              <code className="text-sm font-mono break-all">{newKey}</code>
              <button
                onClick={() => copyToClipboard(newKey)}
                className="p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded"
              >
                {copied ? <Check className="w-5 h-5 text-green-600" /> : <Copy className="w-5 h-5" />}
              </button>
            </div>

            {/* ─── Quick usage example ──────────────────────────────── */}
            <div className="mt-4 p-3 bg-gray-900 rounded-lg">
              <p className="text-xs text-gray-400 mb-1">{t("apiKeys.tryItNow")}</p>
              <pre className="text-xs text-green-400 font-mono whitespace-pre-wrap break-all">
{`curl -H "Authorization: Bearer ${newKey}" \\
  https://${window.location.host}/api/external/me`}
              </pre>
            </div>

            <div className="flex justify-end mt-4">
              <Button onClick={() => setNewKey(null)}>{t("apiKeys.done")}</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
