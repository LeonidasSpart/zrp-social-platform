"use client";

import { useState, useEffect } from "react";
import { Check, X, Loader2 } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";

interface Request {
  id: string;
  requestedPlan: string;
  paymentMethod: string | null;
  message: string | null;
  status: string;
  createdAt: string;
  user: {
    username: string;
    name: string | null;
    email: string;
    plan: string;
  };
}

export default function AdminUpgradeRequests() {
  const { t, language } = useLanguage();
  const [requests, setRequests] = useState<Request[]>([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState<string | null>(null);

  const localeMap: Record<string, string> = { en: "en-US", fr: "fr-FR", de: "de-DE", it: "it-IT" };

  const fetchRequests = async (status = "pending") => {
    setLoading(true);
    try {
      const res = await fetch(`/api/upgrade-requests?status=${status}`);
      if (!res.ok) throw new Error("Failed to fetch");
      const data = await res.json();
      setRequests(data);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRequests();
  }, []);

  const handleAction = async (id: string, action: "approve" | "deny") => {
    setProcessing(id);
    try {
      const res = await fetch(`/api/upgrade-requests/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      if (res.ok) {
        fetchRequests();
      } else {
        alert(t("upgradeReq.errProcessFailed"));
      }
    } catch (error) {
      alert(t("upgradeReq.errSomethingWrong"));
    } finally {
      setProcessing(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-zrp-red" />
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">
        {t("upgradeReq.title")}
      </h1>

      {requests.length === 0 ? (
        <div className="text-center py-12 text-gray-500">{t("upgradeReq.noPending")}</div>
      ) : (
        <div className="space-y-4">
          {requests.map((req) => (
            <div
              key={req.id}
              className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-4"
            >
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-gray-900 dark:text-white">
                      {req.user.name || req.user.username}
                    </span>
                    <span className="text-sm text-gray-500">@{req.user.username}</span>
                    <span className="text-xs bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-400 px-2 py-0.5 rounded-full">
                      {req.user.plan}
                    </span>
                    <span className="text-xs bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-400 px-2 py-0.5 rounded-full">
                      → {req.requestedPlan}
                    </span>
                    {req.paymentMethod && (
                      <span className="text-xs bg-gray-100 dark:bg-gray-700 px-2 py-0.5 rounded-full">
                        {req.paymentMethod}
                      </span>
                    )}
                  </div>
                  {req.message && (
                    <p className="text-sm text-gray-600 dark:text-gray-300 mt-1">
                      {req.message}
                    </p>
                  )}
                  <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                    {t("upgradeReq.requested", { date: new Date(req.createdAt).toLocaleString(localeMap[language] || "en-US") })}
                  </p>
                </div>
                <div className="flex gap-2 flex-shrink-0">
                  <button
                    onClick={() => handleAction(req.id, "approve")}
                    disabled={processing === req.id}
                    className="px-3 py-1 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 transition disabled:opacity-50"
                  >
                    {processing === req.id ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Check className="w-4 h-4" />
                    )}
                  </button>
                  <button
                    onClick={() => handleAction(req.id, "deny")}
                    disabled={processing === req.id}
                    className="px-3 py-1 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700 transition disabled:opacity-50"
                  >
                    {processing === req.id ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <X className="w-4 h-4" />
                    )}
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
