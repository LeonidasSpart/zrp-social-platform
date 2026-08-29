"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useLanguage } from "@/contexts/LanguageContext";

export default function VerifyEmailPage() {
  const { t } = useLanguage();
  const searchParams = useSearchParams();
  const token = searchParams.get("token");
  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!token) {
      setStatus("error");
      setMessage(t("verifyEmail.noToken"));
      return;
    }

    fetch(`/api/auth/verify?token=${token}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.error) {
          setStatus("error");
          setMessage(data.error);
        } else {
          setStatus("success");
          setMessage(t("verifyEmail.successMessage"));
        }
      })
      .catch(() => {
        setStatus("error");
        setMessage(t("verifyEmail.failedMessage"));
      });
  }, [token, t]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-zrp-deepBlack px-4">
      <div className="max-w-md w-full bg-white dark:bg-zrp-deepBlack rounded-lg shadow-sm p-8 text-center">
        {status === "loading" && (
          <>
            <div className="w-12 h-12 border-4 border-zrp-red border-t-transparent rounded-full animate-spin mx-auto mb-4" />
            <p className="text-gray-600 dark:text-gray-400">{t("verifyEmail.verifying")}</p>
          </>
        )}
        {status === "success" && (
          <>
            <div className="w-12 h-12 bg-green-100 dark:bg-green-900/20 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-6 h-6 text-green-600 dark:text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{t("verifyEmail.verifiedTitle")}</h1>
            <p className="text-gray-600 dark:text-gray-400 mt-2">{message}</p>
            <Link href="/login" className="mt-4 inline-block bg-zrp-red text-white px-6 py-2 rounded-lg hover:bg-zrp-darkRed transition">
              {t("verifyEmail.logIn")}
            </Link>
          </>
        )}
        {status === "error" && (
          <>
            <div className="w-12 h-12 bg-red-100 dark:bg-red-900/20 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-6 h-6 text-red-600 dark:text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{t("verifyEmail.failedTitle")}</h1>
            <p className="text-gray-600 dark:text-gray-400 mt-2">{message}</p>
            <Link href="/login" className="mt-4 inline-block bg-zrp-red text-white px-6 py-2 rounded-lg hover:bg-zrp-darkRed transition">
              {t("verifyEmail.goToLogin")}
            </Link>
          </>
        )}
      </div>
    </div>
  );
}
