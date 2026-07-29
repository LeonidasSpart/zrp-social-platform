"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { Home, Compass, Search, MessageSquare, Bell, User, Sun, Moon, Menu, X, LayoutDashboard } from "lucide-react";
import { useTheme } from "@/contexts/ThemeContext";

export default function Header() {
  const { data: session } = useSession();
  const { theme, toggleTheme } = useTheme();
  const [unreadCount, setUnreadCount] = useState(0);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

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

  // Poll for new notifications every 30 seconds
  useEffect(() => {
    const interval = setInterval(fetchUnreadCount, 30000);
    return () => clearInterval(interval);
  }, [session]);

  // Close mobile menu on resize to desktop
  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth >= 768) {
        setMobileMenuOpen(false);
      }
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  if (!session) return null;

  return (
    <>
      <header className="border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 sticky top-0 z-50">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center justify-between">
          <Link href="/" className="text-xl font-bold text-blue-600 dark:text-blue-400">
            ZRP Social
          </Link>

          {/* Desktop Navigation */}
          <nav className="hidden md:flex items-center gap-4">
            <Link href="/" className="text-gray-500 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 transition" title="Home">
              <Home className="w-5 h-5" />
            </Link>
            <Link href="/explore" className="text-gray-500 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 transition" title="Explore">
              <Compass className="w-5 h-5" />
            </Link>
            <Link href="/search" className="text-gray-500 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 transition" title="Search">
              <Search className="w-5 h-5" />
            </Link>
            <Link href="/messages" className="text-gray-500 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 transition" title="Messages">
              <MessageSquare className="w-5 h-5" />
            </Link>
            <Link href="/notifications" className="relative text-gray-500 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 transition" title="Notifications">
              <Bell className="w-5 h-5" />
              {unreadCount > 0 && (
                <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full w-4 h-4 flex items-center justify-center">
                  {unreadCount > 9 ? "9+" : unreadCount}
                </span>
              )}
            </Link>
            <Link href={`/profile/${session.user?.username}`} className="text-gray-500 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 transition" title="Profile">
              <User className="w-5 h-5" />
            </Link>
            {/* ─── Admin Link ─── */}
            {session.user?.isAdmin && (
              <Link href="/admin" className="text-gray-500 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 transition" title="Admin Dashboard">
                <LayoutDashboard className="w-5 h-5" />
              </Link>
            )}
            <button
              onClick={toggleTheme}
              className="text-gray-500 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 transition"
              title={theme === "light" ? "Dark mode" : "Light mode"}
            >
              {theme === "light" ? <Moon className="w-5 h-5" /> : <Sun className="w-5 h-5" />}
            </button>
          </nav>

          {/* Mobile Hamburger */}
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="md:hidden text-gray-500 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 transition"
          >
            {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
        </div>
      </header>

      {/* Mobile Menu Overlay */}
      {mobileMenuOpen && (
        <div className="md:hidden fixed inset-x-0 top-[57px] bottom-0 bg-white dark:bg-gray-900 z-40 px-4 py-6 border-t border-gray-200 dark:border-gray-800 overflow-y-auto">
          <nav className="flex flex-col gap-2">
            <Link
              href="/"
              onClick={() => setMobileMenuOpen(false)}
              className="flex items-center gap-3 p-3 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition text-gray-700 dark:text-gray-300"
            >
              <Home className="w-5 h-5" />
              <span>Home</span>
            </Link>
            <Link
              href="/explore"
              onClick={() => setMobileMenuOpen(false)}
              className="flex items-center gap-3 p-3 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition text-gray-700 dark:text-gray-300"
            >
              <Compass className="w-5 h-5" />
              <span>Explore</span>
            </Link>
            <Link
              href="/search"
              onClick={() => setMobileMenuOpen(false)}
              className="flex items-center gap-3 p-3 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition text-gray-700 dark:text-gray-300"
            >
              <Search className="w-5 h-5" />
              <span>Search</span>
            </Link>
            <Link
              href="/messages"
              onClick={() => setMobileMenuOpen(false)}
              className="flex items-center gap-3 p-3 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition text-gray-700 dark:text-gray-300"
            >
              <MessageSquare className="w-5 h-5" />
              <span>Messages</span>
            </Link>
            <Link
              href="/notifications"
              onClick={() => setMobileMenuOpen(false)}
              className="relative flex items-center gap-3 p-3 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition text-gray-700 dark:text-gray-300"
            >
              <Bell className="w-5 h-5" />
              <span>Notifications</span>
              {unreadCount > 0 && (
                <span className="bg-red-500 text-white text-xs rounded-full px-2 py-0.5 ml-auto">
                  {unreadCount > 9 ? "9+" : unreadCount}
                </span>
              )}
            </Link>
            <Link
              href={`/profile/${session.user?.username}`}
              onClick={() => setMobileMenuOpen(false)}
              className="flex items-center gap-3 p-3 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition text-gray-700 dark:text-gray-300"
            >
              <User className="w-5 h-5" />
              <span>Profile</span>
            </Link>
            {/* ─── Admin Link (mobile) ─── */}
            {session.user?.isAdmin && (
              <Link
                href="/admin"
                onClick={() => setMobileMenuOpen(false)}
                className="flex items-center gap-3 p-3 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition text-gray-700 dark:text-gray-300"
              >
                <LayoutDashboard className="w-5 h-5" />
                <span>Admin</span>
              </Link>
            )}
            <button
              onClick={() => {
                toggleTheme();
                setMobileMenuOpen(false);
              }}
              className="flex items-center gap-3 p-3 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition text-gray-700 dark:text-gray-300"
            >
              {theme === "light" ? <Moon className="w-5 h-5" /> : <Sun className="w-5 h-5" />}
              <span>{theme === "light" ? "Dark Mode" : "Light Mode"}</span>
            </button>
          </nav>
        </div>
      )}
    </>
  );
}
