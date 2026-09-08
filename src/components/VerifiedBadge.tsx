import { BadgeCheck, Newspaper, Rss, type LucideIcon } from "lucide-react";

interface VerifiedBadgeProps {
  badgeType?: string | null;
  className?: string;
}

const BADGE_STYLES: Record<
  string,
  { color: string; label: string; icon: LucideIcon }
> = {
  verified: { color: "#3B82F6", label: "Verified account", icon: BadgeCheck }, // blue
  organization: { color: "#FFD700", label: "Verified organization", icon: BadgeCheck }, // gold ✅
  government: { color: "#9CA3AF", label: "Government official", icon: BadgeCheck }, // gray
  team: { color: "#EF4444", label: "ZRP Team", icon: BadgeCheck }, // red, ZRP staff only
  // ZRP Journalist badge. Uses ZRP brand red (#FF2D2D) but a distinct
  // Newspaper glyph so it is never visually confused with the "team"
  // staff badge, even though both lean on ZRP red branding.
  journalist: { color: "#FF2D2D", label: "Verified Journalist", icon: Newspaper },
  // ZRP News Network editorial feed (ZRP News World, ZRP Travel, ...).
  // Same ZRP brand red as the journalist badge because both mark
  // official ZRP editorial identities, but an Rss glyph so an automated
  // feed is never mistaken for a verified human journalist. Its label
  // says "automated" out loud - these accounts must never read as people.
  editorial: { color: "#FF2D2D", label: "Official ZRP editorial feed (automated)", icon: Rss },
};

export default function VerifiedBadge({ badgeType, className = "" }: VerifiedBadgeProps) {
  if (!badgeType || !BADGE_STYLES[badgeType]) return null;

  const { color, label, icon: Icon } = BADGE_STYLES[badgeType];

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
