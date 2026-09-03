import type { Metadata, Viewport } from "next";
import { Inter, Orbitron } from "next/font/google";
import "./globals.css";

import { AuthProvider } from "@/components/AuthProvider";
import Header from "@/components/Header";
import Sidebar from "@/components/Sidebar";
import RightPanel from "@/components/RightPanel";
import Footer from "@/components/Footer";
import CookieConsent from "@/components/CookieConsent";
import GoogleAnalytics from "@/components/GoogleAnalytics";
import PushNotificationManager from "@/components/PushNotificationManager";
import NativeAppBridge from "@/components/NativeAppBridge";
import { ThemeProvider } from "@/contexts/ThemeContext";
import { LanguageProvider } from "@/contexts/LanguageContext";
import { UnreadCountProvider } from "@/contexts/UnreadCountContext";
import PageTransition from "@/components/PageTransition";
import EmailVerificationBanner from "@/components/EmailVerificationBanner";
import ServiceWorkerRegistration from "@/components/ServiceWorkerRegistration";
import BottomNav from "@/components/BottomNav";
import ErrorBoundary from "@/components/ErrorBoundary";
import { Suspense } from "react";
import MusicProviderMount from "@/components/music/MusicProviderMount";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

const orbitron = Orbitron({
  subsets: ["latin"],
  variable: "--font-orbitron",
});

const SITE_URL = "https://zrp.one";
const SITE_NAME = "ZRP Social";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),

  title: {
    default: "ZRP Social - The First Swiss-European Social Media Platform",
    template: "%s | ZRP Social",
  },

  description:
    "ZRP Social is a Swiss-European social media platform built in Switzerland around privacy, freedom of expression, security, and people-first communities.",

  alternates: { canonical: "/" },

  applicationName: SITE_NAME,

  keywords: [
    "ZRP Social",
    "ZRP",
    "Swiss social media",
    "Swiss social network",
    "Swiss social platform",
    "European social media",
    "European social network",
    "Swiss-European social media",
    "social media Switzerland",
    "social network Switzerland",
    "privacy social media",
    "freedom of speech",
    "freedom of expression",
    "people first social media",
  ],

  authors: [
    {
      name: SITE_NAME,
      url: SITE_URL,
    },
  ],

  creator: SITE_NAME,
  publisher: SITE_NAME,

  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
      "max-video-preview": -1,
    },
  },

  openGraph: {
    type: "website",
    locale: "en_US",
    url: SITE_URL,
    siteName: SITE_NAME,

    title:
      "ZRP Social: The First Swiss-European Social Media Platform",

    description:
      "A Swiss-European social media platform built around privacy, freedom of expression, security, and people-first communities.",

    images: [
      {
        url: `${SITE_URL}/og-image.png`,
        width: 1200,
        height: 630,
        alt:
          "ZRP Social: The First Swiss-European Social Media Platform",
      },
    ],
  },

  twitter: {
    card: "summary_large_image",

    title:
      "ZRP Social: The First Swiss-European Social Media Platform",

    description:
      "Swiss-built social media for Europe. Privacy, freedom of expression, security, and people-first communities.",

    images: [`${SITE_URL}/og-image.png`],

    creator: "@zrp_social",
  },

  icons: {
    icon: [
      {
        url: "/favicon.png",
        type: "image/png",
      },
      {
        url: "/icon-192.png",
        type: "image/png",
        sizes: "192x192",
      },
      {
        url: "/icon-512.png",
        type: "image/png",
        sizes: "512x512",
      },
    ],

    apple: [
      {
        url: "/icon-192.png",
        sizes: "192x192",
        type: "image/png",
      },
    ],
  },

  manifest: "/manifest",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#FF2D2D",
};

