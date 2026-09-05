"use client";

import { usePathname } from "next/navigation";
import Footer from "./Footer";

/*
 * The institutional website footer (About/Careers/Charity/Press/Support/
 * Legal links, copyright, Swiss branding) belongs to ZRP's public
 * marketing shell, not the authenticated social app. Every route below
 * is a standalone, unauthenticated-accessible informational page where a
 * website-style footer is expected; every other route (Home, feeds,
 * profiles, Music, Settings, Messages, etc.) is the authenticated app
 * experience, where those same links now live in the hamburger menu
 * (Header) and desktop Sidebar "More" menu instead.
 */
const PUBLIC_SHELL_PREFIXES = [
  "/about",
  "/careers",
  "/charity",
  "/transparency",
  "/press",
  "/news",
  "/investors",
  "/contact",
  "/faq",
  "/help",
  "/privacy",
  "/terms",
  "/guidelines",
  "/pricing",
  "/login",
  "/signup",
  "/forgot-password",
  "/reset-password",
  "/verify-email",
];

export default function ConditionalFooter() {
  const pathname = usePathname();

  const isPublicShell = PUBLIC_SHELL_PREFIXES.some(
    (prefix) => pathname === prefix || pathname?.startsWith(`${prefix}/`)
  );

  if (!isPublicShell) return null;

  return <Footer />;
}
