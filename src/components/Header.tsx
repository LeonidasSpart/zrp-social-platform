"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import { signOut, useSession } from "next-auth/react";
import { Home, Compass, Search, MessageSquare, Bell, User, Sun, Moon, Menu, X, LayoutDashboard, Bookmark, LogOut } from "lucide-react";
import { useTheme } from "@/contexts/ThemeContext";

export default function Header() {
  const { data: session } = useSession();
  const { theme, toggleTheme } = useTheme();
  const [unreadCount, setUnreadCount] = useState(0);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const isAuthenticated = !!session;

  useEffect(() => {
    if (isAuthenticated) {
      fetchUnreadCount();
    }
  }, [isAuthenticated]);

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

  useEffect(() => {
    if (isAuthenticated) {
      const interval = setInterval(fetchUnreadCount, 30000);
      return () => clearInterval(interval);
    }
  }, [isAuthenticated]);

  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth >= 768) {
        setMobileMenuOpen(false);
      }
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // ─── Public nav links ──────────────────────────────────────────────
  const publicNavLinks = [
    { href: "/", icon: Home, label: "Home" },
    { href: "/about", icon: null, label: "About" },
    { href: "/login", icon: null, label: "Login" },
    { href: "/signup", icon: null, label: "Sign Up" },
  ];

  // ─── Authenticated nav links ──────────────────────────────────────
  const authNavLinks = [
    { href: "/", icon: Home, label: "Home" },
    { href: "/explore", icon: Compass, label: "Explore" },
    { href: "/search", icon: Search, label: "Search" },
    { href: "/messages", icon: MessageSquare, label: "Messages" },
    { href: "/notifications", icon: Bell, label: "Notifications", badge: unreadCount },
    { href: "/bookmarks", icon: Bookmark, label: "Bookmarks" },
    { href: `/profile/${session?.user?.username}`, icon: User, label: "Profile" },
  ];

  const navLinks = isAuthenticated ? authNavLinks : publicNavLinks;

  // ─── Handle logout ──────────────────────────────────────────────────
  const handleLogout = async () => {
    await signOut({ callbackUrl: "/login" });
  };

  return (
    <>
      <header className="border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 sticky top-0 z-50">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center justify-between">
          {/* ─── Logo ─── */}
          <Link href="/" className="flex-shrink-0">
            <Image
              src="/logo.png"
              alt="ZRP"
              width={90}
              height={90}
              className="w-10 h-10 object-contain"
            />
          </Link>

          <nav className="hidden md:flex items-center gap-4">
            {navLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="relative text-gray-500 dark:text-gray-400 hover:text-zrp-red dark:hover:text-zrp-red transition"
                title={link.label}
              >
                {link.icon && <link.icon className="w-5 h-5" />}
                {link.badge !== undefined && link.badge > 0 && (
                  <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full w-4 h-4 flex items-center justify-center">
                    {link.badge > 9 ? "9+" : link.badge}
                  </span>
                )}
              </Link>
            ))}
            {isAuthenticated && session?.user?.isAdmin && (
              <Link
                href="/admin"
                className="text-gray-500 dark:text-gray-400 hover:text-zrp-red dark:hover:text-zrp-red transition"
                title="Admin Dashboard"
              >
                <LayoutDashboard className="w-5 h-5" />
              </Link>
            )}
            <button
              onClick={toggleTheme}
              className="text-gray-500 dark:text-gray-400 hover:text-zrp-red dark:hover:text-zrp-red transition"
              title={theme === "light" ? "Dark mode" : "Light mode"}
            >
              {theme === "light" ? <Moon className="w-5 h-5" /> : <Sun className="w-5 h-5" />}
            </button>

            {/* ─── LOGOUT ────────────────────────────────────────────── */}
            {isAuthenticated && (
              <button
                onClick={handleLogout}
                className="text-gray-500 dark:text-gray-400 hover:text-red-500 dark:hover:text-red-500 transition"
                title="Sign out"
              >
                <LogOut className="w-5 h-5" />
              </button>
            )}
          </nav>

          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="md:hidden text-gray-500 dark:text-gray-400 hover:text-zrp-red dark:hover:text-zrp-red transition"
          >
            {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
        </div>
      </header>

      {/* ─── Mobile Menu ─── */}
      {mobileMenuOpen && (
        <div className="md:hidden fixed inset-x-0 top-[57px] bottom-0 bg-white dark:bg-gray-900 z-40 px-4 py-6 border-t border-gray-200 dark:border-gray-800 overflow-y-auto">
          <nav className="flex flex-col gap-2">
            {navLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setMobileMenuOpen(false)}
                className="flex items-center gap-3 p-3 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition text-gray-700 dark:text-gray-300"
              >
                {link.icon && <link.icon className="w-5 h-5" />}
                <span>{link.label}</span>
                {link.badge !== undefined && link.badge > 0 && (
                  <span className="bg-red-500 text-white text-xs rounded-full px-2 py-0.5 ml-auto">
                    {link.badge > 9 ? "9+" : link.badge}
                  </span>
                )}
              </Link>
            ))}
            {isAuthenticated && session?.user?.isAdmin && (
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
              onClick={() => { toggleTheme(); setMobileMenuOpen(false); }}
              className="flex items-center gap-3 p-3 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition text-gray-700 dark:text-gray-300"
            >
              {theme === "light" ? <Moon className="w-5 h-5" /> : <Sun className="w-5 h-5" />}
              <span>{theme === "light" ? "Dark Mode" : "Light Mode"}</span>
            </button>

            {/* ─── LOGOUT (mobile) ──────────────────────────────────── */}
            {isAuthenticated && (
              <button
                onClick={() => {
                  handleLogout();
                  setMobileMenuOpen(false);
                }}
                className="flex items-center gap-3 p-3 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 transition text-red-600 dark:text-red-400"
              >
                <LogOut className="w-5 h-5" />
                <span>Sign Out</span>
              </button>
            )}
          </nav>
        </div>
      )}
    </>
  );
}
