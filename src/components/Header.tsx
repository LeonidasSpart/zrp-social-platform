"use client";

import { useState, useEffect } from "react";
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
  Newspaper,
  Store,
  ChevronDown,
  ChevronRight,
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

  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [langMenuOpen, setLangMenuOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);

  const isAuthenticated = !!session;
  const features = session?.user?.features;

  const isStaff =
    isAuthenticated &&
    (session?.user?.isAdmin ||
      session?.user?.role === "ADMIN" ||
      session?.user?.role === "MODERATOR");

  const isJournalist = isAuthenticated && session?.user?.role === "JOURNALIST";

  /*
   * Keep the language handler compatible with whatever Language type
   * LanguageContext expects.
   */
  const handleLanguageChange = (code: string) => {
    setLanguage(code as Parameters<typeof setLanguage>[0]);
    setLangMenuOpen(false);
  };

  const currentLangLabel =
    SUPPORTED_LANGUAGES.find(
      (l) => l.code === language
    )?.code.toUpperCase() || "EN";

  /*
   * Close responsive menus when switching to desktop.
   */
  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth >= 1024) {
        setMobileMenuOpen(false);
        setUserMenuOpen(false);
        setLangMenuOpen(false);
      }
    };

    window.addEventListener("resize", handleResize);

    return () =>
      window.removeEventListener("resize", handleResize);
  }, []);

  /*
   * Socket listener for block updates.
   */
  useEffect(() => {
    if (!session?.user?.id) return;

    const socket = getSocket(session.user.id);

    socket.on("block-updated", ({ blockerId }) => {
      if (blockerId === session.user.id) {
        window.location.reload();
      }
    });

    return () => {
      socket.off("block-updated");
    };
  }, [session]);

  /*
   * Public navigation.
   */
  const publicNavLinks: NavItem[] = [
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

  /*
   * Authenticated navigation.
   */
  const authNavLinks: NavItem[] = [
    {
      href: "/",
      icon: Home,
      label: t("nav.home"),
    },
    {
      href: "/shorts",
      icon: Film,
      label: t("nav.shorts"),
    },
    {
      href: "/explore",
      icon: Compass,
      label: t("nav.explore"),
    },
    {
      href: "/news",
      icon: Newspaper,
      label: t("nav.news"),
    },
    {
      href: "/marketplace",
      icon: Store,
      label: t("nav.marketplace"),
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
  ];

  const navLinks = isAuthenticated
    ? authNavLinks
    : publicNavLinks;

  /*
   * Logout.
   */
  const handleLogout = async () => {
    setUserMenuOpen(false);
    setMobileMenuOpen(false);
    setLangMenuOpen(false);

    await signOut({
      callbackUrl: "/login",
    });
  };

  /*
   * Close responsive menu.
   */
  const closeMobileMenu = () => {
    setMobileMenuOpen(false);
    setLangMenuOpen(false);
    setUserMenuOpen(false);
  };

  /*
   * Close dropdowns when clicking outside.
   */
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;

      if (!target.closest(".user-menu")) {
        setUserMenuOpen(false);
      }

      if (!target.closest(".lang-menu")) {
        setLangMenuOpen(false);
      }
    };

    document.addEventListener(
      "click",
      handleClickOutside
    );

    return () => {
      document.removeEventListener(
        "click",
        handleClickOutside
      );
    };
  }, []);

  return (
    <>
      <header className="sticky top-0 z-50 border-b border-gray-200 bg-white dark:border-gray-800 dark:bg-zrp-deepBlack">
        <div className="w-full max-w-[1400px] mx-auto px-3 sm:px-4">
          <div className="h-[64px] flex items-center justify-between gap-3">

            {/* =====================================================
                LOGO
            ===================================================== */}

            <Link
              href="/"
              className="flex-shrink-0 flex items-center"
              aria-label="ZRP Social"
              onClick={closeMobileMenu}
            >
              <Image
                src="/logo.png"
                alt="ZRP"
                width={90}
                height={90}
                priority
                className="w-14 h-14 sm:w-14 sm:h-14 object-contain"
              />
            </Link>

            {/* =====================================================
                DESKTOP HEADER
            ===================================================== */}

            <div className="hidden lg:flex items-center gap-2">

              {/* Admin */}

              {isStaff && (
                <Link
                  href="/admin"
                  className="flex items-center gap-2 px-3 py-2 rounded-full text-sm font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-zrp-red transition"
                >
                  <LayoutDashboard className="w-5 h-5" />

                  <span>
                    {t("nav.admin")}
                  </span>
                </Link>
              )}

              {/* Journalist */}

              {isJournalist && (
                <Link
                  href="/journalist"
                  className="flex items-center gap-2 px-3 py-2 rounded-full text-sm font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-zrp-red transition"
                >
                  <Newspaper className="w-5 h-5" />

                  <span>
                    {t("nav.journalist")}
                  </span>
                </Link>
              )}

              {/* =================================================
                  DESKTOP LANGUAGE
              ================================================= */}

              <div className="relative lang-menu">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();

                    setLangMenuOpen(
                      (value) => !value
                    );

                    setUserMenuOpen(false);
                  }}
                  className="flex items-center gap-2 px-3 py-2 rounded-full text-sm font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition"
                  aria-label={t("nav.language")}
                  aria-expanded={langMenuOpen}
                >
                  <Globe className="w-5 h-5" />

                  <span>
                    {currentLangLabel}
                  </span>

                  <ChevronDown
                    className={`w-4 h-4 transition-transform ${
                      langMenuOpen
                        ? "rotate-180"
                        : ""
                    }`}
                  />
                </button>

                {langMenuOpen && (
                  <div className="absolute right-0 mt-2 w-44 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-xl dark:border-gray-700 dark:bg-gray-800">
                    {SUPPORTED_LANGUAGES.map(
                      (lang) => (
                        <button
                          key={lang.code}
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();

                            handleLanguageChange(
                              lang.code
                            );
                          }}
                          className={`w-full flex items-center justify-between px-4 py-3 text-sm transition ${
                            language ===
                            lang.code
                              ? "bg-zrp-red/10 text-zrp-red font-semibold"
                              : "text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700"
                          }`}
                        >
                          <span>
                            {lang.label}
                          </span>

                          {language ===
                            lang.code && (
                            <span className="text-xs font-bold">
                              ✓
                            </span>
                          )}
                        </button>
                      )
                    )}
                  </div>
                )}
              </div>

              {/* =================================================
                  THEME
              ================================================= */}

              <button
                type="button"
                onClick={toggleTheme}
                className="flex items-center justify-center w-10 h-10 rounded-full text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-zrp-red transition"
                title={
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

              {/* =================================================
                  DESKTOP USER MENU
              ================================================= */}

              {isAuthenticated && (
                <div className="relative user-menu">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();

                      setUserMenuOpen(
                        (value) => !value
                      );

                      setLangMenuOpen(false);
                    }}
                    className="flex items-center gap-2 rounded-full px-2 py-1.5 hover:bg-gray-100 dark:hover:bg-gray-800 transition"
                    aria-label={t("nav.profile")}
                    aria-expanded={userMenuOpen}
                  >
                    <div className="w-8 h-8 rounded-full overflow-hidden bg-zrp-red/10 flex items-center justify-center text-zrp-red font-semibold">
                      {session?.user
                        ?.avatarUrl ? (
                        <img
                          src={
                            session.user
                              .avatarUrl
                          }
                          alt=""
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        session?.user?.name?.[0]?.toUpperCase() ||
                        "?"
                      )}
                    </div>

                    <ChevronDown
                      className={`w-4 h-4 text-gray-500 transition-transform ${
                        userMenuOpen
                          ? "rotate-180"
                          : ""
                      }`}
                    />
                  </button>

                  {userMenuOpen && (
                    <div className="absolute right-0 mt-2 w-64 overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-2xl dark:border-gray-700 dark:bg-gray-800">

                      {/* User information */}

                      <div className="px-4 py-4 border-b border-gray-200 dark:border-gray-700">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-full overflow-hidden bg-zrp-red/10 flex items-center justify-center text-zrp-red font-bold">
                            {session?.user
                              ?.avatarUrl ? (
                              <img
                                src={
                                  session.user
                                    .avatarUrl
                                }
                                alt=""
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              session?.user?.name?.[0]?.toUpperCase() ||
                              "?"
                            )}
                          </div>

                          <div className="min-w-0">
                            <p className="font-semibold text-gray-900 dark:text-white truncate">
                              {session?.user?.name ||
                                session?.user
                                  ?.username}
                            </p>

                            <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                              @
                              {
                                session?.user
                                  ?.username
                              }
                            </p>
                          </div>
                        </div>
                      </div>

                      {/* Profile */}

                      <Link
                        href={`/profile/${session.user.username}`}
                        onClick={() =>
                          setUserMenuOpen(false)
                        }
                        className="flex items-center gap-3 px-4 py-3 text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 transition"
                      >
                        <User className="w-5 h-5" />

                        <span>
                          {t("nav.profile")}
                        </span>
                      </Link>

                      {/* Settings */}

                      <Link
                        href="/settings"
                        onClick={() =>
                          setUserMenuOpen(false)
                        }
                        className="flex items-center gap-3 px-4 py-3 text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 transition"
                      >
                        <Settings className="w-5 h-5" />

                        <span>
                          {t("nav.settings")}
                        </span>
                      </Link>

                      {/* Team Management */}

                      {features?.teamManagement && (
                        <Link
                          href="/settings/team"
                          onClick={() =>
                            setUserMenuOpen(false)
                          }
                          className="flex items-center gap-3 px-4 py-3 text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 transition"
                        >
                          <Users className="w-5 h-5" />

                          <span>
                            {t("nav.teamManagement")}
                          </span>
                        </Link>
                      )}

                      {/* API Keys */}

                      {features?.apiAccess && (
                        <Link
                          href="/settings/api-keys"
                          onClick={() =>
                            setUserMenuOpen(false)
                          }
                          className="flex items-center gap-3 px-4 py-3 text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 transition"
                        >
                          <Key className="w-5 h-5" />

                          <span>
                            {t("nav.apiKeys")}
                          </span>
                        </Link>
                      )}

                      <div className="border-t border-gray-200 dark:border-gray-700" />

                      {/* Logout */}

                      <button
                        type="button"
                        onClick={handleLogout}
                        className="flex items-center gap-3 w-full px-4 py-3 text-left text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition"
                      >
                        <LogOut className="w-5 h-5" />

                        <span>
                          {t("nav.signOut")}
                        </span>
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* =====================================================
                TABLET + MOBILE HEADER CONTROLS
            ===================================================== */}

            <div className="lg:hidden flex items-center gap-1">

              {/* Messages */}

              {isAuthenticated && (
                <Link
                  href="/messages"
                  className="relative flex items-center justify-center w-10 h-10 rounded-full text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition"
                  aria-label={t("nav.messages")}
                >
                  <MessageSquare className="w-5 h-5" />

                  {unreadMessageCount > 0 && (
                    <span className="absolute top-1 right-1 min-w-[16px] h-4 px-1 bg-zrp-red text-white text-[9px] font-bold rounded-full flex items-center justify-center">
                      {unreadMessageCount > 9
                        ? "9+"
                        : unreadMessageCount}
                    </span>
                  )}
                </Link>
              )}

              {/* Notifications */}

              {isAuthenticated && (
                <Link
                  href="/notifications"
                  className="relative flex items-center justify-center w-10 h-10 rounded-full text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition"
                  aria-label={t(
                    "nav.notifications"
                  )}
                >
                  <Bell className="w-5 h-5" />

                  {unreadCount > 0 && (
                    <span className="absolute top-1 right-1 min-w-[16px] h-4 px-1 bg-zrp-red text-white text-[9px] font-bold rounded-full flex items-center justify-center">
                      {unreadCount > 9
                        ? "9+"
                        : unreadCount}
                    </span>
                  )}
                </Link>
              )}

              {/* Menu */}

              <button
                type="button"
                onClick={() => {
                  setMobileMenuOpen(
                    (value) => !value
                  );

                  setUserMenuOpen(false);
                  setLangMenuOpen(false);
                }}
                className="flex items-center justify-center w-10 h-10 rounded-full text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-zrp-red transition"
                aria-label={
                  mobileMenuOpen
                    ? t("nav.closeMenu")
                    : t("nav.openMenu")
                }
                aria-expanded={
                  mobileMenuOpen
                }
              >
                {mobileMenuOpen ? (
                  <X className="w-6 h-6" />
                ) : (
                  <Menu className="w-6 h-6" />
                )}
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* ===========================================================
          ADVANCED TABLET / MOBILE MENU
      =========================================================== */}

      {mobileMenuOpen && (
        <>
          {/* Backdrop */}

          <button
            type="button"
            aria-label={t("nav.closeMenu")}
            onClick={closeMobileMenu}
            className="lg:hidden fixed inset-0 top-[64px] z-40 bg-black/30 backdrop-blur-[2px]"
          />

          {/* Menu Panel */}

          <div className="lg:hidden fixed top-[64px] right-0 bottom-0 z-50 w-full sm:w-[420px] bg-white dark:bg-zrp-deepBlack border-l border-gray-200 dark:border-gray-800 shadow-2xl overflow-y-auto">

            {/* =====================================================
                USER HEADER
            ===================================================== */}

            {isAuthenticated && (
              <div className="px-5 py-5 border-b border-gray-200 dark:border-gray-800">
                <Link
                  href={`/profile/${session.user.username}`}
                  onClick={closeMobileMenu}
                  className="flex items-center gap-3"
                >
                  <div className="w-12 h-12 rounded-full overflow-hidden bg-zrp-red/10 flex items-center justify-center text-zrp-red font-bold">
                    {session.user.avatarUrl ? (
                      <img
                        src={
                          session.user.avatarUrl
                        }
                        alt=""
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      session.user.name?.[0]?.toUpperCase() ||
                      "?"
                    )}
                  </div>

                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-gray-900 dark:text-white truncate">
                      {session.user.name ||
                        session.user.username}
                    </p>

                    <p className="text-sm text-gray-500 dark:text-gray-400 truncate">
                      @{session.user.username}
                    </p>
                  </div>

                  <ChevronRight className="w-5 h-5 text-gray-400" />
                </Link>
              </div>
            )}

            <div className="p-4">

              {/* =================================================
                  PRIMARY NAVIGATION
              ================================================= */}

              <div className="space-y-1">
                {navLinks.map((link) => (
                  <Link
                    key={link.href}
                    href={link.href}
                    onClick={closeMobileMenu}
                    className="flex items-center gap-4 px-4 py-3.5 rounded-xl text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 transition"
                  >
                    {link.icon && (
                      <link.icon className="w-5 h-5 text-gray-500 dark:text-gray-400" />
                    )}

                    <span className="flex-1 font-medium">
                      {link.label}
                    </span>

                    {link.badge !== undefined &&
                      link.badge > 0 && (
                        <span className="min-w-[22px] h-5 px-1.5 bg-zrp-red text-white text-[10px] font-bold rounded-full flex items-center justify-center">
                          {link.badge > 9
                            ? "9+"
                            : link.badge}
                        </span>
                      )}

                    <ChevronRight className="w-4 h-4 text-gray-400" />
                  </Link>
                ))}
              </div>

              {/* =================================================
                  ADMINISTRATION
              ================================================= */}

              {isStaff && (
                <div className="mt-5 pt-5 border-t border-gray-200 dark:border-gray-800">
                  <p className="px-4 mb-2 text-xs font-semibold uppercase tracking-wider text-gray-400">
                    {t("nav.administration")}
                  </p>

                  <Link
                    href="/admin"
                    onClick={closeMobileMenu}
                    className="flex items-center gap-4 px-4 py-3.5 rounded-xl text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 transition"
                  >
                    <LayoutDashboard className="w-5 h-5 text-zrp-red" />

                    <span className="flex-1 font-medium">
                      {t("nav.admin")}
                    </span>

                    <ChevronRight className="w-4 h-4 text-gray-400" />
                  </Link>
                </div>
              )}

              {/* =================================================
                  JOURNALIST
              ================================================= */}

              {isJournalist && (
                <div className="mt-5 pt-5 border-t border-gray-200 dark:border-gray-800">
                  <p className="px-4 mb-2 text-xs font-semibold uppercase tracking-wider text-gray-400">
                    {t("nav.journalist")}
                  </p>

                  <Link
                    href="/journalist"
                    onClick={closeMobileMenu}
                    className="flex items-center gap-4 px-4 py-3.5 rounded-xl text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 transition"
                  >
                    <Newspaper className="w-5 h-5 text-zrp-red" />

                    <span className="flex-1 font-medium">
                      {t("nav.journalistDashboard")}
                    </span>

                    <ChevronRight className="w-4 h-4 text-gray-400" />
                  </Link>
                </div>
              )}

              {/* =================================================
                  ACCOUNT
              ================================================= */}

              {isAuthenticated && (
                <div className="mt-5 pt-5 border-t border-gray-200 dark:border-gray-800">
                  <p className="px-4 mb-2 text-xs font-semibold uppercase tracking-wider text-gray-400">
                    {t("nav.account")}
                  </p>

                  <Link
                    href={`/profile/${session.user.username}`}
                    onClick={closeMobileMenu}
                    className="flex items-center gap-4 px-4 py-3.5 rounded-xl text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 transition"
                  >
                    <User className="w-5 h-5 text-gray-500" />

                    <span className="flex-1 font-medium">
                      {t("nav.profile")}
                    </span>

                    <ChevronRight className="w-4 h-4 text-gray-400" />
                  </Link>

                  <Link
                    href="/settings"
                    onClick={closeMobileMenu}
                    className="flex items-center gap-4 px-4 py-3.5 rounded-xl text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 transition"
                  >
                    <Settings className="w-5 h-5 text-gray-500" />

                    <span className="flex-1 font-medium">
                      {t("nav.settings")}
                    </span>

                    <ChevronRight className="w-4 h-4 text-gray-400" />
                  </Link>

                  {features?.teamManagement && (
                    <Link
                      href="/settings/team"
                      onClick={closeMobileMenu}
                      className="flex items-center gap-4 px-4 py-3.5 rounded-xl text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 transition"
                    >
                      <Users className="w-5 h-5 text-gray-500" />

                      <span className="flex-1 font-medium">
                        {t("nav.teamManagement")}
                      </span>

                      <ChevronRight className="w-4 h-4 text-gray-400" />
                    </Link>
                  )}

                  {features?.apiAccess && (
                    <Link
                      href="/settings/api-keys"
                      onClick={closeMobileMenu}
                      className="flex items-center gap-4 px-4 py-3.5 rounded-xl text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 transition"
                    >
                      <Key className="w-5 h-5 text-gray-500" />

                      <span className="flex-1 font-medium">
                        {t("nav.apiKeys")}
                      </span>

                      <ChevronRight className="w-4 h-4 text-gray-400" />
                    </Link>
                  )}
                </div>
              )}

              {/* =================================================
                  PREFERENCES
              ================================================= */}

              <div className="mt-5 pt-5 border-t border-gray-200 dark:border-gray-800">
                <p className="px-4 mb-2 text-xs font-semibold uppercase tracking-wider text-gray-400">
                  {t("nav.preferences")}
                </p>

                {/* LANGUAGE */}

                <div className="lang-menu rounded-xl overflow-hidden">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();

                      setLangMenuOpen(
                        (value) => !value
                      );
                    }}
                    className={`w-full flex items-center gap-4 px-4 py-3.5 text-gray-700 dark:text-gray-200 transition ${
                      langMenuOpen
                        ? "bg-gray-100 dark:bg-gray-800"
                        : "hover:bg-gray-100 dark:hover:bg-gray-800"
                    }`}
                    aria-expanded={
                      langMenuOpen
                    }
                    aria-label={t(
                      "nav.language"
                    )}
                  >
                    <Globe className="w-5 h-5 text-gray-500" />

                    <span className="flex-1 text-left font-medium">
                      {t("nav.language")}
                    </span>

                    <span className="text-xs font-semibold text-gray-400 mr-1">
                      {currentLangLabel}
                    </span>

                    <ChevronDown
                      className={`w-4 h-4 text-gray-400 transition-transform ${
                        langMenuOpen
                          ? "rotate-180"
                          : ""
                      }`}
                    />
                  </button>

                  {langMenuOpen && (
                    <div className="mx-2 mb-2 rounded-xl bg-gray-50 dark:bg-gray-800/70 overflow-hidden border border-gray-200 dark:border-gray-700">
                      {SUPPORTED_LANGUAGES.map(
                        (lang) => {
                          const selected =
                            language ===
                            lang.code;

                          return (
                            <button
                              key={
                                lang.code
                              }
                              type="button"
                              onClick={(
                                e
                              ) => {
                                e.stopPropagation();

                                handleLanguageChange(
                                  lang.code
                                );
                              }}
                              className={`w-full flex items-center justify-between px-4 py-3 text-sm transition ${
                                selected
                                  ? "text-white bg-zrp-red font-semibold"
                                  : "text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
                              }`}
                            >
                              <span>
                                {
                                  lang.label
                                }
                              </span>

                              <span className="flex items-center gap-2 text-xs font-medium">
                                {selected && (
                                  <span>
                                    ✓
                                  </span>
                                )}

                                {lang.code.toUpperCase()}
                              </span>
                            </button>
                          );
                        }
                      )}
                    </div>
                  )}
                </div>

                {/* THEME */}

                <button
                  type="button"
                  onClick={toggleTheme}
                  className="w-full flex items-center gap-4 px-4 py-3.5 rounded-xl text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 transition"
                >
                  {theme === "light" ? (
                    <Moon className="w-5 h-5 text-gray-500" />
                  ) : (
                    <Sun className="w-5 h-5 text-gray-500" />
                  )}

                  <span className="flex-1 text-left font-medium">
                    {theme === "light"
                      ? t("nav.darkMode")
                      : t("nav.lightMode")}
                  </span>
                </button>
              </div>

              {/* =================================================
                  LOGOUT
              ================================================= */}

              {isAuthenticated && (
                <div className="mt-5 pt-5 border-t border-gray-200 dark:border-gray-800 pb-8">
                  <button
                    type="button"
                    onClick={handleLogout}
                    className="w-full flex items-center gap-4 px-4 py-3.5 rounded-xl text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition"
                  >
                    <LogOut className="w-5 h-5" />

                    <span className="font-medium">
                      {t("nav.signOut")}
                    </span>
                  </button>
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </>
  );
}

                        
