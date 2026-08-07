"use client";

import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Heart, MessageCircle, Repeat, UserPlus } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";

interface Notification {
  id: string;
  type: "like" | "comment" | "follow" | "repost";
  read: boolean;
  createdAt: string;
  fromUser: {
    id: string;
    username: string;
    name: string;
    avatarUrl?: string;
  };
  post?: {
    id: string;
    content: string;
  };
}

export default function NotificationsPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const { t } = useLanguage();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);

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
    try {
      const res = await fetch("/api/notifications");
      const data = await res.json();
      setNotifications(data);
    } catch (error) {
      console.error("Error fetching notifications:", error);
    } finally {
      setLoading(false);
    }
  };

  const markAsRead = async () => {
    try {
      await fetch("/api/notifications", { method: "PUT" });
    } catch (error) {
      console.error("Error marking notifications read:", error);
    }
  };

  useEffect(() => {
    if (notifications.some((n) => !n.read)) {
      markAsRead();
    }
  }, [notifications]);

  const getIcon = (type: string) => {
    switch (type) {
      case "like":
        return <Heart className="w-4 h-4 text-red-500 fill-red-500" />;
      case "comment":
        return <MessageCircle className="w-4 h-4 text-blue-500" />;
      case "follow":
        return <UserPlus className="w-4 h-4 text-green-500" />;
      case "repost":
        return <Repeat className="w-4 h-4 text-green-500" />;
      default:
        return null;
    }
  };

  const getMessage = (notification: Notification) => {
    const name = notification.fromUser.name || notification.fromUser.username;
    switch (notification.type) {
      case "like":
        return t("notifications.likedPost", { name });
      case "comment":
        return t("notifications.commentedPost", { name });
      case "follow":
        return t("notifications.startedFollowing", { name });
      case "repost":
        return t("notifications.repostedPost", { name });
      default:
        return "";
    }
  };

  const timeAgo = (date: string) => {
    const diff = Date.now() - new Date(date).getTime();
    const minutes = Math.floor(diff / 60000);
    if (minutes < 1) return t("notifications.justNow");
    if (minutes < 60) return `${minutes}m`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h`;
    const days = Math.floor(hours / 24);
    return `${days}d`;
  };

  if (status === "loading" || loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-gray-500">{t("action.loading")}</div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto py-4 px-4">
      <h1 className="text-2xl font-bold text-gray-900 mb-4">{t("notifications.title")}</h1>

      {notifications.length === 0 ? (
        <div className="bg-white dark:bg-zrp-deepBlack rounded-lg shadow-sm p-8 border border-gray-200 text-center">
          <p className="text-gray-500">{t("notifications.empty")}</p>
          <p className="text-sm text-gray-400 mt-1">{t("notifications.emptyDesc")}</p>
        </div>
      ) : (
        <div className="space-y-2">
          {notifications.map((notification) => (
            <div
              key={notification.id}
              className={`bg-white dark:bg-zrp-deepBlack rounded-lg shadow-sm p-4 border transition ${
                notification.read ? "border-gray-200" : "border-blue-200 bg-blue-50/30"
              }`}
            >
              <Link
                href={
                  notification.post
                    ? `/post/${notification.post.id}`
                    : `/profile/${notification.fromUser.username}`
                }
                className="flex items-start gap-3"
              >
                <div className="w-10 h-10 rounded-full bg-gray-200 flex items-center justify-center flex-shrink-0">
                  {notification.fromUser.avatarUrl ? (
                    <img
                      src={notification.fromUser.avatarUrl}
                      alt=""
                      className="w-full h-full rounded-full object-cover"
                    />
                  ) : (
                    <span className="text-gray-600 font-semibold">
                      {notification.fromUser.name?.[0] || "?"}
                    </span>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    {getIcon(notification.type)}
                    <p className="text-sm text-gray-800">
                      {getMessage(notification)}
                    </p>
                  </div>
                  {notification.post && (
                    <p className="text-xs text-gray-400 mt-1 truncate">
                      "{notification.post.content.substring(0, 60)}..."
                    </p>
                  )}
                  <p className="text-xs text-gray-400 mt-1">
                    {timeAgo(notification.createdAt)}
                  </p>
                </div>
                {!notification.read && (
                  <div className="w-2 h-2 rounded-full bg-blue-500 flex-shrink-0 mt-2" />
                )}
              </Link>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
