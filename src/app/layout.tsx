import type { Metadata, Viewport } from "next";
import { Inter, Orbitron } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/components/AuthProvider";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import CookieConsent from "@/components/CookieConsent";
import PushNotificationManager from "@/components/PushNotificationManager";
import { ThemeProvider } from "@/contexts/ThemeContext";
import { LanguageProvider } from "@/contexts/LanguageContext";
import PageTransition from "@/components/PageTransition";
import EmailVerificationBanner from "@/components/EmailVerificationBanner"; // ✅ added

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
const orbitron = Orbitron({ subsets: ["latin"], variable: "--font-orbitron" });

export const metadata: Metadata = {
  title: "ZRP Social",
  description: "A social platform for the ZRP community",
  icons: {
    icon: "/favicon.png",
  },
  manifest: "/manifest",
  themeColor: "#FF2D2D",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  themeColor: "#FF2D2D",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* ─── PWA Manifest ────────────────────────────────────────── */}
        <link rel="manifest" href="/manifest" />
        <meta name="theme-color" content="#FF2D2D" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="ZRP" />

        {/* ─── Apple Touch Icons ──────────────────────────────────── */}
        <link rel="apple-touch-icon" href="/icon-192.png" />
        <link rel="apple-touch-icon" sizes="152x152" href="/icon-192.png" />
        <link rel="apple-touch-icon" sizes="180x180" href="/icon-192.png" />
        <link rel="apple-touch-icon" sizes="167x167" href="/icon-192.png" />

        {/* ─── Android / Standard Favicon ────────────────────────── */}
        <link rel="icon" type="image/png" sizes="192x192" href="/icon-192.png" />
        <link rel="icon" type="image/png" sizes="512x512" href="/icon-512.png" />
        <link rel="icon" type="image/png" sizes="32x32" href="/favicon.png" />
        <link rel="icon" type="image/png" sizes="16x16" href="/favicon.png" />
        <link rel="shortcut icon" href="/favicon.png" />
      </head>
      <body className={`${inter.variable} ${orbitron.variable} font-inter min-h-screen flex flex-col overflow-x-hidden`}>
        <ThemeProvider>
          <LanguageProvider>
            <AuthProvider>
              <Header />
              <EmailVerificationBanner /> {/* ✅ renders only for unverified users */}
              <PageTransition>{children}</PageTransition>
              <CookieConsent />
              <Footer />
              <PushNotificationManager />
            </AuthProvider>
          </LanguageProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
