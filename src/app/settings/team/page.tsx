"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import {
  UserPlus,
  MoreVertical,
  Shield,
  ShieldCheck,
  ShieldAlert,
  UserMinus,
  Crown,
  Loader2,
  X,
} from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";

interface TeamMember {
  id: string;
  accountId: string;
  userId: string;
  role: "ADMIN" | "EDITOR" | "VIEWER";
  createdAt: string;
  user: {
    id: string;
    username: string;
    name: string | null;
    email: string;
    avatarUrl: string | null;
    plan: string;
  };
}

interface TeamOwner {
  id: string;
  username: string;
  name: string | null;
  email: string;
  avatarUrl: string | null;
  plan: string;
  role: "OWNER";
}

// ─── Simple inline components ──────────────────────────────────────
const Badge = ({ children, className = "" }: { children: React.ReactNode; className?: string }) => (
  <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${className}`}>
    {children}
  </span>
);

const Avatar = ({ src, fallback }: { src?: string; fallback: string }) => {
  const [error, setError] = useState(false);
  return (
    <div className="h-8 w-8 rounded-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center text-xs font-medium text-gray-600 dark:text-gray-300 overflow-hidden">
      {!error && src ? (
        <img src={src} alt="avatar" className="h-full w-full object-cover" onError={() => setError(true)} />
      ) : (
        fallback
      )}
    </div>
  );
};

const Button = ({
  children,
  onClick,
  disabled,
  variant = "default",
  className = "",
  type = "button",
}: {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  variant?: "default" | "destructive" | "outline";
  className?: string;
  type?: "button" | "submit" | "reset";
}) => {
  const base =
    "inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-50 disabled:pointer-events-none ring-offset-background px-4 py-2";
  const variants = {
    default: "bg-red-600 text-white hover:bg-red-700",
    destructive: "bg-red-600 text-white hover:bg-red-700",
    outline: "border border-gray-300 bg-transparent hover:bg-gray-100 dark:hover:bg-gray-800",
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
    className={`flex h-10 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm ring-offset-white file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-gray-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700 dark:bg-gray-800 dark:ring-offset-gray-900 dark:placeholder:text-gray-400 ${className}`}
  />
);

const Select = ({
  value,
  onValueChange,
  options,
  disabled,
}: {
  value: string;
  onValueChange: (val: string) => void;
  options: { value: string; label: string }[];
  disabled?: boolean;
}) => (
  <select
    value={value}
    onChange={(e) => onValueChange(e.target.value)}
    disabled={disabled}
    className="flex h-10 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm ring-offset-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700 dark:bg-gray-800"
  >
    {options.map((opt) => (
      <option key={opt.value} value={opt.value}>
        {opt.label}
      </option>
    ))}
  </select>
);

// ─── Notification banner ──────────────────────────────────────────
interface Notification {
  type: "success" | "error" | "info";
  title: string;
  description?: string;
}

export default function TeamSettingsPage() {
  const { data: session } = useSession();
  const router = useRouter();
  const { t, language } = useLanguage();

  const [members, setMembers] = useState<TeamMember[]>([]);
  const [owner, setOwner] = useState<TeamOwner | null>(null);
  const [loading, setLoading] = useState(true);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [newMemberEmail, setNewMemberEmail] = useState("");
  const [newMemberRole, setNewMemberRole] = useState<"ADMIN" | "EDITOR" | "VIEWER">("VIEWER");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [removeTarget, setRemoveTarget] = useState<TeamMember | null>(null);
  const [showRemoveDialog, setShowRemoveDialog] = useState(false);

  const localeMap: Record<string, string> = { en: "en-US", fr: "fr-FR", de: "de-DE", it: "it-IT" };

  // ─── Notification state ──────────────────────────────────────────
  const [notification, setNotification] = useState<Notification | null>(null);

  const showToast = (notif: Notification) => {
    setNotification(notif);
    setTimeout(() => setNotification(null), 5000);
  };

  // ─── Check permission ────────────────────────────────────────────
  useEffect(() => {
    if (session?.user && !session.user.features?.teamManagement) {
      showToast({
        type: "error",
        title: t("team.upgradeRequired"),
        description: t("team.upgradeDesc"),
      });
      router.push("/pricing?feature=team");
    }
  }, [session, router]);

  // ─── Fetch team ──────────────────────────────────────────────────
  const fetchTeam = async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/team");
      if (!res.ok) {
        if (res.status === 403) {
          showToast({
            type: "error",
            title: t("team.upgradeRequired"),
            description: t("team.upgradeBusinessDesc"),
          });
          router.push("/pricing?feature=team");
          return;
        }
        throw new Error("Failed to fetch team");
      }
      const data = await res.json();
      setMembers(data.members || []);
      setOwner(data.owner || null);
    } catch (error) {
      console.error(error);
      showToast({ type: "error", title: "Error", description: t("team.errLoadFailed") });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (session?.user?.features?.teamManagement) {
      fetchTeam();
    }
  }, [session]);

  // ─── Add member ──────────────────────────────────────────────────
  const handleAddMember = async () => {
    if (!newMemberEmail) {
      showToast({ type: "error", title: "Error", description: t("team.errEnterEmail") });
      return;
    }
    setIsSubmitting(true);
    try {
      const res = await fetch("/api/team", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: newMemberEmail.trim(), role: newMemberRole }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to add member");
      showToast({ type: "success", title: t("team.memberAddedTitle"), description: t("team.memberAddedDesc", { email: data.member.user.email }) });
      setShowAddDialog(false);
      setNewMemberEmail("");
      setNewMemberRole("VIEWER");
      fetchTeam();
    } catch (error: any) {
      showToast({ type: "error", title: "Error", description: error.message });
    } finally {
      setIsSubmitting(false);
    }
  };

  // ─── Update role ─────────────────────────────────────────────────
  const handleUpdateRole = async (memberId: string, role: "ADMIN" | "EDITOR" | "VIEWER") => {
    try {
      const res = await fetch(`/api/team/${memberId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to update role");
      }
      showToast({ type: "success", title: t("team.roleUpdatedTitle"), description: t("team.roleUpdatedDesc", { role }) });
      fetchTeam();
    } catch (error: any) {
      showToast({ type: "error", title: "Error", description: error.message });
    }
  };

  // ─── Remove member ──────────────────────────────────────────────
  const handleRemoveMember = async () => {
    if (!removeTarget) return;
    try {
      const res = await fetch(`/api/team/${removeTarget.id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to remove member");
      }
      showToast({ type: "success", title: t("team.memberRemovedTitle"), description: t("team.memberRemovedDesc", { email: removeTarget.user.email }) });
      setShowRemoveDialog(false);
      setRemoveTarget(null);
      fetchTeam();
    } catch (error: any) {
      showToast({ type: "error", title: "Error", description: error.message });
    }
  };

  // ─── Helper: Role badge ──────────────────────────────────────────
  const getRoleBadge = (role: string) => {
    switch (role) {
      case "OWNER":
        return <Badge className="bg-yellow-500 text-white"><Crown className="w-3 h-3 mr-1" /> {t("team.roleOwner")}</Badge>;
      case "ADMIN":
        return <Badge className="bg-red-500 text-white"><ShieldAlert className="w-3 h-3 mr-1" /> {t("team.roleAdmin")}</Badge>;
      case "EDITOR":
        return <Badge className="bg-blue-500 text-white"><ShieldCheck className="w-3 h-3 mr-1" /> {t("team.roleEditor")}</Badge>;
      default:
        return <Badge className="bg-gray-200 text-gray-800"><Shield className="w-3 h-3 mr-1" /> {t("team.roleViewer")}</Badge>;
    }
  };

  const getInitials = (name: string | null, email: string) => {
    if (name) return name.charAt(0).toUpperCase();
    return email.charAt(0).toUpperCase();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="w-8 h-8 animate-spin text-red-600" />
      </div>
    );
  }

  return (
    <div className="container max-w-6xl py-8 space-y-8">
      {/* Notification Banner */}
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
          <button
            onClick={() => setNotification(null)}
            className="p-1 hover:bg-black/10 rounded"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">{t("team.title")}</h1>
          <p className="text-gray-500 mt-1">{t("team.subtitle")}</p>
        </div>
        <Button onClick={() => setShowAddDialog(true)}>
          <UserPlus className="w-4 h-4 mr-2" /> {t("team.addMember")}
        </Button>
      </div>

      {/* Team Members Table */}
      <div className="border rounded-lg overflow-hidden">
        <div className="p-4 border-b bg-gray-50 dark:bg-gray-800/50">
          <h2 className="text-lg font-semibold">{t("team.teamMembers")}</h2>
          <p className="text-sm text-gray-500">{t("team.memberCount", { n: members.length, s: members.length !== 1 ? "s" : "" })}</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 dark:bg-gray-800/50 border-b">
              <tr>
                <th className="text-left p-3 font-medium">{t("team.colUser")}</th>
                <th className="text-left p-3 font-medium">{t("team.colEmail")}</th>
                <th className="text-left p-3 font-medium">{t("team.colRole")}</th>
                <th className="text-left p-3 font-medium">{t("team.colJoined")}</th>
                <th className="text-right p-3 font-medium">{t("team.colActions")}</th>
              </tr>
            </thead>
            <tbody>
              {/* Owner row */}
              {owner && (
                <tr className="bg-gray-50 dark:bg-gray-800/30">
                  <td className="p-3">
                    <div className="flex items-center gap-3">
                      <Avatar src={owner.avatarUrl || undefined} fallback={getInitials(owner.name, owner.email)} />
                      <div>
                        <p className="font-medium">{owner.name || owner.username}</p>
                        <p className="text-xs text-gray-500">@{owner.username}</p>
                      </div>
                    </div>
                  </td>
                  <td className="p-3">{owner.email}</td>
                  <td className="p-3">{getRoleBadge("OWNER")}</td>
                  <td className="p-3">-</td>
                  <td className="p-3 text-right text-gray-500 text-sm">{t("team.accountOwner")}</td>
                </tr>
              )}

              {members.map((member) => (
                <tr key={member.id} className="border-t">
                  <td className="p-3">
                    <div className="flex items-center gap-3">
                      <Avatar src={member.user.avatarUrl || undefined} fallback={getInitials(member.user.name, member.user.email)} />
                      <div>
                        <p className="font-medium">{member.user.name || member.user.username}</p>
                        <p className="text-xs text-gray-500">@{member.user.username}</p>
                      </div>
                    </div>
                  </td>
                  <td className="p-3">{member.user.email}</td>
                  <td className="p-3">{getRoleBadge(member.role)}</td>
                  <td className="p-3">{new Date(member.createdAt).toLocaleDateString(localeMap[language] || "en-US")}</td>
                  <td className="p-3 text-right">
                    <div className="relative inline-block text-left">
                      <button
                        onClick={() => {
                          const dropdown = document.getElementById(`dropdown-${member.id}`);
                          if (dropdown) dropdown.classList.toggle("hidden");
                        }}
                        className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700"
                      >
                        <MoreVertical className="w-4 h-4" />
                      </button>
                      <div id={`dropdown-${member.id}`} className="hidden absolute right-0 mt-2 w-48 bg-white dark:bg-gray-800 border rounded-md shadow-lg z-10">
                        <div className="py-1">
                          <button
                            onClick={() => handleUpdateRole(member.id, "ADMIN")}
                            className="block w-full text-left px-4 py-2 text-sm hover:bg-gray-100 dark:hover:bg-gray-700"
                          >
                            {t("team.roleAdmin")}
                          </button>
                          <button
                            onClick={() => handleUpdateRole(member.id, "EDITOR")}
                            className="block w-full text-left px-4 py-2 text-sm hover:bg-gray-100 dark:hover:bg-gray-700"
                          >
                            {t("team.roleEditor")}
                          </button>
                          <button
                            onClick={() => handleUpdateRole(member.id, "VIEWER")}
                            className="block w-full text-left px-4 py-2 text-sm hover:bg-gray-100 dark:hover:bg-gray-700"
                          >
                            {t("team.roleViewer")}
                          </button>
                          <hr className="my-1" />
                          <button
                            onClick={() => {
                              setRemoveTarget(member);
                              setShowRemoveDialog(true);
                            }}
                            className="block w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-gray-100 dark:hover:bg-gray-700"
                          >
                            <UserMinus className="w-4 h-4 inline mr-2" /> {t("team.remove")}
                          </button>
                        </div>
                      </div>
                    </div>
                  </td>
                </tr>
              ))}
              {members.length === 0 && (
                <tr>
                  <td colSpan={5} className="text-center py-8 text-gray-500">{t("team.noMembers")}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Plan Info */}
      <div className="border rounded-lg p-6">
        <h2 className="text-lg font-semibold">{t("team.planInfo")}</h2>
        <p className="text-sm text-gray-500">{t("team.planInfoDesc")}</p>
        <div className="mt-4 flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-800/30 rounded-lg">
          <div>
            <p className="font-medium">{t("team.currentPlan")}</p>
            <p className="text-sm text-gray-500 capitalize">{session?.user?.plan || "Free"}</p>
          </div>
          <Badge
            className={session?.user?.features?.teamManagement ? "bg-green-500 text-white" : "bg-red-500 text-white"}
          >
            {session?.user?.features?.teamManagement ? t("team.teamEnabled") : t("team.upgradeRequired")}
          </Badge>
        </div>
        {!session?.user?.features?.teamManagement && (
          <Button onClick={() => router.push("/pricing")} className="w-full mt-4">
            {t("team.upgradeButton")}
          </Button>
        )}
        <div className="mt-4 text-xs text-gray-500 space-y-1">
          <p>{t("team.roleOwnerDesc")}</p>
          <p>{t("team.roleAdminDesc")}</p>
          <p>{t("team.roleEditorDesc")}</p>
          <p>{t("team.roleViewerDesc")}</p>
        </div>
      </div>

      {/* Add Member Dialog */}
      {showAddDialog && (
        <div className="fixed inset-0 flex items-center justify-center bg-black/50 z-50">
          <div className="bg-white dark:bg-gray-900 rounded-lg p-6 max-w-md w-full shadow-xl">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-xl font-bold">{t("team.addDialogTitle")}</h3>
              <button onClick={() => setShowAddDialog(false)} className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">{t("team.emailAddress")}</label>
                <Input
                  value={newMemberEmail}
                  onChange={(e) => setNewMemberEmail(e.target.value)}
                  placeholder={t("team.emailPlaceholder")}
                  disabled={isSubmitting}
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">{t("team.role")}</label>
                <Select
                  value={newMemberRole}
                  onValueChange={(val) => setNewMemberRole(val as "ADMIN" | "EDITOR" | "VIEWER")}
                  options={[
                    { value: "ADMIN", label: t("team.roleAdmin") },
                    { value: "EDITOR", label: t("team.roleEditor") },
                    { value: "VIEWER", label: t("team.roleViewer") },
                  ]}
                  disabled={isSubmitting}
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-6">
              <Button variant="outline" onClick={() => setShowAddDialog(false)} disabled={isSubmitting}>
                {t("team.cancel")}
              </Button>
              <Button onClick={handleAddMember} disabled={isSubmitting}>
                {isSubmitting ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> {t("team.adding")}</> : t("team.addMember")}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Remove Confirmation Dialog */}
      {showRemoveDialog && removeTarget && (
        <div className="fixed inset-0 flex items-center justify-center bg-black/50 z-50">
          <div className="bg-white dark:bg-gray-900 rounded-lg p-6 max-w-md w-full shadow-xl">
            <h3 className="text-xl font-bold">{t("team.removeDialogTitle")}</h3>
            <p className="mt-2 text-gray-600 dark:text-gray-400">
              {t("team.removeConfirm", { email: removeTarget.user.email })}
            </p>
            <div className="flex justify-end gap-2 mt-6">
              <Button variant="outline" onClick={() => setShowRemoveDialog(false)}>{t("team.cancel")}</Button>
              <Button variant="destructive" onClick={handleRemoveMember}>{t("team.remove")}</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
