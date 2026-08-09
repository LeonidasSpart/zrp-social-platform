import type { Metadata, Viewport } from "next";
import { Inter, Orbitron } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/components/AuthProvider";
import Header from "@/components/Header";
import Sidebar from "@/components/Sidebar";
import RightPanel from "@/components/RightPanel";
import Footer from "@/components/Footer";
import CookieConsent from "@/components/CookieConsent";
import PushNotificationManager from "@/components/PushNotificationManager";
import { ThemeProvider } from "@/contexts/ThemeContext";
import { LanguageProvider } from "@/contexts/LanguageContext";
import { UnreadCountProvider } from "@/contexts/UnreadCountContext";
import PageTransition from "@/components/PageTransition";
import EmailVerificationBanner from "@/components/EmailVerificationBanner";
import ServiceWorkerRegistration from "@/components/ServiceWorkerRegistration";
import ErrorBoundary from "@/components/ErrorBoundary";
import { Suspense } from "react";
import { SolanaProvider } from "@/contexts/SolanaContext";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
const orbitron = Orbitron({ subsets: ["latin"], variable: "--font-orbitron" });

export const metadata: Metadata = {
  title: {
    default: "ZRP Social – Connect Freely. Share Securely. Build Together.",
    template: "%s | ZRP Social",
  },
  description:
    "The first Swiss European social media platform. Connect freely, share securely, and build together. 35% of profits go to charity.",
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL || "https://zrp-social-platform-production.up.railway.app"),
  keywords: [
    "Swiss social media",
    "European social platform",
    "freedom of speech",
    "privacy",
    "charity",
    "ZRP Social",
    "decentralized",
  ],
  authors: [{ name: "ZRP Social" }],
  creator: "ZRP Social",
  publisher: "ZRP Social",
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
    },
  },
  openGraph: {
    type: "website",
    locale: "en_US",
    url: process.env.NEXT_PUBLIC_APP_URL || "https://zrp-social-platform-production.up.railway.app",
    siteName: "ZRP Social",
    title: "ZRP Social – Connect Freely. Share Securely. Build Together.",
    description:
      "The first Swiss European social media platform. Connect freely, share securely, and build together. 35% of profits go to charity.",
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "ZRP Social – Swiss European Social Media Platform | 35% to Charity | Built in Switzerland",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "ZRP Social – Connect Freely. Share Securely. Build Together.",
    description:
      "The first Swiss European social media platform. Connect freely, share securely, and build together. 35% of profits go to charity.",
    images: ["/og-image.png"],
    creator: "@zrp_social",
  },
  icons: {
    icon: "/favicon.png",
  },
  manifest: "/manifest",
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
      <body className={`${inter.variable} ${orbitron.variable} font-inter min-h-screen flex flex-col`}>
        <div className="app-shell-clip w-full flex flex-col min-h-screen">
          <ErrorBoundary>
            <ThemeProvider>
              <LanguageProvider>
                <Suspense fallback={<div className="min-h-screen flex items-center justify-center">Loading...</div>}>
                  <SolanaProvider>
                    <AuthProvider>
                      <UnreadCountProvider>
                        <Header />
                        <EmailVerificationBanner />

                        {/* ─── 3-column layout shell (Facebook-style) ─────────
                            Sidebar only appears at lg+ (≥1024px).
                            RightPanel only appears at xl+ (≥1280px).
                            Below lg, pages render full-width as before,
                            using the existing top Header for navigation. ─── */}
                        <div className="flex justify-center w-full max-w-[1400px] mx-auto">
                          <Sidebar />
                          <main className="flex-1 min-w-0">
                            <PageTransition>{children}</PageTransition>
                          </main>
                          <RightPanel />
                        </div>

                        <CookieConsent />
                        <Footer />
                        <PushNotificationManager />
                        <ServiceWorkerRegistration />
                      </UnreadCountProvider>
                    </AuthProvider>
                  </SolanaProvider>
                </Suspense>
              </LanguageProvider>
            </ThemeProvider>
          </ErrorBoundary>
        </div>
      </body>
    </html>
  );
}
