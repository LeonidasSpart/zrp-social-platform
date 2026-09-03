import {
  Briefcase,
  Laptop,
  GraduationCap,
  Award,
  Users,
  HeartHandshake,
  Building2,
  Megaphone,
  Trophy,
  BookOpen,
  Network,
  type LucideIcon,
} from "lucide-react";
import type { TranslationKey } from "@/lib/translations";

export const OPPORTUNITY_TYPES = [
  "JOB",
  "REMOTE",
  "INTERNSHIP",
  "SCHOLARSHIP",
  "MENTORSHIP",
  "FREELANCE",
  "PARTNERSHIP",
  "SPONSORSHIP",
  "HACKATHON",
  "TRAINING",
  "COLLABORATION",
] as const;

export type OpportunityType = (typeof OPPORTUNITY_TYPES)[number];

export const TYPE_META: Record<OpportunityType, { icon: LucideIcon; labelKey: TranslationKey }> = {
  JOB: { icon: Briefcase, labelKey: "opportunity.typeJob" },
  REMOTE: { icon: Laptop, labelKey: "opportunity.typeRemote" },
  INTERNSHIP: { icon: GraduationCap, labelKey: "opportunity.typeInternship" },
  SCHOLARSHIP: { icon: Award, labelKey: "opportunity.typeScholarship" },
  MENTORSHIP: { icon: Users, labelKey: "opportunity.typeMentorship" },
  FREELANCE: { icon: HeartHandshake, labelKey: "opportunity.typeFreelance" },
  PARTNERSHIP: { icon: Building2, labelKey: "opportunity.typePartnership" },
  SPONSORSHIP: { icon: Megaphone, labelKey: "opportunity.typeSponsorship" },
  HACKATHON: { icon: Trophy, labelKey: "opportunity.typeHackathon" },
  TRAINING: { icon: BookOpen, labelKey: "opportunity.typeTraining" },
  COLLABORATION: { icon: Network, labelKey: "opportunity.typeCollaboration" },
};

export const OPPORTUNITY_STATUSES = [
  "PENDING_REVIEW",
  "ACTIVE",
  "REJECTED",
  "EXPIRED",
  "CLOSED",
  "REMOVED",
] as const;

export type OpportunityStatus = (typeof OPPORTUNITY_STATUSES)[number];

export const STATUS_LABEL_KEYS: Record<OpportunityStatus, TranslationKey> = {
  PENDING_REVIEW: "opportunity.statusPendingReview",
  ACTIVE: "opportunity.statusActive",
  REJECTED: "opportunity.statusRejected",
  EXPIRED: "opportunity.statusExpired",
  CLOSED: "opportunity.statusClosed",
  REMOVED: "opportunity.statusRemoved",
};

export const STATUS_STYLES: Record<OpportunityStatus, string> = {
  PENDING_REVIEW: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400",
  ACTIVE: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
  REJECTED: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
  EXPIRED: "bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400",
  CLOSED: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
  REMOVED: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
};

export const APPLICATION_STATUSES = ["PENDING", "REVIEWED", "ACCEPTED", "REJECTED", "WITHDRAWN"] as const;
export type ApplicationStatus = (typeof APPLICATION_STATUSES)[number];

export const APPLICATION_STATUS_LABEL_KEYS: Record<ApplicationStatus, TranslationKey> = {
  PENDING: "opportunity.appStatusPending",
  REVIEWED: "opportunity.appStatusReviewed",
  ACCEPTED: "opportunity.appStatusAccepted",
  REJECTED: "opportunity.appStatusRejected",
  WITHDRAWN: "opportunity.appStatusWithdrawn",
};

export const APPLICATION_STATUS_STYLES: Record<ApplicationStatus, string> = {
  PENDING: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400",
  REVIEWED: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
  ACCEPTED: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
  REJECTED: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
  WITHDRAWN: "bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400",
};

export interface OpportunityPoster {
  id: string;
  username: string;
  name: string | null;
  avatarUrl: string | null;
  badgeType: string | null;
}

// A poster once entered the platform's own homepage as the "external
// application" URL (a copy-pasted zrp.one link instead of a real
// employer page) - it's a syntactically valid URL, so a plain
// http(s)-scheme check lets it straight through, and "Apply Externally"
// just sends every applicant back to the ZRP homepage with no form on
// it. Blocking ZRP's own domain here catches that mistake at the
// source (create and edit both use this) instead of relying on
// someone noticing after the listing is already live.
const ZRP_HOSTNAMES = new Set(["zrp.one", "www.zrp.one"]);

export function validateExternalUrl(value: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return "External application URL is invalid.";
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    return "External application URL must be http(s).";
  }
  if (ZRP_HOSTNAMES.has(parsed.hostname.toLowerCase())) {
    return "External application URL can't point back to ZRP itself - leave it blank to use ZRP's built-in Apply flow instead.";
  }
  return null;
}

export interface OpportunitySummary {
  id: string;
  type: OpportunityType;
  title: string;
  description: string;
  organizationName: string | null;
  skills: string[];
  location: string | null;
  remote: boolean;
  isPaid: boolean;
  compensationInfo: string | null;
  externalUrl: string | null;
  deadline: string | null;
  status?: OpportunityStatus;
  rejectionReason?: string | null;
  views?: number;
  createdAt: string;
  poster?: OpportunityPoster;
  _count?: { applications: number };
}
