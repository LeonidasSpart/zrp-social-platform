"use client";

import { useEffect, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import Script from "next/script";

// Opt-in GA4 loader. Renders nothing unless NEXT_PUBLIC_GA_MEASUREMENT_ID
// is set AND the visitor has accepted cookies via CookieConsent - so this
// is a safe no-op until a real measurement ID is configured, and it never
// tracks anyone who declined cookies.
const GA_MEASUREMENT_ID = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID;

function hasConsent(): boolean {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem("cookieConsent") === "accepted";
}

export default function GoogleAnalytics() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [consented, setConsented] = useState(false);

  useEffect(() => {
    setConsented(hasConsent());

    const onConsentChange = () => setConsented(hasConsent());
    window.addEventListener("cookieConsentChanged", onConsentChange);
    return () =>
      window.removeEventListener("cookieConsentChanged", onConsentChange);
  }, []);

  // Track client-side route changes - gtag's own script only fires a
  // pageview for the initial load, and this app navigates without full
  // page reloads.
  useEffect(() => {
    if (!GA_MEASUREMENT_ID || !consented || typeof window.gtag !== "function") {
      return;
    }

    const query = searchParams.toString();
    const url = query ? `${pathname}?${query}` : pathname;

    window.gtag("config", GA_MEASUREMENT_ID, { page_path: url });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname, searchParams, consented]);

  if (!GA_MEASUREMENT_ID || !consented) {
    return null;
  }

  return (
    <>
      <Script
        src={`https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`}
        strategy="afterInteractive"
      />
      <Script id="ga4-init" strategy="afterInteractive">
        {`
          window.dataLayer = window.dataLayer || [];
          function gtag(){dataLayer.push(arguments);}
          window.gtag = gtag;
          gtag('js', new Date());
          gtag('config', '${GA_MEASUREMENT_ID}', { anonymize_ip: true });
        `}
      </Script>
    </>
  );
}

declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void;
  }
}
