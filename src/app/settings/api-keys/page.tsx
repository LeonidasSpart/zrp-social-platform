"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Key, Plus, Trash2, Copy, Check, Loader2, X } from "lucide-react";

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

// ─── Inline components with proper types ────────────────────────────

interface ButtonProps {
  children: React.ReactNode;
  onClick?: () => void;
  variant?: "default" | "outline" | "destructive" | "ghost";
  disabled?: boolean;
  className?: string;
}

const Button = ({ children, onClick, variant = "default", disabled, className = "" }: ButtonProps) => {
  const base =
    "inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 disabled:opacity-50 disabled:pointer-events-none px-4 py-2";
  const variants = {
    default: "bg-red-600 text-white hover:bg-red-700",
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
    className={`flex h-10 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm ring-offset-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700 dark:bg-gray-800 ${className}`}
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

  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [keyName, setKeyName] = useState("");
  const [expiresIn, setExpiresIn] = useState<number>(365);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [newKey, setNewKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [notification, setNotification] = useState<Notification | null>(null);

  const showToast = (notif: Notification) => {
    setNotification(notif);
    setTimeout(() => setNotification(null), 5000);
  };

  // ─── Check permission ────────────────────────────────────────────
  useEffect(() => {
    if (session?.user && !session.user.features?.apiAccess) {
      showToast({
        type: "error",
        title: "Upgrade Required",
        description: "API access is available on Business and Enterprise plans.",
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
            title: "Upgrade Required",
            description: "API access requires a Business or Enterprise plan.",
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
      showToast({ type: "error", title: "Error", description: "Failed to load API keys." });
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
      showToast({ type: "error", title: "Error", description: "Please enter a key name." });
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
      showToast({ type: "error", title: "Error", description: error.message });
    } finally {
      setIsSubmitting(false);
    }
  };

  // ─── Revoke key ──────────────────────────────────────────────────
  const handleRevoke = async (keyId: string) => {
    if (!confirm("Are you sure you want to revoke this API key? It will stop working immediately.")) return;

    try {
      const res = await fetch(`/api/api-keys/${keyId}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to revoke key");
      }
      showToast({ type: "success", title: "Revoked", description: "API key has been revoked." });
      fetchKeys();
    } catch (error: any) {
      showToast({ type: "error", title: "Error", description: error.message });
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
        <Loader2 className="w-8 h-8 animate-spin text-red-600" />
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
          <h1 className="text-3xl font-bold">API Keys</h1>
          <p className="text-gray-500 mt-1">Manage your API keys for programmatic access.</p>
        </div>
        <Button onClick={() => setShowCreateDialog(true)}>
          <Plus className="w-4 h-4 mr-2" /> Generate Key
        </Button>
      </div>

      {/* Key list */}
      <div className="border rounded-lg overflow-hidden">
        <div className="p-4 border-b bg-gray-50 dark:bg-gray-800/50">
          <h2 className="text-lg font-semibold">Your API Keys</h2>
          <p className="text-sm text-gray-500">{keys.length} key{keys.length !== 1 ? "s" : ""}</p>
        </div>
        <div className="overflow-x-auto">
          {keys.length === 0 ? (
            <div className="p-8 text-center text-gray-500">
              <Key className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p>No API keys yet. Generate your first key to get started.</p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-gray-50 dark:bg-gray-800/50 border-b">
                <tr>
                  <th className="text-left p-3 font-medium">Name</th>
                  <th className="text-left p-3 font-medium">Created</th>
                  <th className="text-left p-3 font-medium">Last Used</th>
                  <th className="text-left p-3 font-medium">Expires</th>
                  <th className="text-right p-3 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {keys.map((key) => (
                  <tr key={key.id} className="border-t">
                    <td className="p-3 font-medium">{key.name}</td>
                    <td className="p-3">{new Date(key.createdAt).toLocaleDateString()}</td>
                    <td className="p-3">{key.lastUsed ? new Date(key.lastUsed).toLocaleDateString() : "Never"}</td>
                    <td className="p-3">
                      {key.expiresAt ? (
                        <Badge className={new Date(key.expiresAt) < new Date() ? "bg-red-100 text-red-800" : "bg-green-100 text-green-800"}>
                          {new Date(key.expiresAt).toLocaleDateString()}
                        </Badge>
                      ) : (
                        <Badge className="bg-gray-100 text-gray-800">Never</Badge>
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

      {/* Create Key Dialog */}
      {showCreateDialog && (
        <div className="fixed inset-0 flex items-center justify-center bg-black/50 z-50">
          <div className="bg-white dark:bg-gray-900 rounded-lg p-6 max-w-md w-full shadow-xl">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-xl font-bold">Generate API Key</h3>
              <button onClick={() => setShowCreateDialog(false)} className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">Key Name</label>
                <Input
                  value={keyName}
                  onChange={(e) => setKeyName(e.target.value)}
                  placeholder="e.g., Production, Development"
                  disabled={isSubmitting}
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Expires In (days)</label>
                <select
                  value={expiresIn}
                  onChange={(e) => setExpiresIn(Number(e.target.value))}
                  disabled={isSubmitting}
                  className="flex h-10 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm ring-offset-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700 dark:bg-gray-800"
                >
                  <option value={30}>30 days</option>
                  <option value={90}>90 days</option>
                  <option value={365}>365 days</option>
                  <option value={0}>Never expires</option>
                </select>
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-6">
              <Button variant="outline" onClick={() => setShowCreateDialog(false)} disabled={isSubmitting}>
                Cancel
              </Button>
              <Button onClick={handleCreateKey} disabled={isSubmitting}>
                {isSubmitting ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Generating...</> : "Generate"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* New Key Display Dialog */}
      {newKey && (
        <div className="fixed inset-0 flex items-center justify-center bg-black/50 z-50">
          <div className="bg-white dark:bg-gray-900 rounded-lg p-6 max-w-md w-full shadow-xl">
            <h3 className="text-xl font-bold text-green-600">API Key Generated</h3>
            <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
              Copy this key now. It will not be shown again.
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
            <div className="flex justify-end mt-6">
              <Button onClick={() => setNewKey(null)}>Done</Button>
            </div>
          </div>
        </div>
      )}

      {/* Plan Info */}
      <div className="border rounded-lg p-6">
        <h2 className="text-lg font-semibold">API Access Plan</h2>
        <p className="text-sm text-gray-500">Your current plan determines API access capabilities.</p>
        <div className="mt-4 flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-800/30 rounded-lg">
          <div>
            <p className="font-medium">Current Plan</p>
            <p className="text-sm text-gray-500 capitalize">{session?.user?.plan || "Free"}</p>
          </div>
          <Badge className={session?.user?.features?.apiAccess ? "bg-green-500 text-white" : "bg-red-500 text-white"}>
            {session?.user?.features?.apiAccess ? "API Access Enabled" : "Upgrade Required"}
          </Badge>
        </div>
        {!session?.user?.features?.apiAccess && (
          <Button onClick={() => router.push("/pricing")} className="w-full mt-4">
            Upgrade to Business or Enterprise
          </Button>
        )}
        <div className="mt-4 text-xs text-gray-500 space-y-1">
          <p>API keys allow you to interact with ZRP programmatically.</p>
          <p>Each key can be named and optionally expires.</p>
          <p>Keys are hashed and stored securely.</p>
        </div>
      </div>
    </div>
  );
}
