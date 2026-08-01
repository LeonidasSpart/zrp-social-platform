"use client";

import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import Link from "next/link";
import { MessageSquare, Search } from "lucide-react";

interface Conversation {
  partner: {
    id: string;
    username: string;
    name: string;
    avatarUrl?: string;
  };
  lastMessage: {
    content: string;
    createdAt: string;
    senderId: string;
  };
  unreadCount: number;
}

export default function MessagesPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/login");
    }
  }, [status, router]);

  useEffect(() => {
    if (status === "authenticated") {
      fetchConversations();
    }
  }, [status]);

  const fetchConversations = async () => {
    try {
      const res = await fetch("/api/messages");
      const data = await res.json();
      setConversations(data);
    } catch (error) {
      console.error("Error fetching conversations:", error);
    } finally {
      setLoading(false);
    }
  };

  const timeAgo = (date: string) => {
    const diff = Date.now() - new Date(date).getTime();
    const minutes = Math.floor(diff / 60000);
    if (minutes < 1) return "Just now";
    if (minutes < 60) return `${minutes}m`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h`;
    const days = Math.floor(hours / 24);
    return `${days}d`;
  };

  if (status === "loading" || loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-gray-500">Loading...</div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto py-4 px-4">
      <h1 className="text-2xl font-bold text-gray-900 mb-4">Messages</h1>

      {conversations.length === 0 ? (
        <div className="bg-white dark:bg-zrp-deepBlack rounded-lg shadow-sm p-8 border border-gray-200 text-center">
          <MessageSquare className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500">No conversations yet</p>
          <p className="text-sm text-gray-400 mt-1">Start a conversation by visiting someone's profile</p>
        </div>
      ) : (
        <div className="space-y-2">
          {conversations.map((conv) => (
            <Link
              key={conv.partner.id}
              href={`/messages/${conv.partner.username}`}
              className="bg-white dark:bg-zrp-deepBlack rounded-lg shadow-sm p-4 border border-gray-200 hover:bg-gray-50 transition flex items-center gap-3"
            >
              <div className="w-12 h-12 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 font-semibold flex-shrink-0">
                {conv.partner.name?.[0] || "?"}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <p className="font-semibold text-gray-900">{conv.partner.name}</p>
                  <span className="text-xs text-gray-400">{timeAgo(conv.lastMessage.createdAt)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <p className="text-sm text-gray-500 truncate">
                    {conv.lastMessage.senderId === session?.user?.id ? "You: " : ""}
                    {conv.lastMessage.content}
                  </p>
                  {conv.unreadCount > 0 && (
                    <span className="bg-blue-600 text-white text-xs rounded-full px-2 py-0.5 flex-shrink-0">
                      {conv.unreadCount}
                    </span>
                  )}
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
