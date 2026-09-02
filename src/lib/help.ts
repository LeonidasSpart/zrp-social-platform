import {
  Swords,
  CloudLightning,
  Coins,
  Siren,
  CircleDot,
  DollarSign,
  Package,
  Wrench,
  Users,
  type LucideIcon,
} from "lucide-react";
import type { TranslationKey } from "@/lib/translations";

export const HELP_CATEGORIES = ["WAR", "DISASTER", "POVERTY", "EMERGENCY", "OTHER"] as const;
export type HelpCategory = (typeof HELP_CATEGORIES)[number];

export const CATEGORY_META: Record<HelpCategory, { icon: LucideIcon; labelKey: TranslationKey }> = {
  WAR: { icon: Swords, labelKey: "help.categoryWar" },
  DISASTER: { icon: CloudLightning, labelKey: "help.categoryDisaster" },
  POVERTY: { icon: Coins, labelKey: "help.categoryPoverty" },
  EMERGENCY: { icon: Siren, labelKey: "help.categoryEmergency" },
  OTHER: { icon: CircleDot, labelKey: "help.categoryOther" },
};

export const HELP_NEED_TYPES = ["MONEY", "SUPPLIES", "SKILLS", "VOLUNTEERS"] as const;
export type HelpNeedType = (typeof HELP_NEED_TYPES)[number];

export const NEED_TYPE_META: Record<HelpNeedType, { icon: LucideIcon; labelKey: TranslationKey }> = {
  MONEY: { icon: DollarSign, labelKey: "help.needMoney" },
  SUPPLIES: { icon: Package, labelKey: "help.needSupplies" },
  SKILLS: { icon: Wrench, labelKey: "help.needSkills" },
  VOLUNTEERS: { icon: Users, labelKey: "help.needVolunteers" },
};

export const HELP_CAMPAIGN_STATUSES = [
  "PENDING_REVIEW",
  "ACTIVE",
  "REJECTED",
  "COMPLETED",
  "CLOSED",
  "REMOVED",
] as const;
export type HelpCampaignStatus = (typeof HELP_CAMPAIGN_STATUSES)[number];

export const STATUS_LABEL_KEYS: Record<HelpCampaignStatus, TranslationKey> = {
  PENDING_REVIEW: "help.statusPendingReview",
  ACTIVE: "help.statusActive",
  REJECTED: "help.statusRejected",
  COMPLETED: "help.statusCompleted",
  CLOSED: "help.statusClosed",
  REMOVED: "help.statusRemoved",
};

export const STATUS_STYLES: Record<HelpCampaignStatus, string> = {
  PENDING_REVIEW: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400",
  ACTIVE: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
  REJECTED: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
  COMPLETED: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
  CLOSED: "bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400",
  REMOVED: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
};

export const HELP_OFFER_STATUSES = ["PENDING", "ACKNOWLEDGED", "FULFILLED", "DECLINED"] as const;
export type HelpOfferStatus = (typeof HELP_OFFER_STATUSES)[number];

export const OFFER_STATUS_LABEL_KEYS: Record<HelpOfferStatus, TranslationKey> = {
  PENDING: "help.offerStatusPending",
  ACKNOWLEDGED: "help.offerStatusAcknowledged",
  FULFILLED: "help.offerStatusFulfilled",
  DECLINED: "help.offerStatusDeclined",
};

export interface HelpOrganizer {
  id: string;
  username: string;
  name: string | null;
  avatarUrl: string | null;
  badgeType: string | null;
}

export interface HelpCampaignSummary {
  id: string;
  category: HelpCategory;
  needTypes: HelpNeedType[];
  title: string;
  description: string;
  location: string | null;
  goalAmount: number | null;
  currency: string;
  raisedAmount: number;
  imageUrls: string[];
  status?: HelpCampaignStatus;
  rejectionReason?: string | null;
  views?: number;
  createdAt: string;
  organizer?: HelpOrganizer;
}

export function formatCampaignAmount(amount: number, currency: string, locale: string): string {
  try {
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency: currency === "USDC" ? "USD" : currency,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `${amount.toLocaleString(locale)} ${currency}`;
  }
}

export function campaignProgress(raisedAmount: number, goalAmount: number | null): number {
  if (!goalAmount || goalAmount <= 0) return 0;
  return Math.max(0, Math.min(1, raisedAmount / goalAmount));
}
