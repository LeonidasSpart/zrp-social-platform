"use client";

import { signIn } from "next-auth/react";
import { useState, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import { useSearchParams } from "next/navigation";
import PasswordInput from "@/components/PasswordInput";
import { useLanguage } from "@/contexts/LanguageContext";
import GoogleIcon from "@/components/icons/GoogleIcon";
import { isNativeApp, nativeGoogleSignIn } from "@/lib/nativeAuth";
import type { TranslationKey } from "@/lib/translations";

export default function LoginPage() {
  const searchParams = useSearchParams();
  const { t } = useLanguage();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [resendLoading, setResendLoading] = useState(false);
  const [resendMessage, setResendMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  useEffect(() => {
    const errorParam = searchParams.get("error");
    if (errorParam === "banned") {
      setError(t("auth.errBanned"));
    } else if (errorParam === "session_expired") {
      setError(t("auth.errSessionExpired"));
    }
  }, [searchParams, t]);

  const RESEND_ERROR_KEYS: Record<string, TranslationKey> = {
    USER_NOT_FOUND: "auth.resendVerificationUserNotFound",
    ALREADY_VERIFIED: "auth.resendVerificationAlreadyVerified",
  };

  const handleResendVerification = async () => {
    setResendLoading(true);
    setResendMessage(null);

    try {
      const res = await fetch("/api/auth/resend-verification", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // `email` is the same identifier the user typed into "Email or
        // Username" above - the endpoint resolves either, the same way
        // credentials login itself does.
        body: JSON.stringify({ email }),
      });
      const data = await res.json().catch(() => ({}));

      if (res.ok) {
        setResendMessage({ type: "success", text: t("auth.resendVerificationSuccess") });
      } else {
        const key = RESEND_ERROR_KEYS[data.code] || "auth.resendVerificationError";
        setResendMessage({ type: "error", text: t(key) });
      }
    } catch (err) {
      console.error("Resend verification error:", err);
      setResendMessage({ type: "error", text: t("auth.resendVerificationError") });
    } finally {
      setResendLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    setResendMessage(null);

    try {
      const result = await signIn("credentials", {
        email,
        password,
        redirect: false,
      });

      if (result?.error) {
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
    if (isNativeApp()) {
      // Google blocks OAuth from embedded WebViews, so inside the
      // native app this opens the system browser instead of navigating
      // the app's own WebView to accounts.google.com.
      try {
        await nativeGoogleSignIn("/");
      } catch {
        setError(t("auth.errSomethingWrong"));
        setGoogleLoading(false);
      }
      return;
    }
    await signIn("google", { callbackUrl: "/" });
  };

  return (
    <div className="min-h-screen flex bg-white dark:bg-zrp-deepBlack">
      {/* ─── Left brand panel, desktop only ─────────────────────────── */}
      <div className="hidden lg:flex lg:w-1/2 relative overflow-hidden bg-gradient-to-br from-zrp-darkRed via-zrp-red to-zrp-darkRed">
        <div
          className="absolute inset-0 opacity-[0.08]"
          style={{
            backgroundImage:
              "radial-gradient(circle, #fff 1.5px, transparent 1.5px)",
            backgroundSize: "28px 28px",
          }}
        />
        <div className="relative z-10 flex flex-col justify-between p-12 xl:p-16 w-full">
          <Link href="/" className="inline-block w-fit">
            <Image
              src="/logo.png"
              alt="ZRP"
              width={56}
              height={56}
              className="w-14 h-14 object-contain"
            />
          </Link>

          <div>
            <h1 className="font-orbitron font-bold text-white text-5xl xl:text-6xl leading-[1.05] mb-6">
              {t("auth.welcomeTitle")}
            </h1>
            <p className="text-white/80 text-xl xl:text-2xl max-w-md leading-snug">
              {t("about.subtitle")}
            </p>
          </div>

          <p className="text-white/60 text-sm">
            {t("rightPanel.footerText")}
          </p>
        </div>
      </div>

      {/* ─── Right / mobile form panel ───────────────────────────────── */}
      <div className="flex-1 flex items-center justify-center px-4 py-12 sm:py-16">
        <div className="w-full max-w-md">
          {/* ─── Mobile & tablet hero, big and bold, like a native app ─── */}
          <div className="lg:hidden text-center mb-10 sm:mb-14">
            <Link href="/" className="inline-block mb-6 sm:mb-8">
              <Image
                src="/logo.png"
                alt="ZRP"
                width={96}
                height={96}
                className="w-20 h-20 sm:w-24 sm:h-24 object-contain mx-auto"
                priority
              />
            </Link>
            <h2 className="text-4xl sm:text-5xl font-orbitron font-bold text-gray-900 dark:text-white leading-[1.05]">
              {t("auth.welcomeTitle")}
            </h2>
            <p className="text-gray-500 dark:text-gray-400 mt-3 text-base sm:text-lg max-w-sm mx-auto">
              {t("about.subtitle")}
            </p>
          </div>

          <div className="hidden lg:block mb-8">
            <h2 className="text-2xl font-orbitron font-bold text-gray-900 dark:text-white">
              {t("auth.signIn")}
            </h2>
            <p className="text-gray-500 dark:text-gray-400 mt-1">{t("auth.signInSubtitle")}</p>
          </div>

          <button
            type="button"
            onClick={handleGoogleSignIn}
            disabled={googleLoading}
            className="w-full flex items-center justify-center gap-3 border border-gray-300 dark:border-gray-600 rounded-full py-3.5 sm:py-3 font-medium text-gray-700 dark:text-gray-100 bg-white dark:bg-white/5 hover:bg-gray-50 dark:hover:bg-white/10 shadow-sm transition disabled:opacity-50 disabled:cursor-not-allowed text-base"
          >
            <GoogleIcon className="w-5 h-5" />
            {googleLoading ? t("auth.signingIn") : t("auth.continueWithGoogle")}
          </button>

          <div className="flex items-center gap-3 my-6 sm:my-6">
            <div className="flex-1 h-px bg-gray-200 dark:bg-gray-700" />
            <span className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide">{t("auth.or")}</span>
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
                    <button
                      type="button"
                      onClick={handleResendVerification}
                      disabled={resendLoading}
                      className="text-zrp-red dark:text-zrp-red underline text-sm hover:text-zrp-darkRed dark:hover:text-red-300 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {resendLoading ? t("auth.resendVerificationSending") : t("auth.resendVerification")}
                    </button>
                    {resendMessage ? (
                      <p
                        className={`text-xs mt-1 ${
                          resendMessage.type === "success"
                            ? "text-green-600 dark:text-green-400"
                            : "text-red-600 dark:text-red-400"
                        }`}
                      >
                        {resendMessage.text}
                      </p>
                    ) : (
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                        {t("auth.checkSpam")}
                      </p>
                    )}
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
                className="w-full px-4 py-3.5 sm:py-3 border border-gray-300 dark:border-gray-600 rounded-xl focus:ring-2 focus:ring-zrp-red focus:border-transparent bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-base"
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

            <div className="flex justify-end -mt-2">
              <Link
                href="/forgot-password"
                className="text-sm text-zrp-darkRed dark:text-zrp-red hover:underline"
              >
                {t("auth.forgotPassword")}
              </Link>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-zrp-darkRed hover:bg-zrp-red text-white py-3.5 sm:py-3 rounded-full font-semibold disabled:opacity-50 disabled:cursor-not-allowed transition shadow-sm text-base"
            >
              {loading ? t("auth.signingIn") : t("auth.signIn")}
            </button>
          </form>

          <p className="text-center text-sm text-gray-600 dark:text-gray-400 mt-6">
            {t("auth.noAccount")}{" "}
            <Link href="/signup" className="text-zrp-darkRed dark:text-zrp-red hover:underline font-medium">
              {t("auth.signUp")}
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
