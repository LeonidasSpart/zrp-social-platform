import { NextRequest } from "next/server";
import {
  DateRangeOption,
  MediaFilter,
  SearchCategory,
  SearchFilters,
  SearchSort,
  SEARCH_CATEGORIES,
} from "./types";

const SORTS: SearchSort[] = ["relevance", "recent", "engagement", "trending"];
const DATE_RANGES: DateRangeOption[] = ["any", "24h", "7d", "30d", "custom"];
const MEDIA_TYPES: MediaFilter[] = ["image", "video", "gif", "poll", "none"];

/** "all" means every category (the backward-compatible {users, posts, ...} shape). */
export function parseSearchCategory(req: NextRequest): SearchCategory | "all" {
  const raw = req.nextUrl.searchParams.get("type");
  if (!raw || raw === "all") return "all";
  return (SEARCH_CATEGORIES as string[]).includes(raw) ? (raw as SearchCategory) : "all";
}

export function parseSearchSort(req: NextRequest): SearchSort {
  const raw = req.nextUrl.searchParams.get("sort") || "";
  return (SORTS as string[]).includes(raw) ? (raw as SearchSort) : "relevance";
}

function parseDate(value: string | null): Date | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function parseSearchFilters(req: NextRequest): SearchFilters {
  const params = req.nextUrl.searchParams;

  const dateRangeRaw = params.get("dateRange") || "";
  const dateRange: DateRangeOption = (DATE_RANGES as string[]).includes(dateRangeRaw)
    ? (dateRangeRaw as DateRangeOption)
    : "any";

  const mediaRaw = params.get("media") || "";
  const media = (MEDIA_TYPES as string[]).includes(mediaRaw) ? (mediaRaw as MediaFilter) : null;

  return {
    dateRange,
    dateFrom: dateRange === "custom" ? parseDate(params.get("dateFrom")) : null,
    dateTo: dateRange === "custom" ? parseDate(params.get("dateTo")) : null,
    language: params.get("language")?.trim().toLowerCase() || null,
    country: params.get("country")?.trim().toUpperCase() || null,
    media,
    verified: params.get("verified") === "true",
    professional: params.get("professional") === "true",
    creator: params.get("creator") === "true",
    community: params.get("community")?.trim().toLowerCase() || null,
  };
}

/**
 * Resolves dateRange (+ dateFrom/dateTo for "custom") into a Prisma
 * range filter, or null when the range is "any" / a "custom" range with
 * no usable bound - callers just spread the result into their `where`.
 */
export function resolveDateFilter(filters: SearchFilters): { gte?: Date; lte?: Date } | null {
  const now = Date.now();
  switch (filters.dateRange) {
    case "24h":
      return { gte: new Date(now - 24 * 60 * 60 * 1000) };
    case "7d":
      return { gte: new Date(now - 7 * 24 * 60 * 60 * 1000) };
    case "30d":
      return { gte: new Date(now - 30 * 24 * 60 * 60 * 1000) };
    case "custom": {
      if (!filters.dateFrom && !filters.dateTo) return null;
      const range: { gte?: Date; lte?: Date } = {};
      if (filters.dateFrom) range.gte = filters.dateFrom;
      if (filters.dateTo) range.lte = filters.dateTo;
      return range;
    }
    default:
      return null;
  }
}
