"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  DollarSign, TrendingUp, Users, ShoppingBag, Wallet,
  Loader2, CheckCircle, XCircle, Clock, ArrowUpRight,
  Copy, Check, Calendar, MessageCircle, Heart, Eye
} from "lucide-react";

// ─── Inline components ──────────────────────────────────────────────
const Card = ({ children, className = "" }: { children: React.ReactNode; className?: string }) => (
  <div className={`bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6 ${className}`}>
    {children}
  </div>
);

type ColorVariant = "blue" | "green" | "purple" | "orange" | "red";

const StatCard = ({
  label,
  value,
  icon: Icon,
  color = "blue"
}: {
  label: string;
  value: number | string;
  icon: React.ElementType;
  color?: ColorVariant;
}) => {
  const colors: Record<ColorVariant, string> = {
    blue: "bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400",
    green: "bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400",
    purple: "bg-purple-50 dark:bg-purple-900/20 text-purple-600 dark:text-purple-400",
    orange: "bg-orange-50 dark:bg-orange-900/20 text-orange-600 dark:text-orange-400",
    red: "bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400",
  };
  return (
    <div className="p-4 border border-gray-200 dark:border-gray-700 rounded-lg">
      <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
        <div className={`p-2 rounded-lg ${colors[color]}`}>
          <Icon className="w-4 h-4" />
        </div>
        <span>{label}</span>
      </div>
      <p className="text-2xl font-bold text-gray-900 dark:text-white mt-2">
        {typeof value === 'number' ? `$${value.toFixed(2)}` : value}
      </p>
    </div>
  );
};

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
    outline: "border border-gray-300 bg-transparent hover:bg-gray-100 dark:hover:bg-gray-700",
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
  type = "text",
  disabled,
  className = "",
}: {
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  placeholder?: string;
  type?: string;
  disabled?: boolean;
  className?: string;
}) => (
  <input
    type={type}
    value={value}
    onChange={onChange}
    placeholder={placeholder}
    disabled={disabled}
    className={`flex h-10 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm ring-offset-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700 dark:bg-gray-800 ${className}`}
  />
);

