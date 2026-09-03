"use client";

import { useState, useEffect } from "react";
import { signIn } from "next-auth/react";
import Link from "next/link";
import Image from "next/image";
import PasswordInput from "@/components/PasswordInput";
import { useLanguage } from "@/contexts/LanguageContext";
import GoogleIcon from "@/components/icons/GoogleIcon";
import AppleIcon from "@/components/icons/AppleIcon";
import { useDebounce } from "@/hooks/useDebounce";
import { Check, X, Loader2 } from "lucide-react";
import { isNativeApp, nativeGoogleSignIn, nativeAppleSignIn } from "@/lib/nativeAuth";
import type { TranslationKey } from "@/lib/translations";

type UsernameStatus = "idle" | "checking" | "available" | "taken" | "invalid";

export default function SignupPage() {
  const { t } = useLanguage();
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [appleLoading, setAppleLoading] = useState(false);
  // Set once registration succeeds - see handleSubmit for why this is the
  // normal outcome for every credentials signup, not an edge case.
  const [registeredEmail, setRegisteredEmail] = useState<string | null>(null);
  const [resendLoading, setResendLoading] = useState(false);
  const [resendMessage, setResendMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  // ─── Live username availability check ───────────────────────────
  const [usernameStatus, setUsernameStatus] = useState<UsernameStatus>("idle");
  const [usernameSuggestions, setUsernameSuggestions] = useState<string[]>([]);
  const debouncedUsername = useDebounce(username, 400);

  useEffect(() => {
    const trimmed = debouncedUsername.trim();
    if (trimmed.length === 0) {
      setUsernameStatus("idle");
      setUsernameSuggestions([]);
      return;
    }
    if (trimmed.length < 3 || trimmed.length > 20 || !/^[a-zA-Z0-9_]+$/.test(trimmed)) {
      setUsernameStatus("invalid");
      setUsernameSuggestions([]);
      return;
    }

    let cancelled = false;
    setUsernameStatus("checking");

    fetch(`/api/auth/check-username?username=${encodeURIComponent(trimmed)}`)
      .then((res) => res.json())
      .then((data) => {
        if (cancelled) return;
        if (data.available) {
          setUsernameStatus("available");
          setUsernameSuggestions([]);
        } else {
          setUsernameStatus("taken");
          setUsernameSuggestions(data.suggestions || []);
        }
      })
      .catch(() => {
        if (!cancelled) setUsernameStatus("idle");
      });

    return () => {
      cancelled = true;
    };
  }, [debouncedUsername]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (usernameStatus === "taken") {
      setError("That username is taken. Pick a suggestion below or try another.");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, username, email, password }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || t("auth.errSomethingWrong"));
        setLoading(false);
        return;
      }

      const result = await signIn("credentials", {
        email,
        password,
        redirect: false,
        callbackUrl: "/",
      });

      // Every newly registered account starts unverified, and
      // authorize() in lib/auth.ts deliberately refuses to sign in an
      // unverified user - so this sign-in attempt failing here is the
      // expected outcome for every credentials signup, not a rare edge
      // case. Previously this result was never checked, so the user got
      // no error but also never actually got signed in: they were just
      // sent to "/", which middleware then silently bounced back to
      // /login with zero explanation that an account was even created
      // or that a verification email was on its way.
      if (result?.error) {
        setRegisteredEmail(email);
        setLoading(false);
        return;
      }

      window.location.href = "/";
    } catch (err) {
      setError(t("auth.errTryAgain"));
      setLoading(false);
    }
  };

  const handleResendVerification = async () => {
    if (!registeredEmail) return;
    setResendLoading(true);
    setResendMessage(null);

    try {
      const res = await fetch("/api/auth/resend-verification", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: registeredEmail }),
      });
      const data = await res.json().catch(() => ({}));

      if (res.ok) {
        setResendMessage({ type: "success", text: t("auth.resendVerificationSuccess") });
      } else {
        const key: TranslationKey =
          data.code === "ALREADY_VERIFIED"
            ? "auth.resendVerificationAlreadyVerified"
            : "auth.resendVerificationError";
        setResendMessage({ type: "error", text: t(key) });
      }
    } catch (err) {
      console.error("Resend verification error:", err);
      setResendMessage({ type: "error", text: t("auth.resendVerificationError") });
    } finally {
      setResendLoading(false);
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

  const usernameFieldBorder =
    usernameStatus === "available"
      ? "border-green-500 focus:ring-green-500"
      : usernameStatus === "taken" || usernameStatus === "invalid"
      ? "border-red-400 focus:ring-red-400"
      : "border-gray-300 dark:border-gray-600 focus:ring-zrp-red";

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
          {/* ─── Mobile & tablet hero ──────────────────────────────────── */}
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
              {t("auth.joinCommunity")}
            </h2>
          </div>

          {registeredEmail ? (
            <div className="text-center">
              <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-xl p-5">
                <p className="font-semibold text-green-800 dark:text-green-300">
                  {t("auth.signupSuccessTitle")}
                </p>
                <p className="text-sm text-green-700 dark:text-green-400 mt-2">
                  {t("auth.signupSuccessBody", { email: registeredEmail })}
                </p>
              </div>

              <button
                type="button"
                onClick={handleResendVerification}
                disabled={resendLoading}
                className="text-zrp-red dark:text-zrp-red underline text-sm hover:text-zrp-darkRed dark:hover:text-red-300 disabled:opacity-50 disabled:cursor-not-allowed mt-4"
              >
                {resendLoading ? t("auth.resendVerificationSending") : t("auth.resendVerification")}
              </button>
              {resendMessage && (
                <p
                  className={`text-xs mt-1 ${
                    resendMessage.type === "success"
                      ? "text-green-600 dark:text-green-400"
                      : "text-red-600 dark:text-red-400"
                  }`}
                >
                  {resendMessage.text}
                </p>
              )}

              <p className="text-center text-sm text-gray-600 dark:text-gray-400 mt-6">
                <Link href="/login" className="text-zrp-darkRed dark:text-zrp-red hover:underline font-medium">
                  {t("auth.signIn")}
                </Link>
              </p>
            </div>
          ) : (
            <>
              <button
                type="button"
                onClick={handleGoogleSignIn}
                disabled={googleLoading}
                className="w-full flex items-center justify-center gap-3 border border-gray-300 dark:border-gray-600 rounded-full py-3.5 sm:py-3 font-medium text-gray-700 dark:text-gray-100 bg-white dark:bg-white/5 hover:bg-gray-50 dark:hover:bg-white/10 shadow-sm transition disabled:opacity-50 disabled:cursor-not-allowed text-base"
              >
                <GoogleIcon className="w-5 h-5" />
                {googleLoading ? t("auth.signingIn") : t("auth.continueWithGoogle")}
              </button>

              <button
                type="button"
                onClick={handleAppleSignIn}
                disabled={appleLoading}
                className="w-full flex items-center justify-center gap-3 rounded-full py-3.5 sm:py-3 font-medium text-white bg-black hover:bg-gray-900 shadow-sm transition disabled:opacity-50 disabled:cursor-not-allowed text-base mt-3"
              >
                <AppleIcon className="w-5 h-5" />
                {appleLoading ? t("auth.signingIn") : t("auth.continueWithApple")}
              </button>

              <div className="flex items-center gap-3 my-6">
                <div className="flex-1 h-px bg-gray-200 dark:bg-gray-700" />
                <span className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide">{t("auth.or")}</span>
                <div className="flex-1 h-px bg-gray-200 dark:bg-gray-700" />
              </div>

              <form onSubmit={handleSubmit} className="space-y-4">
                {error && (
                  <div className="bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 p-3 rounded-lg text-sm">
                    {error}
                  </div>
                )}

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    {t("auth.fullName")}
                  </label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full px-4 py-3.5 sm:py-3 border border-gray-300 dark:border-gray-600 rounded-xl focus:ring-2 focus:ring-zrp-red focus:border-transparent bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-base"
                    placeholder="John Doe"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    {t("auth.username")}
                  </label>
                  <div className="relative">
                    <input
                      type="text"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      className={`w-full px-4 py-3.5 sm:py-3 pr-10 border rounded-xl focus:ring-2 focus:border-transparent bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-base ${usernameFieldBorder}`}
                      placeholder="johndoe"
                      required
                      autoCapitalize="none"
                      autoCorrect="off"
                    />
                    <div className="absolute right-3 top-1/2 -translate-y-1/2">
                      {usernameStatus === "checking" && (
                        <Loader2 className="w-4 h-4 text-gray-400 animate-spin" />
                      )}
                      {usernameStatus === "available" && (
                        <Check className="w-4 h-4 text-green-500" />
                      )}
                      {(usernameStatus === "taken" || usernameStatus === "invalid") && (
                        <X className="w-4 h-4 text-red-400" />
                      )}
                    </div>
                  </div>

                  {usernameStatus === "invalid" && username.trim().length > 0 && (
                    <p className="text-xs text-red-500 mt-1">
                      3-20 characters, letters/numbers/underscores only
                    </p>
                  )}

                  {usernameStatus === "taken" && (
                    <div className="mt-2">
                      <p className="text-xs text-red-500">That username is taken.</p>
                      {usernameSuggestions.length > 0 && (
                        <div className="flex flex-wrap gap-2 mt-1.5">
                          {usernameSuggestions.map((s) => (
                            <button
                              key={s}
                              type="button"
                              onClick={() => setUsername(s)}
                              className="text-xs px-2.5 py-1 rounded-full bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 hover:bg-zrp-red hover:text-white transition"
                            >
                              {s}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    {t("auth.email")}
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

                <PasswordInput
                  id="password"
                  name="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  label={t("auth.password")}
                  placeholder={t("auth.createPassword")}
                  required
                  autoComplete="new-password"
                />

                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  {t("auth.passwordMinLength")}
                </p>

                <button
                  type="submit"
                  disabled={loading || usernameStatus === "checking"}
                  className="w-full bg-zrp-darkRed hover:bg-zrp-red text-white py-3.5 sm:py-3 rounded-full font-semibold disabled:opacity-50 disabled:cursor-not-allowed transition shadow-sm text-base"
                >
                  {loading ? t("auth.creatingAccount") : t("auth.createAccount")}
                </button>
              </form>

              <p className="text-center text-sm text-gray-600 dark:text-gray-400 mt-6">
                {t("auth.alreadyHaveAccount")}{" "}
                <Link href="/login" className="text-zrp-darkRed dark:text-zrp-red hover:underline font-medium">
                  {t("auth.signIn")}
                </Link>
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
