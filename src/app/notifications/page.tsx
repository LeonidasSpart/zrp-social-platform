"use client";

import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import { Heart, MessageCircle, Repeat, UserPlus, BadgeCheck, Loader2, Mail, Scale, Store, Bell, RefreshCw } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import EmptyState from "@/components/ui/EmptyState";
import { useUnreadCount } from "@/contexts/UnreadCountContext";
import VerifiedBadge from "@/components/VerifiedBadge";

interface FromUser {
  id: string;
  username: string;
  name: string;
  avatarUrl?: string;
  badgeType?: string | null;
}

interface Notification {
  id: string;
  type: "like" | "comment_like" | "comment" | "reply" | "follow" | "follow_request" | "repost" | "comment_repost" | "message" | "post_from_subscription";
  read: boolean;
  createdAt: string;
  fromUser: FromUser;
  post?: {
    id: string;
    content: string;
  };
  // Set only on "comment"/"reply" notifications - the exact comment or
  // reply that triggered this notification, so a tap can jump straight
  // to it instead of opening the post at the top of its comment list.
  commentId?: string | null;
}

// ─── A grouped row: one or more original notifications of the same type,
// on the same target (post, or "follow" globally), collapsed into one row ──
interface GroupedNotification {
  key: string;
  type: Notification["type"];
  users: FromUser[];
  latestDate: string;
  postId?: string;
  postContent?: string;
  // Only ever set on an ungrouped "comment"/"reply" row (see
  // GROUPABLE_TYPES below - those two types never merge into a group of
  // several people, so this always identifies one exact comment).
  commentId?: string | null;
  read: boolean;
  // Every underlying Notification.id this row represents - a click marks
  // ALL of them read (not just the group's synthetic key), since one row
  // can stand in for several real notifications once grouped.
  ids: string[];
}

const GROUPABLE_TYPES = new Set<Notification["type"]>(["like", "comment_like", "repost", "comment_repost", "follow"]);

function groupNotifications(list: Notification[]): GroupedNotification[] {
  const result: GroupedNotification[] = [];
  const indexByKey = new Map<string, number>();

  for (const n of list) {
    if (!GROUPABLE_TYPES.has(n.type)) {
      result.push({
        key: n.id,
        type: n.type,
        users: [n.fromUser],
        latestDate: n.createdAt,
        postId: n.post?.id,
        postContent: n.post?.content,
        commentId: n.commentId,
        read: n.read,
        ids: [n.id],
      });
      continue;
    }

    const groupKey = `${n.type}:${n.post?.id || "global"}`;
    const existingIndex = indexByKey.get(groupKey);
    if (existingIndex !== undefined) {
      const g = result[existingIndex];
      // Avoid double-counting the same user twice within a group
      if (!g.users.some((u) => u.id === n.fromUser.id)) {
        g.users.push(n.fromUser);
      }
      g.read = g.read && n.read;
      g.ids.push(n.id);
    } else {
      indexByKey.set(groupKey, result.length);
      result.push({
        key: groupKey,
        type: n.type,
        users: [n.fromUser],
        latestDate: n.createdAt,
        postId: n.post?.id,
        postContent: n.post?.content,
        read: n.read,
        ids: [n.id],
      });
    }
  }

  return result;
}

type FilterTab = "all" | "verified" | "follows";

