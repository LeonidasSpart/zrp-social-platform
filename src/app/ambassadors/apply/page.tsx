"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { ArrowLeft, Check, Loader2, Plus, X } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import { getAllCountries, isValidCountryCode } from "@/lib/ambassadors/countries";

/*
 * /ambassadors/apply - the real application form behind the hero's
 * "Become a ZRP Ambassador" CTA, and behind the "Become an Ambassador"
 * action on every country panel (which arrives here with ?country=CODE
 * pre-filled).
 *
 * This only ever submits a PENDING application (see
 * POST /api/ambassadors/apply) - the success state below says exactly
 * that, never "you are now an ambassador". Approval is admin-only
 * (src/app/admin/ambassadors), and the server validates every field
 * again regardless of what this form already checked - this form's
 * own validation is a UX convenience, not the security boundary.
 */
export default function ApplyAmbassadorPage() {
  const { t, language } = useLanguage();
  const { data: session, status } = useSession();
  const searchParams = useSearchParams();

  const countries = useMemo(() => getAllCountries(language), [language]);

  const [countryCode, setCountryCode] = useState("");
  const [cityRegion, setCityRegion] = useState("");
  const [languageInput, setLanguageInput] = useState("");
  const [languages, setLanguages] = useState<string[]>([]);
  const [linkInput, setLinkInput] = useState("");
  const [communityLinks, setCommunityLinks] = useState<string[]>([]);
  const [motivation, setMotivation] = useState("");
  const [communityDescription, setCommunityDescription] = useState("");
  const [audienceSize, setAudienceSize] = useState("");
  const [codeOfConductAccepted, setCodeOfConductAccepted] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    const fromQuery = searchParams.get("country")?.toUpperCase();
    if (fromQuery && isValidCountryCode(fromQuery)) setCountryCode(fromQuery);
  }, [searchParams]);

  const addLanguage = () => {
    const value = languageInput.trim();
    if (value && !languages.includes(value) && languages.length < 10) {
      setLanguages([...languages, value]);
    }
    setLanguageInput("");
  };

  const addLink = () => {
    const value = linkInput.trim();
    if (value && !communityLinks.includes(value) && communityLinks.length < 5) {
      setCommunityLinks([...communityLinks, value]);
    }
    setLinkInput("");
  };

  const submit = async () => {
    setError(null);
    if (!countryCode) {
      setError(t("ambassadors.apply.errCountryRequired"));
      return;
    }
    if (!motivation.trim()) {
      setError(t("ambassadors.apply.errMotivationRequired"));
      return;
    }
    if (!codeOfConductAccepted) {
      setError(t("ambassadors.apply.errCodeRequired"));
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/ambassadors/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          countryCode,
          cityRegion: cityRegion.trim() || null,
          languages,
          communityLinks,
          motivation: motivation.trim(),
          communityDescription: communityDescription.trim() || null,
          audienceSize: audienceSize ? Number(audienceSize) : null,
          codeOfConductAccepted,
        }),
      });
      const body = await res.json();
      if (res.ok) {
        setSuccess(true);
      } else {
        setError(body.error || t("ambassadors.apply.errGeneric"));
      }
    } catch {
      setError(t("ambassadors.apply.errGeneric"));
    } finally {
      setSubmitting(false);
    }
  };

  const inputClass =
    "w-full rounded-xl border border-gray-300 bg-white px-4 py-2.5 text-sm text-gray-900 focus:border-transparent focus:ring-2 focus:ring-zrp-red dark:border-gray-700 dark:bg-zrp-charcoal dark:text-white";
  const labelClass = "mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300";

  return (
    <div className="mx-auto max-w-xl px-4 py-10">
      <Link
        href="/ambassadors"
        className="mb-6 inline-flex items-center gap-2 text-sm font-medium text-gray-500 hover:text-zrp-red dark:text-gray-400"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        {t("ambassadors.apply.backToAmbassadors")}
      </Link>

      <h1 className="font-orbitron text-2xl font-bold text-gray-900 dark:text-white sm:text-3xl">
        {t("ambassadors.apply.title")}
      </h1>
      <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">{t("ambassadors.apply.subtitle")}</p>

      {status === "loading" ? (
        <div className="mt-10 flex justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-gray-400" aria-hidden="true" />
        </div>
      ) : !session ? (
        <div className="mt-8 rounded-2xl border border-gray-200 bg-gray-50 p-6 text-center dark:border-gray-800 dark:bg-zrp-charcoal">
          <p className="text-sm text-gray-600 dark:text-gray-400">{t("ambassadors.apply.requireLogin")}</p>
          <Link
            href={`/login?callbackUrl=${encodeURIComponent("/ambassadors/apply")}`}
            className="mt-4 inline-flex items-center justify-center rounded-full bg-zrp-red px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-zrp-darkRed"
          >
            {t("nav.login")}
          </Link>
        </div>
      ) : success ? (
        <div className="mt-8 rounded-2xl border border-gray-200 bg-gray-50 p-6 text-center dark:border-gray-800 dark:bg-zrp-charcoal">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400">
            <Check className="h-6 w-6" aria-hidden="true" />
          </div>
          <h2 className="mt-4 font-orbitron text-lg font-bold text-gray-900 dark:text-white">
            {t("ambassadors.apply.successTitle")}
          </h2>
          <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">{t("ambassadors.apply.successBody")}</p>
          <Link
            href="/ambassadors/dashboard"
            className="mt-4 inline-flex items-center justify-center rounded-full border border-gray-300 px-5 py-2.5 text-sm font-semibold text-gray-700 transition hover:bg-gray-100 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
          >
            {t("ambassadors.dashboard.title")}
          </Link>
        </div>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
          className="mt-8 space-y-5"
        >
          {error && (
            <div role="alert" aria-live="polite" className="rounded-xl bg-red-50 p-3 text-sm text-red-700 dark:bg-red-900/20 dark:text-red-400">
              {error}
            </div>
          )}

          <div>
            <label htmlFor="apply-country" className={labelClass}>
              {t("ambassadors.apply.fieldCountry")}
            </label>
            <select
              id="apply-country"
              required
              value={countryCode}
              onChange={(e) => setCountryCode(e.target.value)}
              className={inputClass}
            >
              <option value="">{t("ambassadors.apply.selectCountry")}</option>
              {countries.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="apply-city" className={labelClass}>
              {t("ambassadors.apply.fieldCityRegion")}
            </label>
            <input
              id="apply-city"
              type="text"
              value={cityRegion}
              onChange={(e) => setCityRegion(e.target.value)}
              maxLength={120}
              className={inputClass}
            />
          </div>

          <div>
            <label htmlFor="apply-languages" className={labelClass}>
              {t("ambassadors.apply.fieldLanguages")}
            </label>
            <div className="flex gap-2">
              <input
                id="apply-languages"
                type="text"
                value={languageInput}
                onChange={(e) => setLanguageInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addLanguage();
                  }
                }}
                className={inputClass}
              />
              <button
                type="button"
                onClick={addLanguage}
                aria-label={t("ambassadors.apply.addLanguage")}
                className="shrink-0 rounded-xl border border-gray-300 px-3 text-gray-600 transition hover:bg-gray-100 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
              >
                <Plus className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
            {languages.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-2">
                {languages.map((lang) => (
                  <span
                    key={lang}
                    className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-3 py-1 text-xs text-gray-700 dark:bg-gray-800 dark:text-gray-300"
                  >
                    {lang}
                    <button
                      type="button"
                      onClick={() => setLanguages(languages.filter((l) => l !== lang))}
                      aria-label={t("ambassadors.apply.remove", { item: lang })}
                    >
                      <X className="h-3 w-3" aria-hidden="true" />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>

          <div>
            <label htmlFor="apply-links" className={labelClass}>
              {t("ambassadors.apply.fieldCommunityLinks")}
            </label>
            <div className="flex gap-2">
              <input
                id="apply-links"
                type="url"
                placeholder="https://"
                value={linkInput}
                onChange={(e) => setLinkInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addLink();
                  }
                }}
                className={inputClass}
              />
              <button
                type="button"
                onClick={addLink}
                aria-label={t("ambassadors.apply.addLink")}
                className="shrink-0 rounded-xl border border-gray-300 px-3 text-gray-600 transition hover:bg-gray-100 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
              >
                <Plus className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
            {communityLinks.length > 0 && (
              <ul className="mt-2 space-y-1.5">
                {communityLinks.map((link) => (
                  <li
                    key={link}
                    className="flex items-center justify-between gap-2 rounded-lg bg-gray-50 px-3 py-1.5 text-xs text-gray-600 dark:bg-gray-800 dark:text-gray-300"
                  >
                    <span className="truncate">{link}</span>
                    <button
                      type="button"
                      onClick={() => setCommunityLinks(communityLinks.filter((l) => l !== link))}
                      aria-label={t("ambassadors.apply.remove", { item: link })}
                      className="shrink-0"
                    >
                      <X className="h-3.5 w-3.5" aria-hidden="true" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div>
            <label htmlFor="apply-motivation" className={labelClass}>
              {t("ambassadors.apply.fieldMotivation")}
            </label>
            <textarea
              id="apply-motivation"
              required
              rows={4}
              maxLength={3000}
              value={motivation}
              onChange={(e) => setMotivation(e.target.value)}
              className={`${inputClass} resize-none`}
            />
          </div>

          <div>
            <label htmlFor="apply-community-description" className={labelClass}>
              {t("ambassadors.apply.fieldCommunityDescription")}
            </label>
            <textarea
              id="apply-community-description"
              rows={3}
              maxLength={3000}
              value={communityDescription}
              onChange={(e) => setCommunityDescription(e.target.value)}
              className={`${inputClass} resize-none`}
            />
          </div>

          <div>
            <label htmlFor="apply-audience" className={labelClass}>
              {t("ambassadors.apply.fieldAudienceSize")}
            </label>
            <input
              id="apply-audience"
              type="number"
              min={0}
              value={audienceSize}
              onChange={(e) => setAudienceSize(e.target.value)}
              className={inputClass}
            />
          </div>

          <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 dark:border-gray-800 dark:bg-zrp-charcoal">
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {t("ambassadors.apply.codeOfConductLinkPrefix")}{" "}
              <Link href="/community-code#b-ambassador-code" className="legal-link" target="_blank">
                {t("ambassadors.apply.codeOfConductLinkLabel")}
              </Link>
              .
            </p>
            <label className="mt-3 flex items-start gap-2.5 text-sm text-gray-700 dark:text-gray-300">
              <input
                type="checkbox"
                required
                checked={codeOfConductAccepted}
                onChange={(e) => setCodeOfConductAccepted(e.target.checked)}
                className="mt-0.5 h-4 w-4 shrink-0 rounded border-gray-300 text-zrp-red focus:ring-zrp-red dark:border-gray-700"
              />
              <span>{t("ambassadors.apply.codeOfConductCheckbox")}</span>
            </label>
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="flex w-full items-center justify-center gap-2 rounded-full bg-zrp-red px-6 py-3 text-sm font-semibold text-white transition hover:bg-zrp-darkRed disabled:opacity-60"
          >
            {submitting && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
            {submitting ? t("ambassadors.apply.submitting") : t("ambassadors.apply.submit")}
          </button>
        </form>
      )}
    </div>
  );
}
