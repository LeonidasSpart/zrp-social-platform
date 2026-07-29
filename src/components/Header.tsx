"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { Bell, Home, Search, User, MessageSquare, Compass } from "lucide-react";

export default function Header() {
  const { data: session } = useSession();
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    if (session) {
      fetchUnreadCount();
    }
  }, [session]);

  const fetchUnreadCount = async () => {
    try {
      const res = await fetch("/api/notifications/unread");
      if (res.ok) {
        const data = await res.json();
        setUnreadCount(data.count);
      }
    } catch (error) {
      console.error("Error fetching unread count:", error);
    }
  };

  // Poll every 30 seconds
  useEffect(() => {
    const interval = setInterval(fetchUnreadCount, 30000);
    return () => clearInterval(interval);
  }, [session]);

  if (!session) return null;

  return (
    <header className="border-b border-gray-200 bg-white sticky top-0 z-40">
      <div className="max-w-2xl mx-auto px-4 py-3 flex items-center justify-between">
        <Link href="/" className="text-xl font-bold text-blue-600">
          ZRP Social
        </Link>
        <nav className="flex items-center gap-4">
          <Link href="/" className="text-gray-500 hover:text-blue-600 transition">
            <Home className="w-5 h-5" />
          </Link>
          <Link href="/explore" className="text-gray-500 hover:text-blue-600 transition">
            <Compass className="w-5 h-5" />
          </Link>
          <Link href="/search" className="text-gray-500 hover:text-blue-600 transition">
            <Search className="w-5 h-5" />
          </Link>
          <Link href="/notifications" className="relative text-gray-500 hover:text-blue-600 transition">
            <Bell className="w-5 h-5" />
            {unreadCount > 0 && (
              <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full w-4 h-4 flex items-center justify-center">
                {unreadCount > 9 ? "9+" : unreadCount}
              </span>
            )}
          </Link>
          <Link href={`/profile/${session.user?.username}`} className="text-gray-500 hover:text-blue-600 transition">
            <User className="w-5 h-5" />
          </Link>
        </nav>
      </div>
    </header>
  );
}
