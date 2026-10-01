"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Image from "next/image";
import { useSession } from "next-auth/react";
import { Loader2 } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import { localizeApiMessage } from "@/lib/api-error-i18n";

interface CampaignDetail {
  id: string;
  title: string;
  description: string;
  tokenPriceUsdc: number;
  softCapUsdc: number;
  hardCapUsdc: number;
  requiresWhitelist: boolean;
  participationInstructions: string;
  saleStartsAt: string;
  saleEndsAt: string;
  cancelledAt: string | null;
  creatorId: string | null;
  launchedToken: { name: string; symbol: string; imageUrl: string };
}

interface WhitelistApplication {
  id: string;
  applicantWalletAddress: string;
  contactEmail: string | null;
  status: "PENDING" | "APPROVED" | "REJECTED";
  createdAt: string;
}

const STATUS_STYLES: Record<WhitelistApplication["status"], string> = {
  PENDING: "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400",
  APPROVED: "bg-green-100 text-green-700 dark:bg-green-950/40 dark:text-green-400",
  REJECTED: "bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-400",
};

const STATUS_LABEL_KEYS: Record<WhitelistApplication["status"], "launchpad.idoDetail.statusPending" | "launchpad.idoDetail.statusApproved" | "launchpad.idoDetail.statusRejected"> = {
  PENDING: "launchpad.idoDetail.statusPending",
  APPROVED: "launchpad.idoDetail.statusApproved",
  REJECTED: "launchpad.idoDetail.statusRejected",
};

