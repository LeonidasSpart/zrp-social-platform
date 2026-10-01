import type { AnnouncementStatus } from "@prisma/client";

export const ANNOUNCEMENT_STATUSES: readonly AnnouncementStatus[] = [
  "DRAFT",
  "SCHEDULED",
  "SENDING",
  "SENT",
  "PARTIAL",
  "FAILED",
  "CANCELLED",
];

export function isValidAnnouncementStatus(value: string): value is AnnouncementStatus {
  return (ANNOUNCEMENT_STATUSES as readonly string[]).includes(value);
}
