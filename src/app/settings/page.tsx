"use client";

import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Check, X, Globe, MapPin, User, Key, Calendar, Camera, Trash2, Loader2,
  BellOff, ChevronRight
} from "lucide-react";
import { useUploadThing } from "@/lib/uploadthing-client";
import EmailPreferences from "@/components/EmailPreferences"; // ✅ Added

interface UserData {
  id: string;
  username: string;
  name: string;
  bio: string | null;
  location: string | null;
  country: string | null;
  website: string | null;
  avatarUrl: string | null;
  createdAt: string;
  usernameChangedAt: string | null;
}

export default function SettingsPage() {
  const { data: session, status, update } = useSession();
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [userData, setUserData] = useState<UserData | null>(null);

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
      const url = files[0].url;
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
            setMessage({ type: "success", text: "Avatar updated successfully!" });
            update();
            fetchUserData();
          } else {
            setMessage({ type: "error", text: "Failed to save avatar URL" });
          }
        })
        .catch(() => {
          setMessage({ type: "error", text: "Failed to save avatar" });
        });
    },
    onUploadError: (error) => {
      setUploadingAvatar(false);
      setMessage({ type: "error", text: "Avatar upload failed: " + error.message });
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

  // ─── Avatar upload handler ──────────────────────────────────────────
  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // ─── 2MB limit (matches uploadthing router) ───────────────────
    if (file.size > 2 * 1024 * 1024) {
      setMessage({ type: "error", text: "File too large. Max size is 2MB." });
      return;
    }

    const validTypes = ["image/jpeg", "image/png", "image/gif", "image/webp"];
    if (!validTypes.includes(file.type)) {
      setMessage({ type: "error", text: "Invalid file type. Only JPEG, PNG, GIF, and WebP are allowed." });
      return;
    }

    setUploadingAvatar(true);
    setMessage(null);
    try {
      await startUpload([file]);
    } catch (err) {
      setUploadingAvatar(false);
      setMessage({ type: "error", text: "Upload failed. Please try again." });
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
        setMessage({ type: "success", text: "Profile updated successfully!" });
      } else {
        setMessage({ type: "error", text: "Failed to update profile" });
      }
    } catch (error) {
      setMessage({ type: "error", text: "Something went wrong" });
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
      setUsernameError("Username must be at least 3 characters");
      return;
    }

    if (newUsername === userData?.username) {
      setUsernameError("New username is the same as current");
      return;
    }

    if (usernameCooldown && usernameCooldown > 0) {
      setUsernameError(`You can change your username again in ${usernameCooldown} days`);
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
        setMessage({ type: "success", text: "Username updated successfully! You can change it again in 30 days." });
        setUsernameCooldown(30);
        setUserData(data.user);
      } else {
        setUsernameError(data.error || "Failed to update username");
      }
    } catch (error) {
      setUsernameError("Something went wrong");
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
      setPasswordError("All fields are required");
      return;
    }

    if (newPassword.length < 6) {
      setPasswordError("New password must be at least 6 characters");
      return;
    }

    if (newPassword !== confirmPassword) {
      setPasswordError("Passwords do not match");
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
        setMessage({ type: "success", text: "Password updated successfully!" });
        setCurrentPassword("");
        setNewPassword("");
        setConfirmPassword("");
      } else {
        setPasswordError(data.error || "Failed to update password");
      }
    } catch (error) {
      setPasswordError("Something went wrong");
    } finally {
      setUpdatingPassword(false);
    }
  };

  if (status === "loading" || !userData) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="w-6 h-6 animate-spin text-zrp-red" />
      </div>
    );
  }

  const formatDate = (date: string) => {
    return new Date(date).toLocaleDateString("en-US", {
      month: "long",
      day: "numeric",
      year: "numeric",
    });
  };

  return (
    <div className="max-w-2xl mx-auto py-4 px-4">
      <div className="mb-4">
        <Link href={`/profile/${session?.user?.username}`} className="text-zrp-red hover:underline text-sm">
          ← Back to profile
        </Link>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white mt-2">Settings</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400">Manage your account settings</p>
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
        <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-4">Account Info</h2>
        <div className="flex items-center gap-3 text-sm text-gray-600 dark:text-gray-400">
          <Calendar className="w-4 h-4" />
          <span>Joined {formatDate(userData.createdAt)}</span>
        </div>
      </div>

      {/* ─── Profile Picture ────────────────────────────────────────── */}
      <div className="bg-white dark:bg-zrp-deepBlack rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6 mb-4">
        <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-4">Profile Picture</h2>
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
              Upload a profile picture. Max 2MB.
            </p>
            <p className="text-xs text-gray-400 dark:text-gray-500">
              Supported formats: JPEG, PNG, GIF, WebP
            </p>
            {uploadingAvatar && (
              <p className="text-sm text-zrp-red dark:text-zrp-red mt-1">Uploading...</p>
            )}
          </div>
        </div>
      </div>

      {/* ─── Profile Section ────────────────────────────────────────── */}
      <div className="bg-white dark:bg-zrp-deepBlack rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6 mb-4">
        <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-4">Profile</h2>
        <form onSubmit={handleUpdateProfile} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Display Name
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
              Bio
            </label>
            <textarea
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              rows={3}
              className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-zrp-red focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white resize-none"
              placeholder="Tell us about yourself..."
              maxLength={160}
            />
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">{bio.length}/160</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                City
              </label>
              <div className="relative">
                <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-zrp-red focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  placeholder="City"
                  maxLength={50}
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Country
              </label>
              <input
                type="text"
                value={country}
                onChange={(e) => setCountry(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-zrp-red focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                placeholder="Country"
                maxLength={50}
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Website
            </label>
            <div className="relative">
              <Globe className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="url"
                value={website}
                onChange={(e) => setWebsite(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-zrp-red focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                placeholder="https://your-website.com"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={updatingProfile}
            className="w-full bg-zrp-red text-white py-2 rounded-lg font-medium hover:bg-zrp-darkRed disabled:opacity-50 disabled:cursor-not-allowed transition"
          >
            {updatingProfile ? "Saving..." : "Update Profile"}
          </button>
        </form>
      </div>

      {/* ─── Username Section ────────────────────────────────────────── */}
      <div className="bg-white dark:bg-zrp-deepBlack rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6 mb-4">
        <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-4">Username</h2>

        {usernameCooldown !== null && usernameCooldown > 0 && (
          <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 text-yellow-800 dark:text-yellow-300 text-sm p-3 rounded-lg mb-4">
            ⏳ You can change your username again in {usernameCooldown} days
          </div>
        )}

        <form onSubmit={handleUpdateUsername} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Current Username
            </label>
            <div className="flex items-center gap-2">
              <span className="text-gray-600 dark:text-gray-400">@{userData.username}</span>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              New Username
            </label>
            <div className="relative">
              <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                value={newUsername}
                onChange={(e) => setNewUsername(e.target.value.toLowerCase())}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-zrp-red focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                placeholder="New username"
                minLength={3}
                maxLength={20}
                disabled={usernameCooldown !== null && usernameCooldown > 0}
              />
            </div>
            {usernameError && (
              <p className="text-red-500 dark:text-red-400 text-sm mt-1">{usernameError}</p>
            )}
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
              Username must be 3-20 characters. Can only be changed once every 30 days.
            </p>
          </div>

          <button
            type="submit"
            disabled={updatingUsername || (usernameCooldown !== null && usernameCooldown > 0)}
            className="w-full bg-zrp-red text-white py-2 rounded-lg font-medium hover:bg-zrp-darkRed disabled:opacity-50 disabled:cursor-not-allowed transition"
          >
            {updatingUsername ? "Updating..." : "Change Username"}
          </button>
        </form>
      </div>

      {/* ─── Password Section ────────────────────────────────────────── */}
      <div className="bg-white dark:bg-zrp-deepBlack rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6 mb-4">
        <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-4">Change Password</h2>
        <form onSubmit={handleUpdatePassword} className="space-y-4">
          {passwordError && (
            <p className="text-red-500 dark:text-red-400 text-sm">{passwordError}</p>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Current Password
            </label>
            <div className="relative">
              <Key className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-zrp-red focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                placeholder="Enter current password"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              New Password
            </label>
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-zrp-red focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              placeholder="Enter new password"
              minLength={6}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Confirm New Password
            </label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-zrp-red focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              placeholder="Confirm new password"
            />
          </div>

          <button
            type="submit"
            disabled={updatingPassword}
            className="w-full bg-zrp-red text-white py-2 rounded-lg font-medium hover:bg-zrp-darkRed disabled:opacity-50 disabled:cursor-not-allowed transition"
          >
            {updatingPassword ? "Updating..." : "Change Password"}
          </button>
        </form>
      </div>

      {/* ─── Email Preferences Section ────────────────────────────── */}
      <div className="bg-white dark:bg-zrp-deepBlack rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6 mb-4">
        <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-4">Email Notifications</h2>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
          Choose which email notifications you want to receive.
        </p>
        <EmailPreferences />
      </div>

      {/* ─── Privacy Section ──────────────────────────────────────────── */}
      <div className="bg-white dark:bg-zrp-deepBlack rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6 mb-4">
        <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-4">Privacy</h2>
        <Link
          href="/settings/muted"
          className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition"
        >
          <div className="flex items-center gap-3">
            <BellOff className="w-5 h-5 text-gray-500" />
            <span className="text-gray-900 dark:text-white">Muted Users</span>
          </div>
          <ChevronRight className="w-5 h-5 text-gray-400" />
        </Link>
        <p className="text-xs text-gray-400 dark:text-gray-500 mt-2 pl-2">
          View and manage users you have muted.
        </p>
      </div>

      {/* ─── Delete Account Section ──────────────────────────────────── */}
      <div className="bg-white dark:bg-zrp-deepBlack rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6 mb-4">
        <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-4">Danger Zone</h2>
        <div className="border border-red-200 dark:border-red-800 rounded-lg p-4 bg-red-50 dark:bg-red-900/10">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium text-gray-900 dark:text-white">Delete Account</p>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Permanently delete your account and all associated data. This action cannot be undone.
              </p>
            </div>
            <Link
              href="/settings/delete"
              className="px-4 py-2 bg-red-600 text-white rounded-lg font-medium hover:bg-red-700 transition"
            >
              <Trash2 className="w-4 h-4 inline mr-1" />
              Delete Account
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