export default function IdoCampaignDetailPage() {
  const params = useParams<{ id: string }>();
  const { data: session } = useSession();
  const { t } = useLanguage();
  const [campaign, setCampaign] = useState<CampaignDetail | null>(null);
  const [loading, setLoading] = useState(true);

  const [walletAddress, setWalletAddress] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [applying, setApplying] = useState(false);
  const [applyError, setApplyError] = useState<string | null>(null);
  const [applySuccess, setApplySuccess] = useState(false);

  const [applications, setApplications] = useState<WhitelistApplication[] | null>(null);
  const [reviewBusyId, setReviewBusyId] = useState<string | null>(null);

  const isCreator = !!session?.user && !!campaign && session.user.id === campaign.creatorId;

  const loadCampaign = async () => {
    const res = await fetch(`/api/launchpad/ido/${params.id}`);
    const data = await res.json().catch(() => null);
    setCampaign(res.ok ? data?.campaign ?? null : null);
  };

  const loadApplications = async () => {
    const res = await fetch(`/api/launchpad/ido/${params.id}/applications`);
    if (!res.ok) return;
    const data = await res.json();
    setApplications(data.applications || []);
  };

  useEffect(() => {
    if (!params.id) return;
    setLoading(true);
    loadCampaign().finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.id]);

  useEffect(() => {
    if (isCreator) loadApplications();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isCreator]);

  const handleApply = async (e: React.FormEvent) => {
    e.preventDefault();
    setApplyError(null);
    setApplySuccess(false);
    if (!walletAddress.trim()) {
      setApplyError(t("launchpad.idoDetail.walletRequiredError"));
      return;
    }
    setApplying(true);
    try {
      const res = await fetch(`/api/launchpad/ido/${params.id}/applications`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ walletAddress: walletAddress.trim(), contactEmail: contactEmail.trim() || undefined }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok)
        throw new Error(localizeApiMessage(data?.error, t) || t("launchpad.idoDetail.applySubmitFailedDefault"));
      setApplySuccess(true);
      setWalletAddress("");
      setContactEmail("");
    } catch (err: unknown) {
      setApplyError(err instanceof Error ? err.message : t("launchpad.idoDetail.applySubmitFailedDefault"));
    } finally {
      setApplying(false);
    }
  };

  const handleReview = async (appId: string, status: "APPROVED" | "REJECTED") => {
    setReviewBusyId(appId);
    try {
      const res = await fetch(`/api/launchpad/ido/${params.id}/applications/${appId}/review`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (res.ok) await loadApplications();
    } finally {
      setReviewBusyId(null);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-24">
        <Loader2 className="w-8 h-8 animate-spin text-zrp-red" />
      </div>
    );
  }
  if (!campaign) {
    return (
      <div className="max-w-md mx-auto px-4 py-16 text-center">
        <p className="text-gray-600 dark:text-gray-400">{t("launchpad.idoDetail.notFound")}</p>
      </div>
    );
  }

  const saleEnded = new Date(campaign.saleEndsAt).getTime() < Date.now();
  const canApply = !campaign.cancelledAt && !saleEnded;

  return (
    <div className="max-w-2xl mx-auto px-4 py-8 space-y-6">
      <div className="flex items-center gap-4">
        <Image
          src={campaign.launchedToken.imageUrl}
          alt={campaign.launchedToken.name}
          width={56}
          height={56}
          className="w-14 h-14 rounded-full object-cover"
          unoptimized
        />
        <div>
          <h1 className="text-2xl font-extrabold font-orbitron text-gray-900 dark:text-white">{campaign.title}</h1>
          <p className="text-gray-500 dark:text-gray-400">${campaign.launchedToken.symbol}</p>
        </div>
      </div>

      <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-300">
        {t("launchpad.idoDetail.nonCustodialDisclosure")}
      </div>

      <p className="whitespace-pre-wrap text-sm text-gray-700 dark:text-gray-300">{campaign.description}</p>

      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-md border border-gray-200 dark:border-gray-700 p-3">
          <p className="text-xs text-gray-500 dark:text-gray-400">{t("launchpad.idoDetail.priceLabel")}</p>
          <p className="font-semibold text-gray-900 dark:text-white">${campaign.tokenPriceUsdc}</p>
        </div>
        <div className="rounded-md border border-gray-200 dark:border-gray-700 p-3">
          <p className="text-xs text-gray-500 dark:text-gray-400">{t("launchpad.idoDetail.softCapLabel")}</p>
          <p className="font-semibold text-gray-900 dark:text-white">${campaign.softCapUsdc.toLocaleString()}</p>
        </div>
        <div className="rounded-md border border-gray-200 dark:border-gray-700 p-3">
          <p className="text-xs text-gray-500 dark:text-gray-400">{t("launchpad.idoDetail.hardCapLabel")}</p>
          <p className="font-semibold text-gray-900 dark:text-white">${campaign.hardCapUsdc.toLocaleString()}</p>
        </div>
      </div>

      <p className="text-xs text-gray-400 dark:text-gray-500">
        {campaign.cancelledAt
          ? t("launchpad.idoDetail.cancelledStatus")
          : saleEnded
            ? t("launchpad.idoDetail.saleEndedStatus", { date: new Date(campaign.saleEndsAt).toLocaleString() })
            : t("launchpad.idoDetail.saleScheduleStatus", {
                start: new Date(campaign.saleStartsAt).toLocaleString(),
                end: new Date(campaign.saleEndsAt).toLocaleString(),
              })}
      </p>

      <div className="rounded-xl border border-gray-200 dark:border-gray-700 p-4">
        <h2 className="font-semibold text-gray-900 dark:text-white mb-2">{t("launchpad.idoDetail.howToParticipateHeading")}</h2>
        <p className="whitespace-pre-wrap text-sm text-gray-700 dark:text-gray-300">{campaign.participationInstructions}</p>
      </div>

      {campaign.requiresWhitelist && canApply && (
        <form onSubmit={handleApply} className="space-y-3 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
          <h2 className="font-semibold text-gray-900 dark:text-white">{t("launchpad.idoDetail.applyHeading")}</h2>
          <p className="text-xs text-gray-500 dark:text-gray-400">{t("launchpad.idoDetail.applyNoAccountHint")}</p>
          <input
            type="text"
            placeholder={t("launchpad.idoDetail.walletPlaceholder")}
            value={walletAddress}
            onChange={(e) => setWalletAddress(e.target.value)}
            disabled={applying}
            className="flex h-10 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-mono dark:border-gray-700 dark:bg-gray-800 dark:text-white"
          />
          <input
            type="email"
            placeholder={t("launchpad.idoDetail.emailPlaceholder")}
            value={contactEmail}
            onChange={(e) => setContactEmail(e.target.value)}
            disabled={applying}
            className="flex h-10 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-white"
          />
          {applyError && <p className="text-sm text-red-600 dark:text-red-400">{applyError}</p>}
          {applySuccess && <p className="text-sm text-green-600 dark:text-green-400">{t("launchpad.idoDetail.applySuccessMessage")}</p>}
          <button
            type="submit"
            disabled={applying}
            className="w-full inline-flex items-center justify-center rounded-md bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
          >
            {applying ? <Loader2 className="h-4 w-4 animate-spin" /> : t("launchpad.idoDetail.applyButton")}
          </button>
        </form>
      )}

      {isCreator && applications && (
        <div className="rounded-xl border border-gray-200 dark:border-gray-700 p-4">
          <h2 className="font-semibold text-gray-900 dark:text-white mb-3">
            {t("launchpad.idoDetail.applicationsHeading", { count: applications.length })}
          </h2>
          {applications.length === 0 ? (
            <p className="text-sm text-gray-500 dark:text-gray-400">{t("launchpad.idoDetail.noApplicationsMessage")}</p>
          ) : (
            <div className="space-y-2">
              {applications.map((app) => (
                <div key={app.id} className="flex items-center justify-between gap-2 rounded-md border border-gray-100 dark:border-gray-800 p-2">
                  <div className="min-w-0">
                    <p className="truncate font-mono text-xs text-gray-700 dark:text-gray-300">{app.applicantWalletAddress}</p>
                    {app.contactEmail && <p className="truncate text-xs text-gray-400 dark:text-gray-500">{app.contactEmail}</p>}
                  </div>
                  {app.status === "PENDING" ? (
                    <div className="flex flex-shrink-0 gap-1">
                      <button
                        type="button"
                        onClick={() => handleReview(app.id, "APPROVED")}
                        disabled={reviewBusyId === app.id}
                        className="rounded-full bg-green-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-green-700 disabled:opacity-50"
                      >
                        {t("launchpad.idoDetail.approveButton")}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleReview(app.id, "REJECTED")}
                        disabled={reviewBusyId === app.id}
                        className="rounded-full bg-red-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-red-700 disabled:opacity-50"
                      >
                        {t("launchpad.idoDetail.rejectButton")}
                      </button>
                    </div>
                  ) : (
                    <span className={`flex-shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[app.status]}`}>
                      {STATUS_LABEL_KEYS[app.status] ? t(STATUS_LABEL_KEYS[app.status]) : app.status}
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
