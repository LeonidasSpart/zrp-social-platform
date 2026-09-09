"use client";

import { signIn } from "next-auth/react";
import { useState, useEffect } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";
import PasswordInput from "@/components/PasswordInput";
import AuthShell from "@/components/auth/AuthShell";
import { useLanguage } from "@/contexts/LanguageContext";
import GoogleIcon from "@/components/icons/GoogleIcon";
import AppleIcon from "@/components/icons/AppleIcon";
import { useAppleSignInEnabled } from "@/hooks/useAppleSignInEnabled";
import { isNativeApp, nativeGoogleSignIn, nativeAppleSignIn } from "@/lib/nativeAuth";
import type { TranslationKey } from "@/lib/translations";

// One definition per control shape, so the Google button, the Apple
// button and the submit button can't drift apart the way three
// hand-written class strings did.
const FIELD_CLASS =
  "w-full rounded-xl border border-gray-300 bg-white px-4 py-3.5 text-base text-gray-900 transition focus:border-transparent focus:ring-2 focus:ring-zrp-red dark:border-gray-600 dark:bg-gray-800 dark:text-white sm:py-3";

const SOCIAL_BUTTON_CLASS =
  "flex w-full items-center justify-center gap-3 rounded-full py-3.5 text-base font-medium shadow-sm transition disabled:cursor-not-allowed disabled:opacity-60 sm:py-3";

export default function LoginPage() {
  const searchParams = useSearchParams();
  const { t } = useLanguage();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [appleLoading, setAppleLoading] = useState(false);
  const appleSignInEnabled = useAppleSignInEnabled();
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

  const handleAppleSignIn = async () => {
    setAppleLoading(true);
    if (isNativeApp()) {
      try {
        await nativeAppleSignIn("/");
      } catch {
        setError(t("auth.errSomethingWrong"));
        setAppleLoading(false);
      }
      return;
    }
    await signIn("apple", { callbackUrl: "/" });
  };

  const isVerificationError =
    error.includes("verify") || error.includes("verification");
  const isBannedError = error.includes("banned");

  return (
    <AuthShell heading={t("auth.signIn")} subheading={t("auth.signInSubtitle")}>
      <button
        type="button"
        onClick={handleGoogleSignIn}
        disabled={googleLoading}
        aria-busy={googleLoading}
        className={`${SOCIAL_BUTTON_CLASS} border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:bg-white/5 dark:text-gray-100 dark:hover:bg-white/10`}
      >
        {googleLoading ? (
          <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
        ) : (
          <GoogleIcon className="h-5 w-5" />
        )}
        {googleLoading ? t("auth.signingIn") : t("auth.continueWithGoogle")}
      </button>

      {appleSignInEnabled && (
        <button
          type="button"
          onClick={handleAppleSignIn}
          disabled={appleLoading}
          aria-busy={appleLoading}
          className={`${SOCIAL_BUTTON_CLASS} mt-3 bg-black text-white hover:bg-gray-900`}
        >
          {appleLoading ? (
            <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
          ) : (
            <AppleIcon className="h-5 w-5" />
          )}
          {appleLoading ? t("auth.signingIn") : t("auth.continueWithApple")}
        </button>
      )}

      <div className="my-6 flex items-center gap-3">
        <div className="h-px flex-1 bg-gray-200 dark:bg-gray-700" />
        <span className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">
          {t("auth.or")}
        </span>
        <div className="h-px flex-1 bg-gray-200 dark:bg-gray-700" />
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          // role="alert" + aria-live: this block is injected after a
          // failed submit, so without them a screen-reader user got no
          // announcement at all - the form simply appeared to do
          // nothing. text-red-600 (not 400/500) holds 4.5:1 on white.
          <div
            role="alert"
            aria-live="polite"
            className={`rounded-xl border p-3 text-sm ${
              isVerificationError
                ? "border-gray-300 bg-gray-50 text-gray-800 dark:border-gray-700 dark:bg-gray-800/60 dark:text-gray-200"
                : "border-red-200 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300"
            }`}
          >
            {error}

            {isVerificationError && (
              <div className="mt-2">
                <button
                  type="button"
                  onClick={handleResendVerification}
                  disabled={resendLoading}
                  aria-busy={resendLoading}
                  className="text-sm font-medium text-zrp-darkRed underline hover:text-zrp-red disabled:cursor-not-allowed disabled:opacity-60 dark:text-zrp-red dark:hover:text-red-300"
                >
                  {resendLoading
                    ? t("auth.resendVerificationSending")
                    : t("auth.resendVerification")}
                </button>
                {resendMessage ? (
                  <p
                    className={`mt-1 text-xs ${
                      resendMessage.type === "success"
                        ? "text-green-700 dark:text-green-400"
                        : "text-red-700 dark:text-red-400"
                    }`}
                  >
                    {resendMessage.text}
                  </p>
                ) : (
                  <p className="mt-1 text-xs text-gray-600 dark:text-gray-400">
                    {t("auth.checkSpam")}
                  </p>
                )}
              </div>
            )}

            {isBannedError && (
              <div className="mt-2">
                <a
                  href="mailto:support@zrp.one?subject=Account%20Ban%20Appeal"
                  className="text-sm font-medium text-zrp-darkRed underline hover:text-zrp-red dark:text-zrp-red dark:hover:text-red-300"
                >
                  {t("auth.contactSupport")}
                </a>
                <p className="mt-1 text-xs text-gray-600 dark:text-gray-400">
                  {t("auth.banAppealNote")}
                </p>
              </div>
            )}
          </div>
        )}

        <div>
          {/* htmlFor/id: the label was previously associated with
              nothing, so tapping it did not focus the field and screen
              readers announced an unlabelled text input. */}
          <label
            htmlFor="login-identifier"
            className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300"
          >
            {t("auth.emailOrUsername")}
          </label>
          <input
            id="login-identifier"
            name="identifier"
            type="text"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={FIELD_CLASS}
            placeholder={t("auth.emailOrUsernamePlaceholder")}
            autoComplete="username"
            required
          />
        </div>

        {/* The explicit class list matches FIELD_CLASS so the password
            field sits flush with the one above it - PasswordInput's own
            defaults are shorter and less rounded because Settings, its
            other caller, is built on that smaller field size. */}
        <PasswordInput
          id="login-password"
          name="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          label={t("auth.password")}
          placeholder={t("auth.password")}
          required
          autoComplete="current-password"
          className="rounded-xl px-4 py-3.5 text-base dark:bg-gray-800 sm:py-3"
        />

        <div className="-mt-2 flex justify-end">
          <Link
            href="/forgot-password"
            className="rounded text-sm text-zrp-darkRed hover:underline dark:text-zrp-red"
          >
            {t("auth.forgotPassword")}
          </Link>
        </div>

        <button
          type="submit"
          disabled={loading}
          aria-busy={loading}
          className="flex w-full items-center justify-center gap-2 rounded-full bg-zrp-darkRed py-3.5 text-base font-semibold text-white shadow-sm transition hover:bg-zrp-red disabled:cursor-not-allowed disabled:opacity-60 sm:py-3"
        >
          {loading && <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />}
          {loading ? t("auth.signingIn") : t("auth.signIn")}
        </button>
      </form>

      <p className="mt-6 text-center text-sm text-gray-600 dark:text-gray-400">
        {t("auth.noAccount")}{" "}
        <Link
          href="/signup"
          className="rounded font-medium text-zrp-darkRed hover:underline dark:text-zrp-red"
        >
          {t("auth.signUp")}
        </Link>
      </p>
    </AuthShell>
  );
}
