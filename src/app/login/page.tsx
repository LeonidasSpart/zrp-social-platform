"use client";

import { signIn } from "next-auth/react";
import { useState, useEffect } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import PasswordInput from "@/components/PasswordInput";
import { useLanguage } from "@/contexts/LanguageContext";
import GoogleIcon from "@/components/icons/GoogleIcon";

export default function LoginPage() {
  const searchParams = useSearchParams();
  const { t } = useLanguage();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  useEffect(() => {
    const errorParam = searchParams.get("error");
    if (errorParam === "banned") {
      setError(t("auth.errBanned"));
    }
  }, [searchParams, t]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const result = await signIn("credentials", {
        email,
        password,
        redirect: false,
      });

      if (result?.error) {
        // ✅ Show the actual error from the server
        setError(result.error);
        setLoading(false);
      } else {
        window.location.href = "/";
      }
    } catch (err) {
      console.error("Login error:", err);
      setError(
        `Something went wrong: ${err instanceof Error ? err.message : String(err)}`
      );
      setLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setGoogleLoading(true);
    await signIn("google", { callbackUrl: "/" });
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-zrp-deepBlack px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">{t("auth.welcomeTitle")}</h1>
          <p className="text-gray-600 dark:text-gray-400 mt-2">{t("auth.signInSubtitle")}</p>
        </div>

        <div className="bg-white dark:bg-zrp-deepBlack rounded-lg shadow-sm p-8">
          <button
            type="button"
            onClick={handleGoogleSignIn}
            disabled={googleLoading}
            className="w-full flex items-center justify-center gap-3 border border-gray-300 dark:border-gray-600 rounded-lg py-2.5 font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800 transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <GoogleIcon className="w-5 h-5" />
            {googleLoading ? t("auth.signingIn") : t("auth.continueWithGoogle")}
          </button>

          <div className="flex items-center gap-3 my-6">
            <div className="flex-1 h-px bg-gray-200 dark:bg-gray-700" />
            <span className="text-xs text-gray-400 dark:text-gray-500 uppercase">{t("auth.or")}</span>
            <div className="flex-1 h-px bg-gray-200 dark:bg-gray-700" />
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className={`p-3 rounded-lg text-sm ${
                error.includes("verify") || error.includes("verification")
                  ? "bg-yellow-50 dark:bg-yellow-900/20 text-yellow-800 dark:text-yellow-300 border border-yellow-200 dark:border-yellow-800"
                  : error.includes("banned")
                  ? "bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 border border-red-200 dark:border-red-800"
                  : "bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400"
              }`}>
                {error}
                {error.includes("verify") && (
                  <div className="mt-2">
                    <Link
                      href="/forgot-password"
                      className="text-zrp-red dark:text-zrp-red underline text-sm hover:text-zrp-darkRed dark:hover:text-red-300"
                    >
                      {t("auth.resendVerification")}
                    </Link>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                      {t("auth.checkSpam")}
                    </p>
                  </div>
                )}
                {error.includes("banned") && (
                  <div className="mt-2">
                    <a
                      href="mailto:support@zrp.one?subject=Account%20Ban%20Appeal"
                      className="text-zrp-red dark:text-zrp-red underline text-sm hover:text-zrp-darkRed dark:hover:text-red-300"
                    >
                      {t("auth.contactSupport")}
                    </a>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                      {t("auth.banAppealNote")}
                    </p>
                  </div>
                )}
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                {t("auth.emailOrUsername")}
              </label>
              <input
                type="text"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-zrp-red focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                placeholder={t("auth.emailOrUsernamePlaceholder")}
                autoComplete="username"
                required
              />
            </div>

            <PasswordInput
              id="password"
              name="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              label={t("auth.password")}
              placeholder={t("auth.password")}
              required
              autoComplete="current-password"
            />

            <Link
              href="/forgot-password"
              className="text-sm text-zrp-red dark:text-zrp-red hover:underline block text-right mt-1"
            >
              {t("auth.forgotPassword")}
            </Link>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-zrp-red hover:bg-zrp-darkRed text-white py-2 rounded-lg font-medium disabled:opacity-50 disabled:cursor-not-allowed transition"
            >
              {loading ? t("auth.signingIn") : t("auth.signIn")}
            </button>
          </form>

          <p className="text-center text-sm text-gray-600 dark:text-gray-400 mt-4">
            {t("auth.noAccount")}{" "}
            <Link href="/signup" className="text-zrp-red dark:text-zrp-red hover:underline">
              {t("auth.signUp")}
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
