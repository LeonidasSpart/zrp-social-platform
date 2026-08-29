"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useLanguage } from "@/contexts/LanguageContext";

export default function ForgotPasswordPage() {
  const { t } = useLanguage();
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMessage(null);

    try {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });

      const data = await res.json();
      setMessage({
        type: "success",
        text: data.message || t("forgotPassword.successDefault"),
      });
    } catch (error) {
      setMessage({ type: "error", text: t("auth.errTryAgain") });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-white dark:bg-zrp-deepBlack px-4 py-12">
      <div className="w-full max-w-md">
        <div className="text-center mb-10 sm:mb-12">
          <Link href="/" className="inline-block mb-6">
            <Image
              src="/logo.png"
              alt="ZRP"
              width={96}
              height={96}
              className="w-20 h-20 sm:w-24 sm:h-24 object-contain mx-auto"
              priority
            />
          </Link>
          <h1 className="text-4xl sm:text-5xl font-orbitron font-bold text-gray-900 dark:text-white leading-[1.05]">
            {t("auth.welcomeTitle")}
          </h1>
          <p className="text-gray-500 dark:text-gray-400 mt-3 text-base sm:text-lg">
            {t("forgotPassword.subtitle")}
          </p>
        </div>

        {message && (
          <div className={`p-3 rounded-lg text-sm mb-4 ${
            message.type === "success"
              ? "bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400"
              : "bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400"
          }`}>
            {message.text}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              {t("forgotPassword.emailAddress")}
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-4 py-3.5 sm:py-3 border border-gray-300 dark:border-gray-600 rounded-xl focus:ring-2 focus:ring-zrp-red focus:border-transparent bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-base"
              placeholder="you@example.com"
              required
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-zrp-red hover:bg-zrp-darkRed text-white py-3.5 sm:py-3 rounded-full font-semibold disabled:opacity-50 disabled:cursor-not-allowed transition shadow-sm text-base"
          >
            {loading ? t("forgotPassword.sending") : t("forgotPassword.sendResetLink")}
          </button>
        </form>

        <p className="text-center text-sm text-gray-600 dark:text-gray-400 mt-6">
          {t("forgotPassword.rememberPassword")}{" "}
          <Link href="/login" className="text-zrp-red dark:text-zrp-red hover:underline font-medium">
            {t("auth.signIn")}
          </Link>
        </p>
      </div>
    </div>
  );
}
