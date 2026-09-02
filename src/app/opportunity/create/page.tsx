"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, X } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import { OPPORTUNITY_TYPES, TYPE_META, type OpportunityType } from "@/lib/opportunity";

export default function CreateOpportunityPage() {
  const { t } = useLanguage();
  const router = useRouter();

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

  const addSkill = () => {
    const value = skillInput.trim().toLowerCase();
    if (value && !skills.includes(value) && skills.length < 20) {
      setSkills([...skills, value]);
    }
    setSkillInput("");
  };

  const publish = async () => {
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
      const res = await fetch("/api/opportunity", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type,
          title: title.trim(),
          description: description.trim(),
          organizationName: organizationName.trim() || undefined,
          skills,
          location: location.trim() || undefined,
          remote,
          isPaid,
          compensationInfo: compensationInfo.trim() || undefined,
          externalUrl: externalUrl.trim() || undefined,
          deadline: deadline || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to create listing");
      router.push("/opportunity/my-listings");
    } catch (err) {
      setError(err instanceof Error ? err.message : t("opportunity.errCreateFailed"));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      <Link href="/opportunity" className="inline-flex items-center gap-1.5 text-sm text-gray-500 dark:text-gray-400 hover:text-zrp-red transition mb-4">
        <ArrowLeft className="w-4 h-4" />
        {t("opportunity.backToOpportunity")}
      </Link>

      <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{t("opportunity.createTitle")}</h1>
      <p className="text-sm text-gray-500 dark:text-gray-400 mt-1 mb-6">{t("opportunity.createSubtitle")}</p>

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

        <p className="text-xs text-gray-500 dark:text-gray-400">{t("opportunity.moderationNote")}</p>

        <button
          type="button"
          disabled={submitting}
          onClick={publish}
          className="px-5 py-3 rounded-full bg-zrp-red text-white font-semibold hover:bg-red-600 transition disabled:opacity-50"
        >
          {submitting ? t("opportunity.publishing") : t("opportunity.publish")}
        </button>
      </div>
    </div>
  );
}
