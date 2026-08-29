"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

export default function CookieConsent() {
  const [showBanner, setShowBanner] = useState(false);

  useEffect(() => {
    const consent = localStorage.getItem("cookieConsent");
    if (!consent) {
      setShowBanner(true);
    }
  }, []);

  const acceptCookies = () => {
    localStorage.setItem("cookieConsent", "accepted");
    setShowBanner(false);
    // Optionally set a cookie for server-side reading
    document.cookie = "cookieConsent=accepted; path=/; max-age=31536000";
    window.dispatchEvent(new Event("cookieConsentChanged"));
  };

  const rejectCookies = () => {
    localStorage.setItem("cookieConsent", "rejected");
    setShowBanner(false);
    document.cookie = "cookieConsent=rejected; path=/; max-age=31536000";
    window.dispatchEvent(new Event("cookieConsentChanged"));
  };

  if (!showBanner) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 bg-white dark:bg-zrp-deepBlack border-t border-gray-200 dark:border-gray-800 shadow-lg p-4 md:p-6">
      <div className="max-w-5xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="text-sm text-gray-700 dark:text-gray-300 text-center md:text-left">
          <p>
            We use cookies to enhance your experience. By continuing to visit this site you agree to our use of cookies.{" "}
            <Link href="/privacy" className="text-zrp-red hover:underline">
              Learn more
            </Link>
            .
          </p>
        </div>
        <div className="flex items-center gap-3 flex-shrink-0">
          <button
            onClick={rejectCookies}
            className="px-4 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition"
          >
            Reject
          </button>
          <button
            onClick={acceptCookies}
            className="px-4 py-2 text-sm bg-zrp-red text-white rounded-lg hover:bg-zrp-darkRed transition"
          >
            Accept All
          </button>
        </div>
      </div>
    </div>
  );
}
