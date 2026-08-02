import { BadgeCheck } from "lucide-react";

interface VerifiedBadgeProps {
  badgeType?: string | null;
  className?: string;
}

const BADGE_STYLES: Record<string, { color: string; label: string }> = {
  verified: { color: "#3B82F6", label: "Verified account" }, // blue
  organization: { color: "#FFD700", label: "Verified organization" }, // gold ✅
  government: { color: "#9CA3AF", label: "Government official" }, // gray
};

export default function VerifiedBadge({ badgeType, className = "" }: VerifiedBadgeProps) {
  if (!badgeType || !BADGE_STYLES[badgeType]) return null;

  const { color, label } = BADGE_STYLES[badgeType];

  return (
    <span className="inline-flex" title={label}>
      <BadgeCheck
        className={`w-4 h-4 inline-block flex-shrink-0 ${className}`}
        style={{ color, fill: "currentColor" }}
        stroke="white"
        strokeWidth={2}
        aria-label={label}
      />
    </span>
  );
}
