"use client";

import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Check, X, Globe, MapPin, User, Key, Calendar, Camera, Trash2, Loader2,
  BellOff, ChevronRight, Ban, Mail, DollarSign, TrendingUp, Wallet
} from "lucide-react";
import { useUploadThing } from "@/lib/uploadthing-client";
import EmailPreferences from "@/components/EmailPreferences";
import PasswordInput from "@/components/PasswordInput";
import LocationAutocomplete from "@/components/LocationAutocomplete";
import { getPlanLimits } from "@/lib/limits";
import CustomUrlSettings from "@/components/CustomUrlSettings";
import { useLanguage } from "@/contexts/LanguageContext";

interface UserData {
  id: string;
  username: string;
  name: string;
  email: string;
  bio: string | null;
  location: string | null;
  country: string | null;
  website: string | null;
  avatarUrl: string | null;
  createdAt: string;
  usernameChangedAt: string | null;
  publicLikes: boolean;
  publicFollowing: boolean;
  customUrl: string | null;
  solanaWallet: string | null; // ✅ added
}

interface CreatorProfile {
  id: string;
  tipsEnabled: boolean;
  tipsMessage: string | null;
  premiumPostsEnabled: boolean;
  totalEarnings: number;
  balance: number;
  totalTips: number;
  totalPremiumRevenue: number;
  totalWithdrawn: number;
}

