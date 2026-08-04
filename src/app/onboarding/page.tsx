"use client";

import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Loader2, Check } from "lucide-react";
import LocationAutocomplete from "@/components/LocationAutocomplete"; // ✅ added

interface SuggestedUser {
  id: string;
  username: string;
  name: string | null;
  avatarUrl: string | null;
}

export default function OnboardingPage() {
  const { data: session, update, status } = useSession();
  const router = useRouter();

  const [step, setStep] = useState(0);
  const [name, setName] = useState("");
  const [bio, setBio] = useState("");
  const [location, setLocation] = useState("");
  const [website, setWebsite] = useState("");
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [suggestedUsers, setSuggestedUsers] = useState<SuggestedUser[]>([]);
  const [following, setFollowing] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (step === 1) {
      fetchSuggestedUsers();
    }
  }, [step]);

  const fetchSuggestedUsers = async () => {
    try {
      const res = await fetch("/api/users/suggested");
      if (!res.ok) throw new Error("Failed to fetch suggestions");
      const data = await res.json();
      setSuggestedUsers(data);
    } catch (error) {
      console.error("Error fetching suggested users:", error);
    }
  };

  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setAvatarFile(file);
      const reader = new FileReader();
      reader.onloadend = () => setAvatarPreview(reader.result as string);
      reader.readAsDataURL(file);
    }
  };

  const handleFollowToggle = (userId: string) => {
    setFollowing((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(userId)) newSet.delete(userId);
      else newSet.add(userId);
      return newSet;
    });
  };

  const handleNext = async () => {
    if (step === 0) {
      setSaving(true);
      setError(null);
      try {
        const profileRes = await fetch("/api/user/profile", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name, bio, location, website }),
        });

        if (!profileRes.ok) {
          const errorData = await profileRes.json().catch(() => ({ error: "Unknown error" }));
          console.error("Profile update error:", errorData);
          throw new Error(errorData.error || `Server error: ${profileRes.status}`);
        }

        if (avatarFile) {
          const formData = new FormData();
          formData.append("file", avatarFile);
          const avatarRes = await fetch("/api/user/update-avatar", {
            method: "POST",
            body: formData,
          });
          if (!avatarRes.ok) {
            const err = await avatarRes.json().catch(() => ({ error: "Avatar upload failed" }));
            throw new Error(err.error || "Failed to upload avatar");
          }
        }

        setStep(1);
      } catch (error: any) {
        console.error("Onboarding step 0 error:", error);
        setError(error.message || "Failed to save profile. Please try again.");
      } finally {
        setSaving(false);
      }
    } else if (step === 1) {
      setLoading(true);
      setError(null);
      try {
        // Follow selected users using their username (not ID)
        const selectedUsers = suggestedUsers.filter((user) => following.has(user.id));
        for (const user of selectedUsers) {
          const res = await fetch(`/api/users/${user.username}/follow`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "follow" }),
          });
          if (!res.ok) {
            const err = await res.json().catch(() => ({ error: "Failed to follow user" }));
            throw new Error(err.error || `Failed to follow ${user.username}`);
          }
        }

        const completeRes = await fetch("/api/user/onboarding-complete", {
          method: "POST",
        });
        if (!completeRes.ok) {
          const err = await completeRes.json().catch(() => ({ error: "Failed to complete onboarding" }));
          throw new Error(err.error || "Failed to complete onboarding");
        }

        // ─── Force a full page reload to refresh the session ───
        await update();
        window.location.href = "/";
      } catch (error: any) {
        console.error("Onboarding step 1 error:", error);
        setError(error.message || "Failed to follow users. Please try again.");
      } finally {
        setLoading(false);
      }
    }
  };

  const handleSkip = async () => {
    try {
      const res = await fetch("/api/user/onboarding-complete", {
        method: "POST",
      });
      if (res.ok) {
        await update();
        // Force a hard reload to ensure the session cookie is refreshed
        window.location.href = "/";
      } else {
        const err = await res.json().catch(() => ({ error: "Failed to skip" }));
        throw new Error(err.error || "Failed to skip onboarding");
      }
    } catch (error: any) {
      console.error("Skip error:", error);
      setError(error.message || "Failed to skip. Please try again.");
    }
  };

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/login");
    }
    if (status === "authenticated" && session?.user?.onboardingCompleted) {
      router.push("/");
    }
  }, [status, session, router]);

  if (status === "loading") {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="w-6 h-6 animate-spin text-zrp-red" />
      </div>
    );
  }

  const steps = ["Profile", "Follow", "Done"];

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 dark:bg-zrp-deepBlack px-4 py-8">
      <div className="max-w-2xl w-full bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-6 md:p-8">
        <div className="flex justify-center mb-6">
          <div className="w-12 h-12 bg-zrp-red rounded-full flex items-center justify-center text-white font-bold text-2xl">
            Z
          </div>
        </div>

        <div className="flex items-center gap-2 mb-6">
          {steps.map((label, idx) => (
            <div key={idx} className="flex-1 flex items-center gap-2">
              <div
                className={`flex items-center justify-center w-8 h-8 rounded-full text-sm font-semibold ${
                  idx <= step
                    ? "bg-zrp-red text-white"
                    : "bg-gray-200 dark:bg-gray-700 text-gray-500 dark:text-gray-400"
                }`}
              >
                {idx < step ? <Check className="w-4 h-4" /> : idx + 1}
              </div>
              {idx < steps.length - 1 && (
                <div
                  className={`flex-1 h-1 rounded ${
                    idx < step
                      ? "bg-zrp-red"
                      : "bg-gray-200 dark:bg-gray-700"
                  }`}
                />
              )}
            </div>
          ))}
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-red-700 dark:text-red-300 text-sm">
            {error}
          </div>
        )}

        <div className="mb-6">
          {step === 0 && (
            <div>
              <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-1">
                Welcome to ZRP! 👋
              </h2>
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
                Set up your profile to get started.
              </p>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Profile Picture
                  </label>
                  <div className="flex items-center gap-4">
                    <div className="w-16 h-16 rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden">
                      {avatarPreview ? (
                        <img src={avatarPreview} alt="Avatar" className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-gray-400 text-2xl">
                          {session?.user?.name?.[0]?.toUpperCase() || "?"}
                        </div>
                      )}
                    </div>
                    <label className="cursor-pointer px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm hover:bg-gray-50 dark:hover:bg-gray-700 transition">
                      Upload
                      <input type="file" accept="image/*" onChange={handleAvatarChange} className="hidden" />
                    </label>
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Display Name</label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Your name"
                    className="w-full mt-1 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-zrp-red focus:border-transparent"
                    maxLength={50}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Bio</label>
                  <textarea
                    value={bio}
                    onChange={(e) => setBio(e.target.value)}
                    rows={3}
                    placeholder="Tell us about yourself..."
                    className="w-full mt-1 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-zrp-red focus:border-transparent resize-none"
                    maxLength={160}
                  />
                  <p className="text-xs text-gray-400 mt-1">{bio.length}/160</p>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <LocationAutocomplete
                      value={location}
                      onChange={(val) => setLocation(val)}
                      placeholder="Search for a city..."
                      label="Location"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Website</label>
                    <input
                      type="url"
                      value={website}
                      onChange={(e) => setWebsite(e.target.value)}
                      placeholder="https://your-site.com"
                      className="w-full mt-1 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-zrp-red focus:border-transparent"
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          {step === 1 && (
            <div>
              <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-1">
                Follow some people 🧑‍🤝‍🧑
              </h2>
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
                Choose people to follow and fill your feed.
              </p>
              {suggestedUsers.length === 0 ? (
                <p className="text-gray-500">No suggestions available.</p>
              ) : (
                <div className="space-y-2 max-h-80 overflow-y-auto pr-2">
                  {suggestedUsers.map((user) => {
                    const isFollowing = following.has(user.id);
                    return (
                      <div
                        key={user.id}
                        className="flex items-center justify-between p-3 hover:bg-gray-50 dark:hover:bg-gray-700 rounded-lg transition"
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden">
                            {user.avatarUrl ? (
                              <img src={user.avatarUrl} alt={user.name || user.username} className="w-full h-full object-cover" />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center text-gray-400">
                                {(user.name || user.username)[0].toUpperCase()}
                              </div>
                            )}
                          </div>
                          <div>
                            <p className="font-medium text-gray-900 dark:text-white">
                              {user.name || user.username}
                            </p>
                            <p className="text-sm text-gray-500 dark:text-gray-400">@{user.username}</p>
                          </div>
                        </div>
                        <button
                          onClick={() => handleFollowToggle(user.id)}
                          className={`px-4 py-1.5 rounded-full text-sm font-medium transition ${
                            isFollowing
                              ? "bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600"
                              : "bg-zrp-red text-white hover:bg-zrp-darkRed"
                          }`}
                        >
                          {isFollowing ? "Following" : "Follow"}
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
              <p className="text-xs text-gray-400 mt-2">
                {following.size} user{following.size !== 1 ? "s" : ""} selected
              </p>
            </div>
          )}

          {step === 2 && (
            <div className="text-center">
              <div className="text-6xl mb-4">🎉</div>
              <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
                You're all set!
              </h2>
              <p className="text-gray-500 dark:text-gray-400">
                Your profile is ready. Let's start exploring ZRP Social.
              </p>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between">
          {step < 2 && (
            <button
              onClick={handleSkip}
              className="text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 transition"
            >
              Skip for now
            </button>
          )}
          <div className="flex gap-3 ml-auto">
            {step < 2 && (
              <button
                onClick={step === 0 ? handleNext : handleNext}
                disabled={step === 0 ? saving : loading}
                className="px-6 py-2 bg-zrp-red text-white rounded-full font-medium hover:bg-zrp-darkRed disabled:opacity-50 transition"
              >
                {saving || loading ? (
                  <Loader2 className="w-4 h-4 animate-spin inline mr-1" />
                ) : step === 0 ? (
                  "Continue"
                ) : (
                  "Finish"
                )}
              </button>
            )}
            {step === 2 && (
              <button
                onClick={() => router.push("/")}
                className="px-6 py-2 bg-zrp-red text-white rounded-full font-medium hover:bg-zrp-darkRed transition"
              >
                Go to Home
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
