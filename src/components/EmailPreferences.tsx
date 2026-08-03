"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { Loader2 } from "lucide-react";

const preferenceLabels: Record<string, string> = {
  mentions: "Mentions",
  messages: "Direct Messages",
  likes: "Likes on your posts",
  comments: "Comments on your posts",
  follows: "New followers",
  reposts: "Reposts of your posts",
};

export default function EmailPreferences() {
  const { data: session } = useSession();
  const [preferences, setPreferences] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const fetchPreferences = async () => {
    try {
      const res = await fetch("/api/user/email-preferences");
      if (res.ok) {
        const data = await res.json();
        setPreferences(data);
      } else {
        setMessage({ type: "error", text: "Failed to load preferences" });
      }
    } catch (error) {
      setMessage({ type: "error", text: "Something went wrong" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (session) {
      fetchPreferences();
    }
  }, [session]);

  const handleToggle = async (key: string) => {
    const newValue = !preferences[key];
    setPreferences((prev) => ({ ...prev, [key]: newValue }));

    // Optimistically update UI, but we'll also send request
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch("/api/user/email-preferences", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [key]: newValue }),
      });
      if (res.ok) {
        const data = await res.json();
        setPreferences(data.preferences);
        setMessage({ type: "success", text: "Preferences saved!" });
        setTimeout(() => setMessage(null), 3000);
      } else {
        // revert
        setPreferences((prev) => ({ ...prev, [key]: !newValue }));
        setMessage({ type: "error", text: "Failed to save preference" });
      }
    } catch (error) {
      setPreferences((prev) => ({ ...prev, [key]: !newValue }));
      setMessage({ type: "error", text: "Something went wrong" });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="flex justify-center py-4"><Loader2 className="w-6 h-6 animate-spin text-zrp-red" /></div>;
  }

  return (
    <div className="space-y-3">
      {Object.entries(preferences).map(([key, value]) => (
        <div key={key} className="flex items-center justify-between">
          <span className="text-sm text-gray-700 dark:text-gray-300">
            {preferenceLabels[key] || key}
          </span>
          <button
            onClick={() => handleToggle(key)}
            disabled={saving}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition ${
              value ? "bg-zrp-red" : "bg-gray-300 dark:bg-gray-600"
            } ${saving ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white transition ${
                value ? "translate-x-6" : "translate-x-1"
              }`}
            />
          </button>
        </div>
      ))}
      {message && (
        <p className={`text-sm mt-2 ${message.type === "success" ? "text-green-600" : "text-red-600"}`}>
          {message.text}
        </p>
      )}
    </div>
  );
}