const Badge = ({ children, className = "" }: { children: React.ReactNode; className?: string }) => (
  <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${className}`}>
    {children}
  </span>
);

// ─── Main component ──────────────────────────────────────────────────
export default function CreatorDashboard() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<any>(null);
  const [stats, setStats] = useState<any>(null);
  const [recentTips, setRecentTips] = useState<any[]>([]);
  const [premiumPosts, setPremiumPosts] = useState<any[]>([]);
  const [recentPurchases, setRecentPurchases] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);

  // ─── Withdrawal states ────────────────────────────────────────────
  const [showWithdrawModal, setShowWithdrawModal] = useState(false);
  const [withdrawAmount, setWithdrawAmount] = useState("");
  const [walletAddress, setWalletAddress] = useState("");
  const [withdrawLoading, setWithdrawLoading] = useState(false);
  const [withdrawMessage, setWithdrawMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/login");
    }
  }, [status, router]);

  useEffect(() => {
    if (status === "authenticated") {
      fetchDashboard();
    }
  }, [status]);

  const fetchDashboard = async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/creator/dashboard");
      if (!res.ok) {
        if (res.status === 404) {
          setError("Creator profile not found. Please enable creator monetisation.");
        } else if (res.status === 403) {
          setError("Creator monetisation requires a Business or Enterprise plan.");
        } else {
          throw new Error("Failed to load dashboard");
        }
        return;
      }
      const data = await res.json();
      setProfile(data.profile);
      setStats(data.stats);
      setRecentTips(data.recentTips);
      setPremiumPosts(data.premiumPosts);
      setRecentPurchases(data.recentPurchases);
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Failed to load dashboard");
    } finally {
      setLoading(false);
    }
  };

  const handleWithdraw = async (e: React.FormEvent) => {
    e.preventDefault();
    const amount = parseFloat(withdrawAmount);
    if (!amount || amount <= 0) {
      setWithdrawMessage({ type: "error", text: "Please enter a valid amount." });
      return;
    }
    if (!walletAddress || walletAddress.length < 32) {
      setWithdrawMessage({ type: "error", text: "Please enter a valid Solana wallet address." });
      return;
    }
    if (amount > (profile?.balance || 0)) {
      setWithdrawMessage({ type: "error", text: "Insufficient balance." });
      return;
    }

    setWithdrawLoading(true);
    setWithdrawMessage(null);
    try {
      const res = await fetch("/api/creator/withdraw", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount, walletAddress }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to submit withdrawal");
      }
      setWithdrawMessage({ type: "success", text: data.message });
      setShowWithdrawModal(false);
      setWithdrawAmount("");
      setWalletAddress("");
      fetchDashboard();
    } catch (err: any) {
      setWithdrawMessage({ type: "error", text: err.message });
    } finally {
      setWithdrawLoading(false);
    }
  };

  const copyWalletAddress = (address: string) => {
    navigator.clipboard.writeText(address);
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

  if (error) {
    return (
      <div className="max-w-4xl mx-auto py-12 px-4 text-center">
        <div className="text-6xl mb-4">💰</div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Creator Monetisation</h1>
        <p className="text-gray-500 dark:text-gray-400 mt-2">{error}</p>
        <div className="mt-6 space-x-3">
          <Button onClick={() => router.push("/pricing")}>
            Upgrade Plan
          </Button>
          <Button variant="outline" onClick={() => router.push("/settings")}>
            Go to Settings
          </Button>
        </div>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="max-w-4xl mx-auto py-12 px-4 text-center">
        <div className="text-6xl mb-4">🚀</div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Enable Creator Monetisation</h1>
        <p className="text-gray-500 dark:text-gray-400 mt-2">
          You need to enable creator monetisation to start earning from tips and premium posts.
        </p>
        <Button
          onClick={async () => {
            try {
              await fetch("/api/creator/profile", { method: "PATCH", body: JSON.stringify({ tipsEnabled: true, premiumPostsEnabled: true }) });
              fetchDashboard();
            } catch (err) {
              console.error(err);
            }
          }}
          className="mt-4"
        >
          Enable Now
        </Button>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto py-8 px-4 space-y-8">
      {/* ─── Header ──────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Creator Dashboard</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">Manage your earnings, tips, and premium content.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => router.push("/settings")}>
            Settings
          </Button>
          <Button
            onClick={() => setShowWithdrawModal(true)}
            disabled={!profile.balance || profile.balance <= 0}
          >
            <Wallet className="w-4 h-4 mr-2" />
            Withdraw
          </Button>
        </div>
      </div>

      {/* ─── Stats Row ───────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="Balance" value={profile.balance || 0} icon={Wallet} color="green" />
        <StatCard label="Total Tips" value={profile.totalTips || 0} icon={Heart} color="red" />
        <StatCard label="Premium Revenue" value={profile.totalPremiumRevenue || 0} icon={ShoppingBag} color="purple" />
        <StatCard label="Withdrawn" value={profile.totalWithdrawn || 0} icon={TrendingUp} color="orange" />
      </div>

      {/* ─── Settings Toggle ─────────────────────────────────────────── */}
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h3 className="font-semibold text-gray-900 dark:text-white">Monetisation Settings</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400">Control how you earn from your content.</p>
          </div>
          <div className="flex flex-wrap gap-4">
            <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
              <input
                type="checkbox"
                checked={profile.tipsEnabled}
                onChange={async (e) => {
                  const res = await fetch("/api/creator/profile", {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ tipsEnabled: e.target.checked }),
                  });
                  if (res.ok) fetchDashboard();
                }}
                className="w-4 h-4 text-red-600 focus:ring-red-500"
              />
              Tips
            </label>
            <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
              <input
                type="checkbox"
                checked={profile.premiumPostsEnabled}
                onChange={async (e) => {
                  const res = await fetch("/api/creator/profile", {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ premiumPostsEnabled: e.target.checked }),
                  });
                  if (res.ok) fetchDashboard();
                }}
                className="w-4 h-4 text-red-600 focus:ring-red-500"
              />
              Premium Posts
            </label>
          </div>
        </div>
      </Card>

      {/* ─── Recent Tips ─────────────────────────────────────────────── */}
      <div>
        <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-4">Recent Tips</h2>
        {recentTips.length === 0 ? (
          <div className="text-center py-8 text-gray-500 dark:text-gray-400">No tips received yet.</div>
        ) : (
          <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 dark:bg-gray-800/50 border-b border-gray-200 dark:border-gray-700">
                <tr>
                  <th className="text-left p-3 font-medium">From</th>
                  <th className="text-left p-3 font-medium">Amount</th>
                  <th className="text-left p-3 font-medium">Message</th>
                  <th className="text-left p-3 font-medium">Date</th>
                </tr>
              </thead>
              <tbody>
                {recentTips.map((tip) => (
                  <tr key={tip.id} className="border-t border-gray-200 dark:border-gray-700">
                    <td className="p-3 flex items-center gap-2">
                      <div className="w-6 h-6 rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden">
                        {tip.sender.avatarUrl ? (
                          <img src={tip.sender.avatarUrl} alt="" className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-xs font-bold text-gray-600">
                            {(tip.sender.name || tip.sender.username)[0].toUpperCase()}
                          </div>
                        )}
                      </div>
                      <span className="font-medium text-gray-900 dark:text-white">
                        {tip.sender.name || tip.sender.username}
                      </span>
                    </td>
                    <td className="p-3 font-semibold text-green-600 dark:text-green-400">${tip.amount.toFixed(2)}</td>
                    <td className="p-3 text-gray-600 dark:text-gray-400">{tip.message || "—"}</td>
                    <td className="p-3 text-gray-500 dark:text-gray-400 text-xs">
                      {new Date(tip.createdAt).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ─── Premium Posts ───────────────────────────────────────────── */}
      <div>
        <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-4">Premium Posts</h2>
        {premiumPosts.length === 0 ? (
          <div className="text-center py-8 text-gray-500 dark:text-gray-400">
            No premium posts yet. Create a post and mark it as premium.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {premiumPosts.map((pp) => (
              <div key={pp.id} className="border border-gray-200 dark:border-gray-700 rounded-lg p-4">
                <p className="text-gray-800 dark:text-gray-200 line-clamp-2">
                  {pp.post.content}
                </p>
                <div className="flex items-center justify-between mt-3 text-sm">
                  <Badge className="bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400">
                    ${pp.price.toFixed(2)}
                  </Badge>
                  <span className="text-gray-500 dark:text-gray-400">
                    {pp.totalPurchases} purchase{pp.totalPurchases !== 1 ? "s" : ""}
                  </span>
                </div>
                <div className="mt-2 text-xs text-gray-400 dark:text-gray-500">
                  {new Date(pp.createdAt).toLocaleDateString()}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ─── Withdrawal Modal ────────────────────────────────────────── */}
      {showWithdrawModal && (
        <div className="fixed inset-0 flex items-center justify-center bg-black/50 z-50 p-4">
          <div className="bg-white dark:bg-gray-900 rounded-lg max-w-md w-full p-6 shadow-xl">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-bold text-gray-900 dark:text-white">Withdraw Funds</h2>
              <button
                onClick={() => setShowWithdrawModal(false)}
                className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded"
              >
                <XCircle className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleWithdraw} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Amount (USDC)
                </label>
                <Input
                  type="number"
                  step="0.01"
                  min="1"
                  value={withdrawAmount}
                  onChange={(e) => setWithdrawAmount(e.target.value)}
                  placeholder="Enter amount"
                  disabled={withdrawLoading}
                />
                <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                  Available balance: ${(profile?.balance || 0).toFixed(2)}
                </p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Solana Wallet Address
                </label>
                <Input
                  type="text"
                  value={walletAddress}
                  onChange={(e) => setWalletAddress(e.target.value)}
                  placeholder="Enter your Solana wallet address"
                  disabled={withdrawLoading}
                />
              </div>
              {withdrawMessage && (
                <div className={`text-sm ${withdrawMessage.type === "success" ? "text-green-600" : "text-red-600"}`}>
                  {withdrawMessage.text}
                </div>
              )}
              <div className="flex gap-3 justify-end">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setShowWithdrawModal(false)}
                  disabled={withdrawLoading}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={withdrawLoading}>
                  {withdrawLoading ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Processing...
                    </>
                  ) : (
                    "Withdraw"
                  )}
                </Button>
              </div>
              <p className="text-xs text-gray-400 dark:text-gray-500 text-center">
                Withdrawals are processed within 24-48 hours.
              </p>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
