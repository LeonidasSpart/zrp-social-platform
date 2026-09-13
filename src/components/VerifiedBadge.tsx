"use client";

import { BadgeCheck, Newspaper, Rss, type LucideIcon } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import type { TranslationKey } from "@/lib/translations";

interface VerifiedBadgeProps {
  badgeType?: string | null;
  className?: string;
}

const BADGE_STYLES: Record<
  string,
  { color: string; labelKey: string; icon: LucideIcon }
> = {
  verified: { color: "#3B82F6", labelKey: "verifiedBadge.account", icon: BadgeCheck }, // blue
  organization: { color: "#FFD700", labelKey: "verifiedBadge.organization", icon: BadgeCheck }, // gold ✅
  government: { color: "#9CA3AF", labelKey: "verifiedBadge.government", icon: BadgeCheck }, // gray
  team: { color: "#EF4444", labelKey: "verifiedBadge.team", icon: BadgeCheck }, // red, ZRP staff only
  // ZRP Journalist badge. Uses ZRP brand red (#FF2D2D) but a distinct
  // Newspaper glyph so it is never visually confused with the "team"
  // staff badge, even though both lean on ZRP red branding.
  journalist: { color: "#FF2D2D", labelKey: "verifiedBadge.journalist", icon: Newspaper },
  // ZRP News Network editorial feed (ZRP News World, ZRP Travel, ...).
  // Same ZRP brand red as the journalist badge because both mark
  // official ZRP editorial identities, but an Rss glyph so an automated
  // feed is never mistaken for a verified human journalist. Its label
  // says "automated" out loud - these accounts must never read as people.
  editorial: { color: "#FF2D2D", labelKey: "verifiedBadge.newsAutomated", icon: Rss },
};

export default function VerifiedBadge({ badgeType, className = "" }: VerifiedBadgeProps) {
  const { t } = useLanguage();

  if (!badgeType || !BADGE_STYLES[badgeType]) return null;

  const { color, labelKey, icon: Icon } = BADGE_STYLES[badgeType];
  // Cast: these keys are added to the TranslationKey union by translations.ts
  // in a coordinated merge (see /tmp/i18n/newkeys_verifiedbadge.json) rather
  // than edited here directly.
  const label = t(labelKey as TranslationKey);

  return (
    <span className="inline-flex" title={label}>
      <Icon
        className={`w-4 h-4 inline-block flex-shrink-0 ${className}`}
        style={{ color, fill: "currentColor" }}
        stroke="white"
        strokeWidth={2}
        aria-label={label}
      />
    </span>
  );
}
