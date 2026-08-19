"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import Image from "next/image";
import { signOut, useSession } from "next-auth/react";
import {
  Home,
  Compass,
  Search,
  MessageSquare,
  Bell,
  User,
  Sun,
  Moon,
  Menu,
  X,
  LayoutDashboard,
  Bookmark,
  LogOut,
  Film,
  Globe,
  Settings,
  Users,
  Key,
  ChevronDown,
  ChevronRight,
  PenSquare,
} from "lucide-react";
import { useTheme } from "@/contexts/ThemeContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { SUPPORTED_LANGUAGES } from "@/lib/translations";
import { getSocket } from "@/lib/socket-client";
import { useUnreadCount } from "@/contexts/UnreadCountContext";

type NavItem = {
  href: string;
  icon: React.ElementType | null;
  label: string;
  badge?: number;
};

export default function Header() {
  const { data: session } = useSession();
  const { theme, toggleTheme } = useTheme();
  const { language, setLanguage, t } = useLanguage();
  const { unreadCount, unreadMessageCount } = useUnreadCount();

  const [menuOpen, setMenuOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [langMenuOpen, setLangMenuOpen] = useState(false);

  const menuRef = useRef<HTMLDivElement>(null);

  const isAuthenticated = !!session;
  const features = session?.user?.features;

  const isStaff =
    isAuthenticated &&
    (session?.user?.isAdmin ||
      session?.user?.role === "ADMIN" ||
      session?.user?.role === "MODERATOR");

  const currentLangLabel =
    SUPPORTED_LANGUAGES.find((l) => l.code === language)?.code.toUpperCase() ||
    "EN";

  const navLinks: NavItem[] = isAuthenticated
    ? [
        {
          href: "/",
          icon: Home,
          label: t("nav.home"),
        },
        {
          href: "/shorts",
          icon: Film,
          label: "Shorts",
        },
        {
          href: "/explore",
          icon: Compass,
          label: t("nav.explore"),
        },
        {
          href: "/search",
          icon: Search,
          label: t("nav.search"),
        },
        {
          href: "/messages",
          icon: MessageSquare,
          label: t("nav.messages"),
          badge: unreadMessageCount,
        },
        {
          href: "/notifications",
          icon: Bell,
          label: t("nav.notifications"),
          badge: unreadCount,
        },
        {
          href: "/bookmarks",
          icon: Bookmark,
          label: t("nav.bookmarks"),
        },
      ]
    : [
        {
          href: "/",
          icon: Home,
          label: t("nav.home"),
        },
        {
          href: "/about",
          icon: null,
          label: t("nav.about"),
        },
        {
          href: "/login",
          icon: null,
          label: t("nav.login"),
        },
        {
          href: "/signup",
          icon: null,
          label: t("nav.signup"),
        },
      ];

  /* ────────────────────────────────────────────────────────────────
     Close menu when screen becomes desktop
  ──────────────────────────────────────────────────────────────── */

  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth >= 1024) {
        setMenuOpen(false);
        setUserMenuOpen(false);
        setLangMenuOpen(false);
      }
    };

    window.addEventListener("resize", handleResize);

    return () => window.removeEventListener("resize", handleResize);
  }, []);

  /* ────────────────────────────────────────────────────────────────
     Lock page scrolling while tablet/mobile menu is open
  ──────────────────────────────────────────────────────────────── */

  useEffect(() => {
    if (menuOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }

    return () => {
      document.body.style.overflow = "";
    };
  }, [menuOpen]);

  /* ────────────────────────────────────────────────────────────────
     Escape closes menus
  ──────────────────────────────────────────────────────────────── */

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setMenuOpen(false);
        setUserMenuOpen(false);
        setLangMenuOpen(false);
      }
    };

    document.addEventListener("keydown", handleKeyDown);

    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);

  /* ────────────────────────────────────────────────────────────────
     Close dropdown menus when clicking outside
  ──────────────────────────────────────────────────────────────── */

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        menuRef.current &&
        !menuRef.current.contains(event.target as Node)
      ) {
        setUserMenuOpen(false);
        setLangMenuOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);

    return () =>
      document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  /* ────────────────────────────────────────────────────────────────
     Socket block updates
  ──────────────────────────────────────────────────────────────── */

  useEffect(() => {
    if (!session?.user?.id) return;

    const socket = getSocket(session.user.id);

    const handleBlockUpdate = ({
      blockerId,
    }: {
      blockerId: string;
      blockedId: string;
    }) => {
      if (blockerId === session.user.id) {
        window.location.reload();
      }
    };

    socket.on("block-updated", handleBlockUpdate);

    return () => {
      socket.off("block-updated", handleBlockUpdate);
    };
  }, [session]);

  /* ────────────────────────────────────────────────────────────────
     Helpers
  ──────────────────────────────────────────────────────────────── */

  const closeMenu = () => {
    setMenuOpen(false);
    setUserMenuOpen(false);
    setLangMenuOpen(false);
  };

  const handleLogout = async () => {
    closeMenu();
    await signOut({ callbackUrl: "/login" });
  };

  const handleLanguageChange = (code: string) => {
    setLanguage(code);
    setLangMenuOpen(false);
  };

  return (
    <>
      <header
        ref={menuRef}
        className="sticky top-0 z-50 w-full border-b border-gray-200 dark:border-gray-800 bg-white/95 dark:bg-zrp-deepBlack/95 backdrop-blur-md"
      >
        <div className="w-full max-w-[1400px] mx-auto px-3 sm:px-5 lg:px-6">
          <div className="h-16 sm:h-[68px] flex items-center justify-between gap-3">
            {/* ──────────────────────────────────────────────────────
               LOGO
            ────────────────────────────────────────────────────── */}

            <Link
              href="/"
              onClick={closeMenu}
              className="flex items-center flex-shrink-0"
              aria-label="ZRP Social"
            >
              <Image
                src="/logo.png"
                alt="ZRP"
                width={52}
                height={52}
                priority
                className="w-10 h-10 sm:w-11 sm:h-11 object-contain"
              />
            </Link>

            {/* ──────────────────────────────────────────────────────
               DESKTOP CENTER AREA
               Sidebar remains the main desktop navigation.
            ────────────────────────────────────────────────────── */}

            <div className="hidden lg:flex flex-1 items-center justify-center px-8">
              <div className="text-sm text-gray-400 dark:text-gray-500">
                {isAuthenticated ? "ZRP Social" : ""}
              </div>
            </div>

            {/* ──────────────────────────────────────────────────────
               TABLET QUICK ACTIONS
               Visible 768px → 1023px
            ────────────────────────────────────────────────────── */}

            <div className="hidden md:flex lg:hidden items-center gap-1 sm:gap-2">
              {isAuthenticated && (
                <>
                  <Link
                    href="/search"
                    className="p-2.5 rounded-full text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-zrp-red transition"
                    aria-label={t("nav.search")}
                  >
                    <Search className="w-5 h-5" />
                  </Link>

                  <Link
                    href="/messages"
                    className="relative p-2.5 rounded-full text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-zrp-red transition"
                    aria-label={t("nav.messages")}
                  >
                    <MessageSquare className="w-5 h-5" />

                    {unreadMessageCount > 0 && (
                      <span className="absolute top-1 right-1 min-w-4 h-4 px-1 bg-zrp-red text-white text-[9px] font-bold rounded-full flex items-center justify-center">
                        {unreadMessageCount > 9
                          ? "9+"
                          : unreadMessageCount}
                      </span>
                    )}
                  </Link>

                  <Link
                    href="/notifications"
                    className="relative p-2.5 rounded-full text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-zrp-red transition"
                    aria-label={t("nav.notifications")}
                  >
                    <Bell className="w-5 h-5" />

                    {unreadCount > 0 && (
                      <span className="absolute top-1 right-1 min-w-4 h-4 px-1 bg-zrp-red text-white text-[9px] font-bold rounded-full flex items-center justify-center">
                        {unreadCount > 9 ? "9+" : unreadCount}
                      </span>
                    )}
                  </Link>
                </>
              )}
            </div>

            {/* ──────────────────────────────────────────────────────
               RIGHT CONTROLS
            ────────────────────────────────────────────────────── */}

            <div className="flex items-center gap-1 sm:gap-2">
              {/* Desktop language */}
              <div className="relative hidden lg:block">
                <button
                  type="button"
                  onClick={() => {
                    setLangMenuOpen(!langMenuOpen);
                    setUserMenuOpen(false);
                  }}
                  className="flex items-center gap-1.5 px-2.5 py-2 rounded-full text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-zrp-red transition"
                  aria-label={t("nav.language")}
                >
                  <Globe className="w-5 h-5" />
                  <span className="text-xs font-semibold">
                    {currentLangLabel}
                  </span>
                  <ChevronDown
                    className={`w-3.5 h-3.5 transition-transform ${
                      langMenuOpen ? "rotate-180" : ""
                    }`}
                  />
                </button>

                {langMenuOpen && (
                  <div className="absolute right-0 top-full mt-2 w-48 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-xl overflow-hidden">
                    <div className="px-4 py-2.5 border-b border-gray-200 dark:border-gray-700">
                      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
                        {t("nav.language")}
                      </p>
                    </div>

                    {SUPPORTED_LANGUAGES.map((lang) => (
                      <button
                        key={lang.code}
                        type="button"
                        onClick={() => handleLanguageChange(lang.code)}
                        className={`w-full flex items-center justify-between px-4 py-2.5 text-sm transition ${
                          language === lang.code
                            ? "bg-zrp-red/10 text-zrp-red font-semibold"
                            : "text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700"
                        }`}
                      >
                        <span>{lang.label}</span>

                        {language === lang.code && (
                          <span className="text-xs font-bold">
                            {lang.code.toUpperCase()}
                          </span>
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Desktop theme */}
              <button
                type="button"
                onClick={toggleTheme}
                className="hidden lg:flex p-2.5 rounded-full text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-zrp-red transition"
                title={
                  theme === "light"
                    ? t("nav.darkMode")
                    : t("nav.lightMode")
                }
                aria-label={
                  theme === "light"
                    ? t("nav.darkMode")
                    : t("nav.lightMode")
                }
              >
                {theme === "light" ? (
                  <Moon className="w-5 h-5" />
                ) : (
                  <Sun className="w-5 h-5" />
                )}
              </button>

              {/* Tablet / desktop profile */}
              {isAuthenticated && (
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => {
                      setUserMenuOpen(!userMenuOpen);
                      setLangMenuOpen(false);
                    }}
                    className="hidden md:flex items-center gap-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition p-1.5 pr-2.5"
                    aria-label={t("nav.profile")}
                  >
                    <div className="w-8 h-8 rounded-full overflow-hidden bg-zrp-red/10 flex items-center justify-center text-zrp-red font-semibold">
                      {session.user.avatarUrl ? (
                        <img
                          src={session.user.avatarUrl}
                          alt=""
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        session.user.name?.[0]?.toUpperCase() || "?"
                      )}
                    </div>

                    <ChevronDown
                      className={`w-4 h-4 text-gray-400 transition-transform ${
                        userMenuOpen ? "rotate-180" : ""
                      }`}
                    />
                  </button>

                  {userMenuOpen && (
                    <div className="absolute right-0 top-full mt-2 w-64 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl shadow-xl overflow-hidden">
                      {/* Profile header */}
                      <Link
                        href={`/profile/${session.user.username}`}
                        onClick={closeMenu}
                        className="flex items-center gap-3 p-4 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition"
                      >
                        <div className="w-11 h-11 rounded-full overflow-hidden bg-zrp-red/10 flex items-center justify-center text-zrp-red font-semibold flex-shrink-0">
                          {session.user.avatarUrl ? (
                            <img
                              src={session.user.avatarUrl}
                              alt=""
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            session.user.name?.[0]?.toUpperCase() || "?"
                          )}
                        </div>

                        <div className="min-w-0">
                          <p className="font-semibold text-gray-900 dark:text-white truncate">
                            {session.user.name ||
                              session.user.username}
                          </p>

                          <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                            @{session.user.username}
                          </p>
                        </div>
                      </Link>

                      <div className="border-t border-gray-200 dark:border-gray-700 py-1">
                        <Link
                          href={`/profile/${session.user.username}`}
                          onClick={closeMenu}
                          className="flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 transition"
                        >
                          <User className="w-4 h-4" />
                          {t("nav.profile")}
                        </Link>

                        <Link
                          href="/settings"
                          onClick={closeMenu}
                          className="flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 transition"
                        >
                          <Settings className="w-4 h-4" />
                          Settings
                        </Link>

                        {features?.teamManagement && (
                          <Link
                            href="/settings/team"
                            onClick={closeMenu}
                            className="flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 transition"
                          >
                            <Users className="w-4 h-4" />
                            Team Management
                          </Link>
                        )}

                        {features?.apiAccess && (
                          <Link
                            href="/settings/api-keys"
                            onClick={closeMenu}
                            className="flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 transition"
                          >
                            <Key className="w-4 h-4" />
                            API Keys
                          </Link>
                        )}

                        {isStaff && (
                          <Link
                            href="/admin"
                            onClick={closeMenu}
                            className="flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 transition"
                          >
                            <LayoutDashboard className="w-4 h-4" />
                            {t("nav.admin")}
                          </Link>
                        )}
                      </div>

                      <div className="border-t border-gray-200 dark:border-gray-700 py-1">
                        <button
                          type="button"
                          onClick={handleLogout}
                          className="flex items-center gap-3 w-full px-4 py-2.5 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition"
                        >
                          <LogOut className="w-4 h-4" />
                          {t("nav.signOut")}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Mobile / tablet menu */}
              <button
                type="button"
                onClick={() => {
                  setMenuOpen(!menuOpen);
                  setUserMenuOpen(false);
                  setLangMenuOpen(false);
                }}
                className="lg:hidden p-2.5 rounded-full text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-zrp-red transition"
                aria-label={menuOpen ? "Close menu" : "Open menu"}
                aria-expanded={menuOpen}
              >
                {menuOpen ? (
                  <X className="w-6 h-6" />
                ) : (
                  <Menu className="w-6 h-6" />
                )}
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* ═══════════════════════════════════════════════════════════
          TABLET / MOBILE ADVANCED MENU
      ═══════════════════════════════════════════════════════════ */}

      {menuOpen && (
        <div className="lg:hidden fixed inset-0 z-40 bg-black/40 backdrop-blur-[2px]">
          <div
            className="absolute inset-x-0 top-16 sm:top-[68px] bottom-0 bg-white dark:bg-zrp-deepBlack overflow-y-auto overscroll-contain"
            style={{
              paddingBottom:
                "calc(1.5rem + env(safe-area-inset-bottom))",
            }}
          >
            <div className="w-full max-w-[900px] mx-auto px-4 sm:px-6 py-5">
              {/* ──────────────────────────────────────────────────
                 Account card
              ────────────────────────────────────────────────── */}

              {isAuthenticated && (
                <Link
                  href={`/profile/${session.user.username}`}
                  onClick={closeMenu}
                  className="flex items-center gap-3 p-4 mb-5 rounded-2xl bg-gray-50 dark:bg-gray-800/70 border border-gray-200 dark:border-gray-700 hover:border-zrp-red/40 transition"
                >
                  <div className="w-12 h-12 rounded-full overflow-hidden bg-zrp-red/10 flex items-center justify-center text-zrp-red font-bold flex-shrink-0">
                    {session.user.avatarUrl ? (
                      <img
                        src={session.user.avatarUrl}
                        alt=""
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      session.user.name?.[0]?.toUpperCase() || "?"
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-gray-900 dark:text-white truncate">
                      {session.user.name || session.user.username}
                    </p>

                    <p className="text-sm text-gray-500 dark:text-gray-400 truncate">
                      @{session.user.username}
                    </p>
                  </div>

                  <ChevronRight className="w-5 h-5 text-gray-400 flex-shrink-0" />
                </Link>
              )}

              {/* ──────────────────────────────────────────────────
                 Search
              ────────────────────────────────────────────────── */}

              {isAuthenticated && (
                <Link
                  href="/search"
                  onClick={closeMenu}
                  className="flex items-center gap-3 w-full p-3.5 mb-4 rounded-xl bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:text-zrp-red transition"
                >
                  <Search className="w-5 h-5" />
                  <span>{t("nav.search")}</span>
                  <ChevronRight className="w-4 h-4 ml-auto text-gray-400" />
                </Link>
              )}

              {/* ──────────────────────────────────────────────────
                 Main navigation
              ────────────────────────────────────────────────── */}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {navLinks.map((link) => (
                  <Link
                    key={link.href}
                    href={link.href}
                    onClick={closeMenu}
                    className="flex items-center gap-3 p-3.5 rounded-xl text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-zrp-red transition"
                  >
                    {link.icon && (
                      <link.icon className="w-5 h-5 flex-shrink-0" />
                    )}

                    <span className="font-medium">{link.label}</span>

                    {link.badge !== undefined && link.badge > 0 && (
                      <span className="ml-auto min-w-5 h-5 px-1.5 bg-zrp-red text-white text-[10px] font-bold rounded-full flex items-center justify-center">
                        {link.badge > 9 ? "9+" : link.badge}
                      </span>
                    )}

                    <ChevronRight className="w-4 h-4 ml-auto text-gray-400" />
                  </Link>
                ))}
              </div>

              {/* ──────────────────────────────────────────────────
                 Staff
              ────────────────────────────────────────────────── */}

              {isStaff && (
                <div className="mt-4">
                  <Link
                    href="/admin"
                    onClick={closeMenu}
                    className="flex items-center gap-3 p-3.5 rounded-xl text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-zrp-red transition"
                  >
                    <LayoutDashboard className="w-5 h-5" />
                    <span className="font-medium">{t("nav.admin")}</span>
                    <ChevronRight className="w-4 h-4 ml-auto text-gray-400" />
                  </Link>
                </div>
              )}

              {/* ──────────────────────────────────────────────────
                 Account settings
              ────────────────────────────────────────────────── */}

              {isAuthenticated && (
                <div className="mt-5 pt-5 border-t border-gray-200 dark:border-gray-700">
                  <p className="px-3 mb-2 text-xs font-semibold uppercase tracking-wider text-gray-400">
                    Account
                  </p>

                  <div className="space-y-1">
                    <Link
                      href={`/profile/${session.user.username}`}
                      onClick={closeMenu}
                      className="flex items-center gap-3 p-3.5 rounded-xl text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 transition"
                    >
                      <User className="w-5 h-5" />
                      <span>{t("nav.profile")}</span>
                    </Link>

                    <Link
                      href="/settings"
                      onClick={closeMenu}
                      className="flex items-center gap-3 p-3.5 rounded-xl text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 transition"
                    >
                      <Settings className="w-5 h-5" />
                      <span>Settings</span>
                    </Link>

                    {features?.teamManagement && (
                      <Link
                        href="/settings/team"
                        onClick={closeMenu}
                        className="flex items-center gap-3 p-3.5 rounded-xl text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 transition"
                      >
                        <Users className="w-5 h-5" />
                        <span>Team Management</span>
                      </Link>
                    )}

                    {features?.apiAccess && (
                      <Link
                        href="/settings/api-keys"
                        onClick={closeMenu}
                        className="flex items-center gap-3 p-3.5 rounded-xl text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 transition"
                      >
                        <Key className="w-5 h-5" />
                        <span>API Keys</span>
                      </Link>
                    )}
                  </div>
                </div>
              )}

              {/* ──────────────────────────────────────────────────
                 Preferences
              ────────────────────────────────────────────────── */}

              <div className="mt-5 pt-5 border-t border-gray-200 dark:border-gray-700">
                <p className="px-3 mb-2 text-xs font-semibold uppercase tracking-wider text-gray-400">
                  Preferences
                </p>

                {/* Language */}
                <div className="rounded-xl overflow-hidden">
                  <button
                    type="button"
                    onClick={() => setLangMenuOpen(!langMenuOpen)}
                    className="flex items-center gap-3 w-full p-3.5 text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 transition"
                  >
                    <Globe className="w-5 h-5" />

                    <span>{t("nav.language")}</span>

                    <span className="ml-auto text-xs font-semibold text-gray-400">
                      {currentLangLabel}
                    </span>

                    <ChevronDown
                      className={`w-4 h-4 text-gray-400 transition-transform ${
                        langMenuOpen ? "rotate-180" : ""
                      }`}
                    />
                  </button>

                  {langMenuOpen && (
                    <div className="px-3 pb-3">
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                        {SUPPORTED_LANGUAGES.map((lang) => (
                          <button
                            key={lang.code}
                            type="button"
                            onClick={() =>
                              handleLanguageChange(lang.code)
                            }
                            className={`px-3 py-2.5 rounded-lg text-sm font-medium transition ${
                              language === lang.code
                                ? "bg-zrp-red text-white"
                                : "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700"
                            }`}
                          >
                            {lang.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* Theme */}
                <button
                  type="button"
                  onClick={toggleTheme}
                  className="flex items-center gap-3 w-full p-3.5 rounded-xl text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 transition"
                >
                  {theme === "light" ? (
                    <Moon className="w-5 h-5" />
                  ) : (
                    <Sun className="w-5 h-5" />
                  )}

                  <span>
                    {theme === "light"
                      ? t("nav.darkMode")
                      : t("nav.lightMode")}
                  </span>

                  <span className="ml-auto text-xs text-gray-400">
                    {theme === "light" ? "Light" : "Dark"}
                  </span>
                </button>
              </div>

              {/* ──────────────────────────────────────────────────
                 Create / Post button
              ────────────────────────────────────────────────── */}

              {isAuthenticated && (
                <Link
                  href="/"
                  onClick={closeMenu}
                  className="mt-5 flex items-center justify-center gap-2 w-full bg-zrp-red text-white font-bold py-3.5 rounded-full hover:bg-zrp-darkRed transition shadow-sm"
                >
                  <PenSquare className="w-5 h-5" />
                  {t("sidebar.postButton")}
                </Link>
              )}

              {/* ──────────────────────────────────────────────────
                 Logout
              ────────────────────────────────────────────────── */}

              {isAuthenticated && (
                <button
                  type="button"
                  onClick={handleLogout}
                  className="mt-3 flex items-center justify-center gap-2 w-full py-3.5 rounded-full text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition"
                >
                  <LogOut className="w-5 h-5" />
                  {t("nav.signOut")}
                </button>
              )}

              {/* Bottom spacing */}
              <div className="h-6" />
            </div>
          </div>
        </div>
      )}
    </>
  );
}