export default function NotificationsPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const { t } = useLanguage();
  const { refreshUnreadCount } = useUnreadCount();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState(false);
  const [activeTab, setActiveTab] = useState<FilterTab>("all");
  const [followingBack, setFollowingBack] = useState<Record<string, "idle" | "loading" | "done">>({});

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/login");
    }
  }, [status, router]);

  useEffect(() => {
    if (status === "authenticated") {
      fetchNotifications();
    }
  }, [status]);

  const fetchNotifications = async () => {
    setFetchError(false);
    try {
      const res = await fetch("/api/notifications");
      if (!res.ok) {
        setFetchError(true);
        return;
      }
      const data = await res.json();
      setNotifications(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error("Error fetching notifications:", error);
      setFetchError(true);
    } finally {
      setLoading(false);
    }
  };

  // Explicit "Mark all as read" only - opening/loading this page must
  // NOT blindly mark everything read (confirmed bug: a useEffect here
  // used to fire this on every mount the moment any unread notification
  // existed, with no user action at all).
  const markAllAsRead = async () => {
    try {
      const res = await fetch("/api/notifications", { method: "PUT" });
      if (res.ok) {
        setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
        refreshUnreadCount();
      }
    } catch (error) {
      console.error("Error marking notifications read:", error);
    }
  };

  // Marks exactly the notifications behind one row read (a grouped row
  // can represent several underlying ids) - fired on click, in parallel,
  // fire-and-forget so navigation isn't held up waiting on it.
  const markOneRead = (ids: string[]) => {
    const unreadIds = ids.filter(
      (id) => notifications.find((n) => n.id === id)?.read === false
    );
    if (unreadIds.length === 0) return;

    setNotifications((prev) =>
      prev.map((n) => (unreadIds.includes(n.id) ? { ...n, read: true } : n))
    );
    refreshUnreadCount();

    Promise.all(
      unreadIds.map((id) =>
        fetch(`/api/notifications/${id}`, { method: "PUT" }).catch(() => {})
      )
    );
  };

  const handleFollowBack = async (username: string, userId: string) => {
    setFollowingBack((prev) => ({ ...prev, [userId]: "loading" }));
    try {
      const res = await fetch(`/api/users/${username}/follow`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "follow" }),
      });
      if (res.ok) {
        setFollowingBack((prev) => ({ ...prev, [userId]: "done" }));
      } else {
        setFollowingBack((prev) => ({ ...prev, [userId]: "idle" }));
      }
    } catch (error) {
      console.error("Follow back error:", error);
      setFollowingBack((prev) => ({ ...prev, [userId]: "idle" }));
    }
  };

  const getIcon = (type: string) => {
    switch (type) {
      case "like":
      case "comment_like":
        return <Heart className="w-4 h-4 text-red-500 fill-red-500" />;
      case "comment":
      case "reply":
        return <MessageCircle className="w-4 h-4 text-blue-500" />;
      case "follow":
      case "follow_request":
        return <UserPlus className="w-4 h-4 text-green-500" />;
      case "repost":
      case "comment_repost":
        return <Repeat className="w-4 h-4 text-green-500" />;
      case "message":
        return <Mail className="w-4 h-4 text-zrp-red" />;
      case "post_from_subscription":
        return <Bell className="w-4 h-4 text-zrp-red" />;
      case "appeal_resolved":
        return <Scale className="w-4 h-4 text-zrp-red" />;
      case "listing_approved":
      case "listing_rejected":
      case "listing_removed":
        return <Store className="w-4 h-4 text-zrp-red" />;
      default:
        return null;
    }
  };

  // ─── Action text WITHOUT the name(s), which render separately ──────
  const getActionSuffix = (type: string, count: number) => {
    const plural = count > 1;
    switch (type) {
      case "like":
        return plural ? t("notifications.likedPostSuffixPlural") : t("notifications.likedPostSuffix");
      case "comment_like":
        return t("notifications.likedCommentSuffix");
      case "comment":
        return t("notifications.commentedPostSuffix");
      case "reply":
        return t("notifications.repliedCommentSuffix");
      case "follow":
        return plural ? t("notifications.startedFollowingSuffixPlural") : t("notifications.startedFollowingSuffix");
      case "follow_request":
        return t("notifications.followRequestSuffix");
      case "repost":
        return plural ? t("notifications.repostedPostSuffixPlural") : t("notifications.repostedPostSuffix");
      case "comment_repost":
        return plural ? t("notifications.repostedCommentSuffixPlural") : t("notifications.repostedCommentSuffix");
      case "message":
        return t("notifications.sentMessageSuffix");
      case "post_from_subscription":
        return t("notifications.postedNewSuffix");
      case "appeal_resolved":
        return t("notifications.appealResolvedSuffix");
      case "listing_approved":
        return t("notifications.listingApprovedSuffix");
      case "listing_rejected":
        return t("notifications.listingRejectedSuffix");
      case "listing_removed":
        return t("notifications.listingRemovedSuffix");
      default:
        return "";
    }
  };

  const timeAgo = (date: string) => {
    const diff = Date.now() - new Date(date).getTime();
    const minutes = Math.floor(diff / 60000);
    if (minutes < 1) return t("notifications.justNow");
    if (minutes < 60) return t("time.minutesShort", { n: minutes });
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return t("time.hoursShort", { n: hours });
    const days = Math.floor(hours / 24);
    return t("time.daysShort", { n: days });
  };

  // ─── Filter first (on the flat list), then group the filtered set ────
  const filtered = useMemo(() => {
    if (activeTab === "verified") {
      return notifications.filter((n) => !!n.fromUser.badgeType);
    }
    if (activeTab === "follows") {
      return notifications.filter((n) => n.type === "follow");
    }
    return notifications;
  }, [notifications, activeTab]);

  const grouped = useMemo(() => groupNotifications(filtered), [filtered]);

  const tabs: { id: FilterTab; label: string }[] = [
    { id: "all", label: t("notifications.tabAll") },
    { id: "verified", label: t("notifications.tabVerified") },
    { id: "follows", label: t("notifications.tabFollows") },
  ];

  if (status === "loading" || loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-gray-500 dark:text-gray-400">{t("action.loading")}</div>
      </div>
    );
  }

  const hasUnread = notifications.some((n) => !n.read);

  return (
    <div className="max-w-2xl mx-auto py-4 px-4">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{t("notifications.title")}</h1>

        {hasUnread && (
          <button
            type="button"
            onClick={markAllAsRead}
            className="text-sm font-medium text-zrp-red hover:underline"
          >
            {t("notifications.markAllRead")}
          </button>
        )}
      </div>

      {/* ─── Filter tabs ─────────────────────────────────────────────── */}
      <div className="flex border-b border-gray-200 dark:border-gray-800 mb-4">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`relative flex-1 flex items-center justify-center gap-1.5 py-3 text-sm font-medium transition ${
              activeTab === tab.id
                ? "text-gray-900 dark:text-white"
                : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
            }`}
          >
            {tab.id === "verified" && <BadgeCheck className="w-4 h-4" />}
            {tab.label}
            {activeTab === tab.id && (
              <span className="absolute bottom-0 left-1/2 -translate-x-1/2 w-10 h-1 bg-zrp-red rounded-full" />
            )}
          </button>
        ))}
      </div>

      {fetchError ? (
        <div className="rounded-2xl border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 p-6 text-center">
          <p className="text-red-700 dark:text-red-400 font-semibold">
            {t("feed.tryAgain")}
          </p>
          <button
            onClick={() => {
              setLoading(true);
              fetchNotifications();
            }}
            className="mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-full bg-red-100 dark:bg-red-800 text-red-700 dark:text-red-300 text-sm font-semibold"
          >
            <RefreshCw className="w-4 h-4" />
            {t("feed.retry")}
          </button>
        </div>
      ) : grouped.length === 0 ? (
        <EmptyState
          icon={Bell}
          title={t("notifications.empty")}
          body={t("notifications.emptyDesc")}
        />
      ) : (
        <div className="space-y-2">
          {grouped.map((g) => {
            const primaryUser = g.users[0];
            const name = primaryUser.name || primaryUser.username;
            const others = g.users.length - 1;
            const followState = followingBack[primaryUser.id] || "idle";

            const linkHref = g.type === "message"
              ? `/messages/${primaryUser.username}`
              : (g.type as string) === "appeal_resolved"
                ? "/settings/appeals"
                : (g.type as string) === "listing_approved" || (g.type as string) === "listing_rejected" || (g.type as string) === "listing_removed"
                  ? "/marketplace/my-listings"
                  : g.postId
                    ? g.commentId
                      ? `/post/${g.postId}?commentId=${g.commentId}`
                      : `/post/${g.postId}`
                    : `/profile/${primaryUser.username}`;

            return (
              <div
                key={g.key}
                className={`bg-white dark:bg-zrp-deepBlack rounded-lg shadow-sm p-4 border transition ${
                  g.read
                    ? "border-gray-200 dark:border-gray-800"
                    : "border-blue-200 dark:border-blue-900 bg-blue-50/30 dark:bg-blue-900/10"
                }`}
              >
                <div className="flex items-start gap-3">
                  {/* ─── Avatar stack ───────────────────────────────── */}
                  <Link href={linkHref} onClick={() => markOneRead(g.ids)} className="flex-shrink-0">
                    {g.users.length === 1 ? (
                      <div className="w-10 h-10 rounded-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center overflow-hidden">
                        {primaryUser.avatarUrl ? (
                          <img src={primaryUser.avatarUrl} alt="" className="w-full h-full object-cover" />
                        ) : (
                          <span className="text-gray-600 dark:text-gray-300 font-semibold">
                            {name?.[0] || "?"}
                          </span>
                        )}
                      </div>
                    ) : (
                      <div className="flex -space-x-3">
                        {g.users.slice(0, 3).map((u, i) => (
                          <div
                            key={u.id}
                            className="w-9 h-9 rounded-full bg-gray-200 dark:bg-gray-700 border-2 border-white dark:border-zrp-deepBlack flex items-center justify-center overflow-hidden"
                            style={{ zIndex: 3 - i }}
                          >
                            {u.avatarUrl ? (
                              <img src={u.avatarUrl} alt="" className="w-full h-full object-cover" />
                            ) : (
                              <span className="text-gray-600 dark:text-gray-300 text-xs font-semibold">
                                {(u.name || u.username)?.[0] || "?"}
                              </span>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </Link>

                  <div className="flex-1 min-w-0">
                    <Link href={linkHref} onClick={() => markOneRead(g.ids)} className="block">
                      <div className="flex items-center gap-2 flex-wrap">
                        {getIcon(g.type)}
                        <p className="text-sm text-gray-800 dark:text-gray-200">
                          <span className="font-semibold text-gray-900 dark:text-white inline-flex items-center gap-1">
                            {name}
                            <VerifiedBadge badgeType={primaryUser.badgeType} />
                          </span>
                          {others > 0 && (
                            <span className="text-gray-500 dark:text-gray-400">
                              {" "}and {others} other{others > 1 ? "s" : ""}
                            </span>
                          )}{" "}
                          {getActionSuffix(g.type, g.users.length)}
                        </p>
                      </div>
                      {g.postContent && (
                        <p className="text-xs text-gray-400 dark:text-gray-500 mt-1 truncate">
                          "{g.postContent.substring(0, 60)}..."
                        </p>
                      )}
                      <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                        {timeAgo(g.latestDate)}
                      </p>
                    </Link>

                    {/* ─── Follow back button ─────────────────────────── */}
                    {g.type === "follow" && others === 0 && (
                      <button
                        onClick={() => handleFollowBack(primaryUser.username, primaryUser.id)}
                        disabled={followState !== "idle"}
                        className={`mt-2 inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium transition ${
                          followState === "done"
                            ? "bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300 cursor-default"
                            : "bg-zrp-red text-white hover:bg-zrp-darkRed disabled:opacity-60"
                        }`}
                      >
                        {followState === "loading" && <Loader2 className="w-3 h-3 animate-spin" />}
                        {followState === "done" ? "Following" : "Follow back"}
                      </button>
                    )}
                  </div>

                  {!g.read && (
                    <div className="w-2 h-2 rounded-full bg-blue-500 flex-shrink-0 mt-2" />
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