const structuredData = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      "@id": `${SITE_URL}/#organization`,
      name: SITE_NAME,
      url: SITE_URL,
      logo: {
        "@type": "ImageObject",
        url: `${SITE_URL}/logo.png`,
        width: 512,
        height: 512,
      },
      description:
        "ZRP Social is a Swiss-European social media platform built in Switzerland around privacy, freedom of expression, security, and people-first communities.",
    },

    {
      "@type": "WebSite",
      "@id": `${SITE_URL}/#website`,
      name: SITE_NAME,
      alternateName: "ZRP",
      url: SITE_URL,
      description:
        "The First Swiss-European Social Media Platform.",
      publisher: {
        "@id": `${SITE_URL}/#organization`,
      },
      inLanguage: "en",
    },

    {
      "@type": "WebPage",
      "@id": `${SITE_URL}/#webpage`,
      url: SITE_URL,
      name:
        "ZRP Social: The First Swiss-European Social Media Platform",
      description:
        "ZRP Social is a Swiss-European social media platform built in Switzerland around privacy, freedom of expression, security, and people-first communities.",
      isPartOf: {
        "@id": `${SITE_URL}/#website`,
      },
      about: {
        "@id": `${SITE_URL}/#organization`,
      },
      inLanguage: "en",
    },
  ],
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(structuredData),
          }}
        />

        <link rel="manifest" href="/manifest" />

        <meta
          name="theme-color"
          content="#FF2D2D"
        />

        <meta
          name="color-scheme"
          content="light dark"
        />

        <meta
          name="mobile-web-app-capable"
          content="yes"
        />

        <meta
          name="apple-mobile-web-app-capable"
          content="yes"
        />

        <meta
          name="apple-mobile-web-app-status-bar-style"
          content="default"
        />

        <meta
          name="apple-mobile-web-app-title"
          content="ZRP Social"
        />

        <link
          rel="apple-touch-icon"
          href="/icon-192.png"
        />

        <link
          rel="apple-touch-icon"
          sizes="152x152"
          href="/icon-192.png"
        />

        <link
          rel="apple-touch-icon"
          sizes="180x180"
          href="/icon-192.png"
        />

        <link
          rel="apple-touch-icon"
          sizes="167x167"
          href="/icon-192.png"
        />

        <link
          rel="icon"
          type="image/png"
          sizes="512x512"
          href="/icon-512.png"
        />

        <link
          rel="icon"
          type="image/png"
          sizes="192x192"
          href="/icon-192.png"
        />

        <link
          rel="icon"
          type="image/png"
          sizes="32x32"
          href="/favicon.png"
        />

        <link
          rel="icon"
          type="image/png"
          sizes="16x16"
          href="/favicon.png"
        />

        <link
          rel="shortcut icon"
          href="/favicon.png"
        />
      </head>

      <body
        className={`${inter.variable} ${orbitron.variable} font-inter min-h-screen flex flex-col bg-white dark:bg-zrp-deepBlack`}
      >
        <div className="app-shell-clip w-full flex flex-col min-h-screen pb-[calc(3.5rem+env(safe-area-inset-bottom))] lg:pb-0">

          <ErrorBoundary>
            <ThemeProvider>
              <LanguageProvider>
                {/*
                  MusicProviderMount lives inside LanguageProvider (not
                  outside it) specifically so MusicMiniPlayer and the
                  music player context can call useLanguage() - that
                  hook throws if rendered outside its provider, and
                  MusicMiniPlayer renders as a sibling of {children}
                  inside MusicProviderMount, not nested under it.
                */}
                <MusicProviderMount>
                  <Suspense
                    fallback={
                      <div className="min-h-screen flex items-center justify-center">
                        Loading...
                      </div>
                    }
                  >
                    <AuthProvider>
                      <UnreadCountProvider>
                        <GoogleAnalytics />
                        <NativeAppBridge />

                        <Header />

                        <EmailVerificationBanner />

                        {/* Main application area.
                            min-h-0 allows the chat page to shrink correctly
                            inside the flex layout instead of forcing the
                            composer below the visible viewport. */}
                        <div className="flex justify-center w-full max-w-[1400px] mx-auto min-h-0 flex-1">
                          <Sidebar />

                          <main className="flex-1 min-w-0 min-h-0">
                            <PageTransition>
                              {children}
                            </PageTransition>
                          </main>

                          <RightPanel />
                        </div>

                        <CookieConsent />

                        <Footer />

                        <PushNotificationManager />

                        <ServiceWorkerRegistration />

                        <BottomNav />
                      </UnreadCountProvider>
                    </AuthProvider>
                  </Suspense>
                </MusicProviderMount>
              </LanguageProvider>
            </ThemeProvider>
          </ErrorBoundary>

        </div>
      </body>
    </html>
  );
}