export default function SettingsPage() {
  const { data: session, status, update } = useSession();
  const router = useRouter();
  const { t, language } = useLanguage();
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [userData, setUserData] = useState<UserData | null>(null);

  // ─── Creator monetisation state ──────────────────────────────────
  const [creatorProfile, setCreatorProfile] = useState<CreatorProfile | null>(null);
  const [loadingCreator, setLoadingCreator] = useState(false);

  // ─── Solana wallet state ──────────────────────────────────────────
  const [solanaWallet, setSolanaWallet] = useState("");
  const [updatingWallet, setUpdatingWallet] = useState(false);

  // Form states
  const [name, setName] = useState("");
  const [bio, setBio] = useState("");
  const [location, setLocation] = useState("");
  const [country, setCountry] = useState("");
  const [website, setWebsite] = useState("");
  const [newUsername, setNewUsername] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  // Email change states
  const [newEmail, setNewEmail] = useState("");
  const [emailPassword, setEmailPassword] = useState("");
  const [updatingEmail, setUpdatingEmail] = useState(false);
  const [emailMessage, setEmailMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Privacy states
  const [publicLikes, setPublicLikes] = useState(true);
  const [publicFollowing, setPublicFollowing] = useState(true);
  const [updatingPrivacy, setUpdatingPrivacy] = useState(false);

  // Loading states for each section
  const [updatingProfile, setUpdatingProfile] = useState(false);
  const [updatingUsername, setUpdatingUsername] = useState(false);
  const [updatingPassword, setUpdatingPassword] = useState(false);

  // Avatar states (using Uploadthing)
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);

  const [usernameError, setUsernameError] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [usernameCooldown, setUsernameCooldown] = useState<number | null>(null);

  // ─── Uploadthing hook for avatar ──────────────────────────────────
  const { startUpload } = useUploadThing("avatar", {
    onClientUploadComplete: (files) => {
      const url = files[0].ufsUrl;
      setAvatarPreview(url);
      setUploadingAvatar(false);
      // Save the URL to the user profile
      fetch("/api/user/update-avatar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ avatarUrl: url }),
      })
        .then((res) => {
          if (res.ok) {
            setMessage({ type: "success", text: t("settings.successAvatarUpdated") });
            update();
            fetchUserData();
          } else {
            setMessage({ type: "error", text: t("settings.errAvatarSaveFailed") });
          }
        })
        .catch(() => {
          setMessage({ type: "error", text: t("settings.errAvatarUploadFailedGeneric") });
        });
    },
    onUploadError: (error) => {
      setUploadingAvatar(false);
      setMessage({ type: "error", text: t("settings.errUploadFailedRetry") + " " + error.message });
    },
  });

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/login");
    }
  }, [status, router]);

  useEffect(() => {
    if (session?.user) {
      fetchUserData();
      fetchCreatorProfile();
    }
  }, [session]);

  const fetchUserData = async () => {
    try {
      const res = await fetch(`/api/users/${session?.user?.username}`);
      if (res.ok) {
        const data = await res.json();
        setUserData(data);
        setName(data.name || "");
        setBio(data.bio || "");
        setLocation(data.location || "");
        setCountry(data.country || "");
        setWebsite(data.website || "");
        setNewUsername(data.username || "");
        setAvatarPreview(data.avatarUrl || null);
        setPublicLikes(data.publicLikes !== undefined ? data.publicLikes : true);
        setPublicFollowing(data.publicFollowing !== undefined ? data.publicFollowing : true);
        setSolanaWallet(data.solanaWallet || ""); // ✅ set from API

        if (data.usernameChangedAt) {
          const lastChange = new Date(data.usernameChangedAt);
          const daysSince = Math.floor((Date.now() - lastChange.getTime()) / (1000 * 60 * 60 * 24));
          if (daysSince < 30) {
            setUsernameCooldown(30 - daysSince);
          }
        }
      }
    } catch (error) {
      console.error("Error fetching user data:", error);
    }
  };

  // ─── Fetch creator profile ──────────────────────────────────────
  const fetchCreatorProfile = async () => {
    const userPlan = session?.user?.plan || "free";
    // Only Business/Enterprise can have creator profiles
    if (userPlan !== "business" && userPlan !== "enterprise") {
      setCreatorProfile(null);
      return;
    }

    setLoadingCreator(true);
    try {
      const res = await fetch("/api/creator/profile");
      if (res.ok) {
        const data = await res.json();
        if (data.profile) {
          setCreatorProfile(data.profile);
        } else {
          setCreatorProfile(null);
        }
      }
    } catch (error) {
      console.error("Error fetching creator profile:", error);
    } finally {
      setLoadingCreator(false);
    }
  };

  // ─── Avatar upload handler ──────────────────────────────────────────
  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 2 * 1024 * 1024) {
      setMessage({ type: "error", text: t("settings.errFileTooLarge") });
      return;
    }

    const validTypes = ["image/jpeg", "image/png", "image/gif", "image/webp"];
    if (!validTypes.includes(file.type)) {
      setMessage({ type: "error", text: t("settings.errInvalidFileType") });
      return;
    }

    setUploadingAvatar(true);
    setMessage(null);
    try {
      await startUpload([file]);
    } catch (err) {
      setUploadingAvatar(false);
      setMessage({ type: "error", text: t("settings.errUploadFailedRetry") });
    }
  };

  // ─── Update Profile ─────────────────────────────────────────────
  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setUpdatingProfile(true);
    setMessage(null);

    try {
      const res = await fetch("/api/user", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          bio,
          location,
          country,
          website,
        }),
      });

      if (res.ok) {
        await update();
        setMessage({ type: "success", text: t("settings.successProfileUpdated") });
      } else {
        setMessage({ type: "error", text: t("settings.errProfileUpdateFailed") });
      }
    } catch (error) {
      setMessage({ type: "error", text: t("settings.errSomethingWrong") });
    } finally {
      setUpdatingProfile(false);
    }
  };

  // ─── Update Username ────────────────────────────────────────────
  const handleUpdateUsername = async (e: React.FormEvent) => {
    e.preventDefault();
    setUsernameError("");
    setMessage(null);

    if (!newUsername || newUsername.length < 3) {
      setUsernameError(t("settings.errUsernameMinLength"));
      return;
    }

    if (newUsername === userData?.username) {
      setUsernameError(t("settings.errUsernameSame"));
      return;
    }

    if (usernameCooldown && usernameCooldown > 0) {
      setUsernameError(t("settings.errUsernameCooldown", { n: usernameCooldown }));
      return;
    }

    setUpdatingUsername(true);

    try {
      const res = await fetch("/api/user/username", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: newUsername }),
      });

      const data = await res.json();

      if (res.ok) {
        await update();
        setMessage({ type: "success", text: t("settings.successUsernameUpdated") });
        setUsernameCooldown(30);
        setUserData(data.user);
      } else {
        setUsernameError(data.error || t("settings.errUsernameUpdateFailed"));
      }
    } catch (error) {
      setUsernameError(t("settings.errSomethingWrong"));
    } finally {
      setUpdatingUsername(false);
    }
  };

  // ─── Update Password ────────────────────────────────────────────
  const handleUpdatePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordError("");
    setMessage(null);

    if (!currentPassword || !newPassword) {
      setPasswordError(t("settings.errPasswordFieldsRequired"));
      return;
    }

    if (newPassword.length < 6) {
      setPasswordError(t("settings.errPasswordMinLength"));
      return;
    }

    if (newPassword !== confirmPassword) {
      setPasswordError(t("settings.errPasswordsMismatch"));
      return;
    }

    setUpdatingPassword(true);

    try {
      const res = await fetch("/api/user/password", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          currentPassword,
          newPassword,
        }),
      });

      const data = await res.json();

      if (res.ok) {
        setMessage({ type: "success", text: t("settings.successPasswordUpdated") });
        setCurrentPassword("");
        setNewPassword("");
        setConfirmPassword("");
      } else {
        setPasswordError(data.error || t("settings.errPasswordUpdateFailed"));
      }
    } catch (error) {
      setPasswordError(t("settings.errSomethingWrong"));
    } finally {
      setUpdatingPassword(false);
    }
  };

  // ─── Update Email ──────────────────────────────────────────────────
  const handleUpdateEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    setUpdatingEmail(true);
    setEmailMessage(null);

    try {
      const res = await fetch("/api/user/email", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          currentPassword: emailPassword,
          newEmail,
        }),
      });

      const data = await res.json();
      if (res.ok) {
        setEmailMessage({ type: "success", text: data.message });
        setNewEmail("");
        setEmailPassword("");
        update();
      } else {
        setEmailMessage({ type: "error", text: data.error || t("settings.errEmailSendFailed") });
      }
    } catch (error) {
      setEmailMessage({ type: "error", text: t("settings.errSomethingWrong") });
    } finally {
      setUpdatingEmail(false);
    }
  };

  // ─── Update Privacy ──────────────────────────────────────────────
  const handleUpdatePrivacy = async (e: React.FormEvent) => {
    e.preventDefault();
    setUpdatingPrivacy(true);
    setMessage(null);

    try {
      const res = await fetch("/api/user/privacy", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ publicLikes, publicFollowing }),
      });

      const data = await res.json();
      if (res.ok) {
        setPublicLikes(data.publicLikes);
        setPublicFollowing(data.publicFollowing);
        setMessage({ type: "success", text: t("settings.successPrivacyUpdated") });
        await update();
      } else {
        setMessage({ type: "error", text: data.error || t("settings.errPrivacyUpdateFailed") });
      }
    } catch (error) {
      console.error("Error updating privacy:", error);
      setMessage({ type: "error", text: t("settings.errSomethingWrong") });
    } finally {
      setUpdatingPrivacy(false);
    }
  };

  // ─── Update Solana Wallet ──────────────────────────────────────
  const handleUpdateSolanaWallet = async (e: React.FormEvent) => {
    e.preventDefault();
    setUpdatingWallet(true);
    setMessage(null);

    try {
      const res = await fetch("/api/user", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ solanaWallet: solanaWallet.trim() }),
      });

      if (res.ok) {
        await update();
        setMessage({ type: "success", text: t("settings.successWalletUpdated") });
        fetchUserData(); // refresh data
      } else {
        const data = await res.json();
        setMessage({ type: "error", text: data.error || t("settings.errWalletUpdateFailed") });
      }
    } catch (error) {
      setMessage({ type: "error", text: t("settings.errSomethingWrong") });
    } finally {
      setUpdatingWallet(false);
    }
  };

  if (status === "loading" || !userData) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="w-6 h-6 animate-spin text-zrp-red" />
      </div>
    );
  }

  const localeMap: Record<string, string> = { en: "en-US", fr: "fr-FR", de: "de-DE", it: "it-IT" };
  const formatDate = (date: string) => {
    return new Date(date).toLocaleDateString(localeMap[language] || "en-US", {
      month: "long",
      day: "numeric",
      year: "numeric",
    });
  };

  const currentEmail = session?.user?.email || userData?.email || "Not available";
  const userPlan = session?.user?.plan || "free";
  const planLimits = getPlanLimits(userPlan);
  const isCreatorEligible = userPlan === "business" || userPlan === "enterprise";

  const planNoteMap: Record<string, string> = {
    free: t("settings.planNoteFree"),
    pro: t("settings.planNotePro"),
    business: t("settings.planNoteBusiness"),
    enterprise: t("settings.planNoteEnterprise"),
  };

  return (
    <div className="max-w-2xl mx-auto py-4 px-4">
      <div className="mb-4">
        <Link href={`/profile/${session?.user?.username}`} className="text-zrp-red hover:underline text-sm">
          {t("settings.backToProfile")}
        </Link>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white mt-2">{t("settings.title")}</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400">{t("settings.subtitle")}</p>
      </div>

      {message && (
        <div className={`p-3 rounded-lg mb-4 ${
          message.type === "success"
            ? "bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400 border border-green-200 dark:border-green-800"
            : "bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 border border-red-200 dark:border-red-800"
        }`}>
          {message.text}
        </div>
      )}

      {/* ─── Account Info ──────────────────────────────────────────── */}
      <div className="bg-white dark:bg-zrp-deepBlack rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6 mb-4">
        <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-4">{t("settings.accountInfo")}</h2>
        <div className="flex items-center gap-3 text-sm text-gray-600 dark:text-gray-400">
          <Calendar className="w-4 h-4" />
          <span>{t("settings.joined", { date: formatDate(userData.createdAt) })}</span>
        </div>
        <div className="flex items-center gap-3 text-sm text-gray-600 dark:text-gray-400 mt-1">
          <Mail className="w-4 h-4" />
          <span>{currentEmail}</span>
        </div>
      </div>

      {/* ─── Change Email Section ───────────────────────────────────── */}
      <div className="bg-white dark:bg-zrp-deepBlack rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6 mb-4">
        <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-4">{t("settings.changeEmail")}</h2>
        <form onSubmit={handleUpdateEmail} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              {t("settings.currentEmail")}
            </label>
            <p className="text-gray-600 dark:text-gray-400">{currentEmail}</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              {t("settings.newEmail")}
            </label>
            <input
              type="email"
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-zrp-red focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              placeholder={t("settings.newEmailPlaceholder")}
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              {t("settings.currentPasswordRequired")}
            </label>
            <input
              type="password"
              value={emailPassword}
              onChange={(e) => setEmailPassword(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-zrp-red focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              placeholder={t("settings.currentPasswordPlaceholder")}
              required
            />
          </div>
          {emailMessage && (
            <p className={`text-sm ${emailMessage.type === "success" ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}`}>
              {emailMessage.text}
            </p>
          )}
          <button
            type="submit"
            disabled={updatingEmail}
            className="w-full bg-zrp-red text-white py-2 rounded-lg font-medium hover:bg-zrp-darkRed disabled:opacity-50 disabled:cursor-not-allowed transition"
          >
            {updatingEmail ? t("settings.sending") : t("settings.sendVerificationEmail")}
          </button>
        </form>
        <p className="text-xs text-gray-400 dark:text-gray-500 mt-2">
          {t("settings.emailVerifyNote")}
        </p>
      </div>

      {/* ─── Your Plan Section ────────────────────────────────────── */}
      <div className="bg-white dark:bg-zrp-deepBlack rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6 mb-4">
        <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-4">{t("settings.yourPlan")}</h2>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-gray-600 dark:text-gray-400">{t("settings.currentPlan")}</p>
            <p className="text-xl font-bold text-gray-900 dark:text-white capitalize">
              {userPlan}
            </p>
          </div>
          <Link
            href="/pricing"
            className="px-4 py-2 bg-zrp-red text-white rounded-lg font-medium hover:bg-zrp-darkRed transition"
          >
            {t("settings.upgradePlan")}
          </Link>
        </div>

        <div className="mt-4 p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
          <p className="text-xs text-gray-500 dark:text-gray-400">
            {planNoteMap[userPlan]}
          </p>
        </div>

        <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
          <div className="text-center p-2 bg-gray-50 dark:bg-gray-700/30 rounded-lg">
            <p className="font-medium text-gray-900 dark:text-white">{t("settings.posts")}</p>
            <p className="text-gray-500 dark:text-gray-400">
              {planLimits.postLength === 999999 ? "∞" : planLimits.postLength}
            </p>
          </div>
          <div className="text-center p-2 bg-gray-50 dark:bg-gray-700/30 rounded-lg">
            <p className="font-medium text-gray-900 dark:text-white">{t("settings.images")}</p>
            <p className="text-gray-500 dark:text-gray-400">
              {planLimits.imagesPerPost === 999999 ? "∞" : planLimits.imagesPerPost}
            </p>
          </div>
          <div className="text-center p-2 bg-gray-50 dark:bg-gray-700/30 rounded-lg">
            <p className="font-medium text-gray-900 dark:text-white">{t("settings.video")}</p>
            <p className="text-gray-500 dark:text-gray-400">{planLimits.videoUploadMB}MB</p>
          </div>
          <div className="text-center p-2 bg-gray-50 dark:bg-gray-700/30 rounded-lg">
            <p className="font-medium text-gray-900 dark:text-white">{t("settings.scheduled")}</p>
            <p className="text-gray-500 dark:text-gray-400">
              {planLimits.scheduledPostsPerMonth === 999999 ? "∞" : planLimits.scheduledPostsPerMonth}
            </p>
          </div>
        </div>
      </div>

      {/* ─── Creator Monetisation Section ──────────────────────────── */}
      {isCreatorEligible && (
        <div className="bg-white dark:bg-zrp-deepBlack rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6 mb-4">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold text-gray-900 dark:text-white">{t("settings.creatorMonetisation")}</h2>
            <Link
              href="/creator/dashboard"
              className="inline-flex items-center gap-1.5 text-sm bg-zrp-red text-white px-4 py-2 rounded-lg font-medium hover:bg-zrp-darkRed transition"
            >
              <TrendingUp className="w-4 h-4" />
              {t("settings.dashboard")}
            </Link>
          </div>

          {loadingCreator ? (
            <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
              <Loader2 className="w-4 h-4 animate-spin" />
              {t("action.loading")}
            </div>
          ) : creatorProfile ? (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
              <div className="p-3 bg-gray-50 dark:bg-gray-700/30 rounded-lg">
                <p className="text-gray-500 dark:text-gray-400 text-xs">{t("settings.balance")}</p>
                <p className="font-bold text-gray-900 dark:text-white">
                  ${creatorProfile.balance.toFixed(2)}
                </p>
              </div>
              <div className="p-3 bg-gray-50 dark:bg-gray-700/30 rounded-lg">
                <p className="text-gray-500 dark:text-gray-400 text-xs">{t("settings.totalTips")}</p>
                <p className="font-bold text-gray-900 dark:text-white">
                  ${creatorProfile.totalTips.toFixed(2)}
                </p>
              </div>
              <div className="p-3 bg-gray-50 dark:bg-gray-700/30 rounded-lg">
                <p className="text-gray-500 dark:text-gray-400 text-xs">{t("settings.premiumRevenue")}</p>
                <p className="font-bold text-gray-900 dark:text-white">
                  ${creatorProfile.totalPremiumRevenue.toFixed(2)}
                </p>
              </div>
              <div className="p-3 bg-gray-50 dark:bg-gray-700/30 rounded-lg">
                <p className="text-gray-500 dark:text-gray-400 text-xs">{t("settings.withdrawn")}</p>
                <p className="font-bold text-gray-900 dark:text-white">
                  ${creatorProfile.totalWithdrawn.toFixed(2)}
                </p>
              </div>
            </div>
          ) : (
            <div className="text-sm text-gray-500 dark:text-gray-400">
              <p>{t("settings.creatorCta")}</p>
              <Link
                href="/creator/dashboard"
                className="inline-block mt-2 text-zrp-red hover:underline"
              >
                {t("settings.getStarted")}
              </Link>
            </div>
          )}

          <p className="text-xs text-gray-400 dark:text-gray-500 mt-3">
            {t("settings.platformFeeNote")}
          </p>
        </div>
      )}

      {/* ─── Profile Picture ────────────────────────────────────────── */}
      <div className="bg-white dark:bg-zrp-deepBlack rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6 mb-4">
        <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-4">{t("settings.profilePicture")}</h2>
        <div className="flex items-center gap-6">
          <div className="relative">
            <div className="w-24 h-24 rounded-full bg-gray-100 dark:bg-gray-700 flex items-center justify-center text-gray-600 dark:text-gray-300 text-3xl font-bold overflow-hidden">
              {avatarPreview ? (
                <img
                  src={avatarPreview}
                  alt="Profile"
                  className="w-full h-full object-cover"
                />
              ) : (
                userData?.name?.[0]?.toUpperCase() || "?"
              )}
            </div>
            <label
              htmlFor="avatar-upload"
              className="absolute bottom-0 right-0 bg-zrp-red text-white rounded-full p-1.5 cursor-pointer hover:bg-zrp-darkRed transition"
            >
              <Camera className="w-4 h-4" />
            </label>
            <input
              id="avatar-upload"
              type="file"
              accept="image/*"
              onChange={handleAvatarUpload}
              className="hidden"
              disabled={uploadingAvatar}
            />
          </div>
          <div>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              {t("settings.uploadProfilePicNote")}
            </p>
            <p className="text-xs text-gray-400 dark:text-gray-500">
              {t("settings.supportedFormats")}
            </p>
            {uploadingAvatar && (
              <p className="text-sm text-zrp-red dark:text-zrp-red mt-1">{t("settings.uploading")}</p>
            )}
          </div>
        </div>
      </div>

      {/* ─── Profile Section ────────────────────────────────────────── */}
      <div className="bg-white dark:bg-zrp-deepBlack rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6 mb-4">
        <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-4">{t("settings.profile")}</h2>
        <form onSubmit={handleUpdateProfile} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              {t("settings.displayName")}
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-zrp-red focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              maxLength={50}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              {t("settings.bio")}
            </label>
            <textarea
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              rows={3}
              className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-zrp-red focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white resize-none"
              placeholder={t("settings.bioPlaceholder")}
              maxLength={160}
            />
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">{bio.length}/160</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <LocationAutocomplete
                value={location}
                onChange={(val) => setLocation(val)}
                placeholder={t("settings.cityPlaceholder")}
                label={t("settings.city")}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                {t("settings.country")}
              </label>
              <input
                type="text"
                value={country}
                onChange={(e) => setCountry(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-zrp-red focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                placeholder={t("settings.countryPlaceholder")}
                maxLength={50}
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              {t("settings.website")}
            </label>
            <div className="relative">
              <Globe className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="url"
                value={website}
                onChange={(e) => setWebsite(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-zrp-red focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                placeholder={t("settings.websitePlaceholder")}
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={updatingProfile}
            className="w-full bg-zrp-red text-white py-2 rounded-lg font-medium hover:bg-zrp-darkRed disabled:opacity-50 disabled:cursor-not-allowed transition"
          >
            {updatingProfile ? t("settings.saving") : t("settings.updateProfile")}
          </button>
        </form>
      </div>

      {/* ─── Custom Profile URL ────────────────────────────────────── */}
      <div className="bg-white dark:bg-zrp-deepBlack rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6 mb-4">
        <CustomUrlSettings
          currentUsername={userData.username}
          currentCustomUrl={userData.customUrl}
          onUpdate={() => {
            fetchUserData();
            update();
          }}
        />
      </div>

      {/* ─── Solana Wallet (for direct tips) ───────────────────────── */}
      <div className="bg-white dark:bg-zrp-deepBlack rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6 mb-4">
        <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-4">{t("settings.solanaWalletTitle")}</h2>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-2">
          {t("settings.solanaWalletDesc")}
        </p>
        <form onSubmit={handleUpdateSolanaWallet} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              {t("settings.walletAddress")}
            </label>
            <div className="relative">
              <Wallet className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                value={solanaWallet}
                onChange={(e) => setSolanaWallet(e.target.value)}
                placeholder={t("settings.walletAddressPlaceholder")}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-zrp-red focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                disabled={updatingWallet}
              />
            </div>
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
              {t("settings.walletAddressNote")}
            </p>
          </div>
          <button
            type="submit"
            disabled={updatingWallet}
            className="w-full bg-zrp-red text-white py-2 rounded-lg font-medium hover:bg-zrp-darkRed disabled:opacity-50 disabled:cursor-not-allowed transition"
          >
            {updatingWallet ? t("settings.saving") : t("settings.saveWallet")}
          </button>
        </form>
      </div>

      {/* ─── Username Section ────────────────────────────────────────── */}
      <div className="bg-white dark:bg-zrp-deepBlack rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6 mb-4">
        <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-4">{t("settings.usernameTitle")}</h2>

        {usernameCooldown !== null && usernameCooldown > 0 && (
          <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 text-yellow-800 dark:text-yellow-300 text-sm p-3 rounded-lg mb-4">
            {t("settings.usernameCooldownBanner", { n: usernameCooldown })}
          </div>
        )}

        <form onSubmit={handleUpdateUsername} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              {t("settings.currentUsername")}
            </label>
            <div className="flex items-center gap-2">
              <span className="text-gray-600 dark:text-gray-400">@{userData.username}</span>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              {t("settings.newUsername")}
            </label>
            <div className="relative">
              <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                value={newUsername}
                onChange={(e) => setNewUsername(e.target.value.toLowerCase())}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-zrp-red focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                placeholder={t("settings.newUsernamePlaceholder")}
                minLength={3}
                maxLength={20}
                disabled={usernameCooldown !== null && usernameCooldown > 0}
              />
            </div>
            {usernameError && (
              <p className="text-red-500 dark:text-red-400 text-sm mt-1">{usernameError}</p>
            )}
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
              {t("settings.usernameHint")}
            </p>
          </div>

          <button
            type="submit"
            disabled={updatingUsername || (usernameCooldown !== null && usernameCooldown > 0)}
            className="w-full bg-zrp-red text-white py-2 rounded-lg font-medium hover:bg-zrp-darkRed disabled:opacity-50 disabled:cursor-not-allowed transition"
          >
            {updatingUsername ? t("settings.updating") : t("settings.changeUsername")}
          </button>
        </form>
      </div>

      {/* ─── Password Section ────────────────────────────────────────── */}
      <div className="bg-white dark:bg-zrp-deepBlack rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6 mb-4">
        <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-4">{t("settings.changePasswordTitle")}</h2>
        <form onSubmit={handleUpdatePassword} className="space-y-4">
          {passwordError && (
            <p className="text-red-500 dark:text-red-400 text-sm">{passwordError}</p>
          )}

          <PasswordInput
            id="currentPassword"
            name="currentPassword"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            label={t("settings.currentPassword")}
            placeholder={t("settings.currentPasswordPlaceholder2")}
            required
            autoComplete="current-password"
          />

          <PasswordInput
            id="newPassword"
            name="newPassword"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            label={t("settings.newPassword")}
            placeholder={t("settings.newPasswordPlaceholder")}
            required
            autoComplete="new-password"
          />

          <PasswordInput
            id="confirmPassword"
            name="confirmPassword"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            label={t("settings.confirmNewPassword")}
            placeholder={t("settings.confirmNewPasswordPlaceholder")}
            required
            autoComplete="new-password"
          />

          <button
            type="submit"
            disabled={updatingPassword}
            className="w-full bg-zrp-red text-white py-2 rounded-lg font-medium hover:bg-zrp-darkRed disabled:opacity-50 disabled:cursor-not-allowed transition"
          >
            {updatingPassword ? t("settings.updating") : t("settings.changePassword")}
          </button>
        </form>
      </div>

      {/* ─── Privacy Settings ───────────────────────────────────────── */}
      <div className="bg-white dark:bg-zrp-deepBlack rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6 mb-4">
        <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-4">{t("settings.privacySettings")}</h2>
        <form onSubmit={handleUpdatePrivacy} className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium text-gray-900 dark:text-white">{t("settings.publicLikes")}</p>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                {t("settings.publicLikesDesc")}
              </p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={publicLikes}
                onChange={(e) => setPublicLikes(e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-zrp-red rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-zrp-red"></div>
            </label>
          </div>
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium text-gray-900 dark:text-white">{t("settings.publicFollowing")}</p>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                {t("settings.publicFollowingDesc")}
              </p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={publicFollowing}
                onChange={(e) => setPublicFollowing(e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-zrp-red rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-zrp-red"></div>
            </label>
          </div>
          <button
            type="submit"
            disabled={updatingPrivacy}
            className="w-full bg-zrp-red text-white py-2 rounded-lg font-medium hover:bg-zrp-darkRed disabled:opacity-50 disabled:cursor-not-allowed transition"
          >
            {updatingPrivacy ? t("settings.saving") : t("settings.updatePrivacy")}
          </button>
        </form>
      </div>

      {/* ─── Email Preferences Section ────────────────────────────── */}
      <div className="bg-white dark:bg-zrp-deepBlack rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6 mb-4">
        <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-4">{t("settings.emailNotifications")}</h2>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
          {t("settings.emailNotificationsDesc")}
        </p>
        <EmailPreferences />
      </div>

      {/* ─── Privacy Section (existing) ──────────────────────────────── */}
      <div className="bg-white dark:bg-zrp-deepBlack rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6 mb-4">
        <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-4">{t("settings.privacyTitle")}</h2>
        <div className="space-y-2">
          <Link
            href="/settings/muted"
            className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition"
          >
            <div className="flex items-center gap-3">
              <BellOff className="w-5 h-5 text-gray-500" />
              <span className="text-gray-900 dark:text-white">{t("settings.mutedUsers")}</span>
            </div>
            <ChevronRight className="w-5 h-5 text-gray-400" />
          </Link>
          <Link
            href="/settings/blocked"
            className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition"
          >
            <div className="flex items-center gap-3">
              <Ban className="w-5 h-5 text-gray-500" />
              <span className="text-gray-900 dark:text-white">{t("settings.blockedUsers")}</span>
            </div>
            <ChevronRight className="w-5 h-5 text-gray-400" />
          </Link>
        </div>
        <p className="text-xs text-gray-400 dark:text-gray-500 mt-2 pl-2">
          {t("settings.privacyManageNote")}
        </p>
      </div>

      {/* ─── Delete Account Section ──────────────────────────────────── */}
      <div className="bg-white dark:bg-zrp-deepBlack rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6 mb-4">
        <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-4">{t("settings.dangerZone")}</h2>
        <div className="border border-red-200 dark:border-red-800 rounded-lg p-4 bg-red-50 dark:bg-red-900/10">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium text-gray-900 dark:text-white">{t("settings.deleteAccount")}</p>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                {t("settings.deleteAccountDesc")}
              </p>
            </div>
            <Link
              href="/settings/delete"
              className="px-4 py-2 bg-red-600 text-white rounded-lg font-medium hover:bg-red-700 transition"
            >
              <Trash2 className="w-4 h-4 inline mr-1" />
              {t("settings.deleteAccount")}
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
