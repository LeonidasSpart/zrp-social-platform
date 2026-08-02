import { BadgeCheck } from "lucide-react";

interface VerifiedBadgeProps {
  badgeType?: string | null;
  className?: string;
}

// ─── Use custom gold color for organization badge ──────────────────
const BADGE_STYLES: Record<string, { fill: string; label: string }> = {
  verified: { fill: "text-blue-500", label: "Verified account" },
  organization: { fill: "text-amber-400", label: "Verified organization" }, // ✅ gold
  government: { fill: "text-gray-400", label: "Government official" },
};

export default function VerifiedBadge({ badgeType, className = "" }: VerifiedBadgeProps) {
  if (!badgeType || !BADGE_STYLES[badgeType]) return null;

  const { fill, label } = BADGE_STYLES[badgeType];

  return (
    <span className="inline-flex" title={label}>
      <BadgeCheck
        className={`w-4 h-4 inline-block flex-shrink-0 ${fill} ${className}`}
        fill="currentColor"
        stroke="white"
        strokeWidth={2}
        aria-label={label}
      />
    </span>
  );
}
