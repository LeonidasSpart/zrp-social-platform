"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { ArrowLeft, X } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import { OPPORTUNITY_TYPES, TYPE_META, type OpportunityType, type OpportunitySummary } from "@/lib/opportunity";

// Posters previously had no way to fix a listing after publishing it -
// not a typo in the description, not a wrong External Application URL
// (see the validation added in the API routes for the specific mistake
// that motivated this page: a listing whose "external" URL pointed
// straight back at zrp.one, so "Apply Externally" opened the ZRP
// homepage with no form on it). The PUT endpoint this posts to already
// existed and was already fully authorized/validated - there was just
// no UI in front of it.
export default function EditOpportunityListingPage() {
  const { t } = useLanguage();
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { data: session, status } = useSession();

  const [loading, setLoading] = useState(true);
  const [notAllowed, setNotAllowed] = useState(false);

  const [type, setType] = useState<OpportunityType>("JOB");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [organizationName, setOrganizationName] = useState("");
  const [location, setLocation] = useState("");
  const [remote, setRemote] = useState(false);
  const [isPaid, setIsPaid] = useState(true);
  const [compensationInfo, setCompensationInfo] = useState("");
  const [externalUrl, setExternalUrl] = useState("");
  const [deadline, setDeadline] = useState("");
  const [skillInput, setSkillInput] = useState("");
  const [skills, setSkills] = useState<string[]>([]);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (status === "unauthenticated") router.push("/login");
  }, [status, router]);

  useEffect(() => {
    fetch(`/api/opportunity/${params.id}`)
      .then(async (res) => {
        if (!res.ok) {
          setNotAllowed(true);
          return;
        }
        const data = await res.json();
        const listing: OpportunitySummary & { posterId?: string } = data.listing;
        if (session?.user?.id && listing.posterId !== session.user.id) {
          setNotAllowed(true);
          return;
        }
        setType(listing.type);
        setTitle(listing.title);
        setDescription(listing.description);
        setOrganizationName(listing.organizationName || "");
        setSkills(listing.skills || []);
        setLocation(listing.location || "");
        setRemote(listing.remote);
        setIsPaid(listing.isPaid);
        setCompensationInfo(listing.compensationInfo || "");
        setExternalUrl(listing.externalUrl || "");
        setDeadline(listing.deadline ? listing.deadline.slice(0, 10) : "");
      })
      .catch(() => setNotAllowed(true))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.id, session?.user?.id]);

  const addSkill = () => {
    const value = skillInput.trim().toLowerCase();
    if (value && !skills.includes(value) && skills.length < 20) {
      setSkills([...skills, value]);
    }
    setSkillInput("");
  };

  const save = async () => {
    if (!title.trim()) {
      setError(t("opportunity.errTitleRequired"));
      return;
    }
    if (!description.trim()) {
      setError(t("opportunity.errDescriptionRequired"));
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/opportunity/${params.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type,
          title: title.trim(),
          description: description.trim(),
          organizationName: organizationName.trim() || null,
          skills,
          location: location.trim() || null,
          remote,
          isPaid,
          compensationInfo: compensationInfo.trim() || null,
          externalUrl: externalUrl.trim() || null,
          deadline: deadline || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to update listing");
      router.push(`/opportunity/listing/${params.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("opportunity.errUpdateFailed"));
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-24">
        <div className="w-8 h-8 border-4 border-zrp-red border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (notAllowed) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-16 text-center text-gray-500 dark:text-gray-400">
        <p>{t("opportunity.errNotAllowedToEdit")}</p>
        <Link href="/opportunity" className="inline-block mt-4 text-zrp-red font-semibold hover:underline">
          {t("opportunity.backToOpportunity")}
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      <Link
        href={`/opportunity/listing/${params.id}`}
        className="inline-flex items-center gap-1.5 text-sm text-gray-500 dark:text-gray-400 hover:text-zrp-red transition mb-4"
      >
        <ArrowLeft className="w-4 h-4" />
        {t("opportunity.backToOpportunity")}
      </Link>

      <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{t("opportunity.editTitle")}</h1>
      <p className="text-sm text-gray-500 dark:text-gray-400 mt-1 mb-6">{t("opportunity.editSubtitle")}</p>

      {error && <p className="text-sm text-red-500 mb-4">{error}</p>}

      <div className="flex flex-col gap-4">
        <div>
          <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">{t("opportunity.typeLabel")}</label>
          <select
            value={type}
            onChange={(e) => setType(e.target.value as OpportunityType)}
            className="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-zrp-red"
          >
            {OPPORTUNITY_TYPES.map((tp) => (
              <option key={tp} value={tp}>
                {t(TYPE_META[tp].labelKey)}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">{t("opportunity.titleLabel")}</label>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={150}
            className="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-zrp-red"
          />
        </div>

        <div>
          <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">{t("opportunity.organizationLabel")}</label>
          <input
            value={organizationName}
            onChange={(e) => setOrganizationName(e.target.value)}
            maxLength={150}
            className="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-zrp-red"
          />
        </div>

        <div>
          <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">{t("opportunity.descriptionLabel")}</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={6}
            maxLength={8000}
            className="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-zrp-red resize-none"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">{t("opportunity.locationLabel")}</label>
            <input
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              maxLength={150}
              className="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-zrp-red"
            />
          </div>
          <div>
            <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">{t("opportunity.deadlineLabel")}</label>
            <input
              type="date"
              value={deadline}
              onChange={(e) => setDeadline(e.target.value)}
              className="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-zrp-red"
            />
          </div>
        </div>

        <div className="flex gap-4">
          <label className="inline-flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
            <input type="checkbox" checked={remote} onChange={(e) => setRemote(e.target.checked)} />
            {t("opportunity.remote")}
          </label>
          <label className="inline-flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
            <input type="checkbox" checked={isPaid} onChange={(e) => setIsPaid(e.target.checked)} />
            {t("opportunity.isPaid")}
          </label>
        </div>

        <div>
          <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">{t("opportunity.compensationLabel")}</label>
          <input
            value={compensationInfo}
            onChange={(e) => setCompensationInfo(e.target.value)}
            placeholder={t("opportunity.compensationPlaceholder")}
            maxLength={200}
            className="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-zrp-red"
          />
        </div>

        <div>
          <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">{t("opportunity.skillsLabel")}</label>
          <div className="flex gap-2">
            <input
              value={skillInput}
              onChange={(e) => setSkillInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addSkill();
                }
              }}
              placeholder={t("opportunity.skillsPlaceholder")}
              className="flex-1 px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-zrp-red"
            />
            <button type="button" onClick={addSkill} className="px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 text-sm font-semibold text-gray-700 dark:text-gray-300">
              {t("opportunity.addSkill")}
            </button>
          </div>
          {skills.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-2">
              {skills.map((skill) => (
                <span key={skill} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-gray-100 dark:bg-gray-800 text-xs text-gray-600 dark:text-gray-300">
                  {skill}
                  <button type="button" onClick={() => setSkills(skills.filter((s) => s !== skill))}>
                    <X className="w-3 h-3" />
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>

        <div>
          <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">{t("opportunity.externalUrlLabel")}</label>
          <input
            value={externalUrl}
            onChange={(e) => setExternalUrl(e.target.value)}
            placeholder={t("opportunity.externalUrlPlaceholder")}
            className="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-zrp-red"
          />
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">{t("opportunity.externalUrlHint")}</p>
        </div>

        <p className="text-xs text-gray-500 dark:text-gray-400">{t("opportunity.editModerationNote")}</p>

        <button
          type="button"
          disabled={submitting}
          onClick={save}
          className="px-5 py-3 rounded-full bg-zrp-red text-white font-semibold hover:bg-red-600 transition disabled:opacity-50"
        >
          {submitting ? t("opportunity.saving") : t("opportunity.saveChanges")}
        </button>
      </div>
    </div>
  );
}
