"use client";

import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, AlertTriangle, Download, Trash2, X } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";

export default function DeleteAccountPage() {
  const { data: session, status, update } = useSession();
  const router = useRouter();
  const { t } = useLanguage();
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error" | "info"; text: string } | null>(null);
  const [showConfirm, setShowConfirm] = useState(false);
  const [confirmationText, setConfirmationText] = useState("");
  const [deletionDate, setDeletionDate] = useState<string | null>(null);
  const [isScheduled, setIsScheduled] = useState(false);

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/login");
    }
    if (session?.user) {
      checkDeletionStatus();
    }
  }, [status, session, router]);

  const checkDeletionStatus = async () => {
    try {
      const res = await fetch("/api/user/delete-status");
      if (res.ok) {
        const data = await res.json();
        if (data.scheduledFor) {
          setIsScheduled(true);
          setDeletionDate(new Date(data.scheduledFor).toLocaleDateString("en-US", {
            year: "numeric",
            month: "long",
            day: "numeric",
          }));
        }
      }
    } catch (error) {
      console.error("Error checking deletion status:", error);
    }
  };

  const handleRequestDeletion = async () => {
    setLoading(true);
    setMessage(null);

    try {
      const res = await fetch("/api/user/delete", {
        method: "POST",
      });
      const data = await res.json();

      if (res.ok) {
        setMessage({
          type: "success",
          text: data.message || t("deleteAccount.successScheduled"),
        });
        setDeletionDate(new Date(data.deletionDate).toLocaleDateString("en-US", {
          year: "numeric",
          month: "long",
          day: "numeric",
        }));
        setIsScheduled(true);
        setShowConfirm(false);
      } else {
        setMessage({ type: "error", text: data.error || t("deleteAccount.errFailedSchedule") });
      }
    } catch (error) {
      setMessage({ type: "error", text: t("deleteAccount.errGeneric") });
    } finally {
      setLoading(false);
    }
  };

  const handleCancelDeletion = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/user/delete", { method: "POST" });
      const data = await res.json();
      if (res.ok) {
        setMessage({ type: "info", text: t("deleteAccount.cancelledInfo") });
        setIsScheduled(false);
        setDeletionDate(null);
      } else {
        setMessage({ type: "error", text: data.error || t("deleteAccount.errFailedCancel") });
      }
    } catch (error) {
      setMessage({ type: "error", text: t("deleteAccount.errGenericShort") });
    } finally {
      setLoading(false);
    }
  };

  const handleConfirmDeletion = async () => {
    if (confirmationText !== "DELETE") {
      setMessage({ type: "error", text: t("deleteAccount.errTypeDeleteConfirm") });
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/user/delete/confirm", {
        method: "POST",
      });
      const data = await res.json();

      if (res.ok) {
        router.push("/login?deleted=true");
      } else {
        setMessage({ type: "error", text: data.error || t("deleteAccount.errFailedDelete") });
        setLoading(false);
      }
    } catch (error) {
      setMessage({ type: "error", text: t("deleteAccount.errGenericShort") });
      setLoading(false);
    }
  };

  if (status === "loading") {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-gray-500">{t("support.loading")}</div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto py-8 px-4">
      <div className="mb-6">
        <Link href="/settings" className="text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 transition flex items-center gap-2">
          <ArrowLeft className="w-4 h-4" /> {t("deleteAccount.backToSettings")}
        </Link>
      </div>

      <div className="bg-white dark:bg-zrp-deepBlack rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6 md:p-8">
        <div className="flex items-center gap-3 mb-6">
          <div className="p-2 bg-red-100 dark:bg-red-900/20 rounded-full">
            <Trash2 className="w-6 h-6 text-red-600 dark:text-red-400" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{t("deleteAccount.title")}</h1>
        </div>

        {message && (
          <div className={`p-4 rounded-lg mb-6 ${
            message.type === "success"
              ? "bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400 border border-green-200 dark:border-green-800"
              : message.type === "error"
              ? "bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 border border-red-200 dark:border-red-800"
              : "bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400 border border-blue-200 dark:border-blue-800"
          }`}>
            {message.text}
          </div>
        )}

        {isScheduled ? (
          <div className="space-y-4">
            <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4">
              <p className="text-yellow-800 dark:text-yellow-300">
                <AlertTriangle className="w-5 h-5 inline mr-2" />
                {t("deleteAccount.scheduledMessage", { date: deletionDate || t("deleteAccount.futureDate") })}
              </p>
              <p className="text-sm text-yellow-600 dark:text-yellow-400 mt-1">
                {t("deleteAccount.cancelAnytimeHint")}
              </p>
            </div>

            <div className="flex gap-3">
              <button
                onClick={handleCancelDeletion}
                disabled={loading}
                className="flex-1 bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-white py-2 rounded-lg font-medium hover:bg-gray-300 dark:hover:bg-gray-600 transition"
              >
                {t("deleteAccount.cancelDeletionRequest")}
              </button>
              <button
                onClick={() => setShowConfirm(true)}
                className="flex-1 bg-red-600 text-white py-2 rounded-lg font-medium hover:bg-red-700 transition"
              >
                {t("deleteAccount.deleteNow")}
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="space-y-4 text-gray-700 dark:text-gray-300">
              <p>
                <strong>{t("deleteAccount.permanentWarning")}</strong>
                {" "}{t("deleteAccount.deletingWillIntro")}
              </p>
              <ul className="list-disc list-inside space-y-1 text-sm">
                <li>{t("deleteAccount.bullet1")}</li>
                <li>{t("deleteAccount.bullet2")}</li>
                <li>{t("deleteAccount.bullet3")}</li>
                <li>{t("deleteAccount.bullet4")}</li>
                <li>{t("deleteAccount.bullet5")}</li>
              </ul>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                {t("deleteAccount.scheduleHintPre")} <strong>{t("deleteAccount.thirtyDaysBold")}</strong>.{" "}
                {t("deleteAccount.scheduleHintPost")}
              </p>
            </div>

            {showConfirm ? (
              <div className="mt-6 border-t border-gray-200 dark:border-gray-700 pt-6">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">{t("deleteAccount.confirmDeletionTitle")}</h3>
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
                  {t("deleteAccount.confirmDeletionInstructionPre")} <strong className="text-red-600">DELETE</strong> {t("deleteAccount.confirmDeletionInstructionPost")}
                </p>
                <input
                  type="text"
                  value={confirmationText}
                  onChange={(e) => setConfirmationText(e.target.value)}
                  placeholder={t("deleteAccount.typeDeleteToConfirm")}
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                />
                <div className="flex gap-3 mt-4">
                  <button
                    onClick={() => { setShowConfirm(false); setConfirmationText(""); }}
                    className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition"
                  >
                    {t("action.cancel")}
                  </button>
                  <button
                    onClick={handleConfirmDeletion}
                    disabled={loading}
                    className="flex-1 bg-red-600 text-white py-2 rounded-lg font-medium hover:bg-red-700 disabled:opacity-50 transition"
                  >
                    {loading ? t("deleteAccount.deleting") : t("deleteAccount.permanentlyDeleteAccount")}
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => setShowConfirm(true)}
                disabled={loading}
                className="w-full mt-4 bg-red-600 text-white py-3 rounded-lg font-medium hover:bg-red-700 disabled:opacity-50 transition"
              >
                {t("deleteAccount.requestAccountDeletion")}
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
