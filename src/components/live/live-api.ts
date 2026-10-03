import { localizeApiMessage } from "@/lib/api-error-i18n";
import type { TranslationKey } from "@/lib/translations";

export type LiveRoomType = "AUDIO" | "VIDEO";
export type LiveParticipantRole = "LISTENER" | "SPEAKER" | "MODERATOR" | "HOST";

/** The subset of a room-detail participant row the shared Live panels need. */
export interface LiveParticipantSummary {
  role: LiveParticipantRole;
  isChatMuted?: boolean;
  user: { id: string; username: string; name: string | null; avatarUrl: string | null };
}

type Translate = (key: TranslationKey, params?: Record<string, string | number>) => string;

export const isLiveAuthority = (role: LiveParticipantRole | null) => role === "HOST" || role === "MODERATOR";

/** `/api/live-audio/rooms/{id}` or `/api/live-video/rooms/{id}` - every per-room endpoint hangs off this. */
export function liveRoomBase(roomType: LiveRoomType, roomId: string): string {
  return `/api/live-${roomType === "AUDIO" ? "audio" : "video"}/rooms/${roomId}`;
}

/**
 * A failed Live API call. Carries the backend's typed `code` (and
 * `retryAfter` for slow_mode/rate_limited) so each panel can show a
 * specific message, rather than only a pre-localized string like the
 * room pages' own callAction() throws.
 */
export class LiveApiError extends Error {
  code: string | null;
  status: number;
  retryAfter: number | null;

  constructor(message: string, code: string | null, status: number, retryAfter: number | null) {
    super(message);
    this.name = "LiveApiError";
    this.code = code;
    this.status = status;
    this.retryAfter = retryAfter;
  }
}

/**
 * Same shape as the room pages' callAction(): fetch, parse JSON, throw on
 * !ok with the server's message run through localizeApiMessage() - but
 * for any method, and keeping the typed error code.
 */
export async function liveRequest<T = Record<string, unknown>>(
  url: string,
  t: Translate,
  init?: { method?: "GET" | "POST" | "DELETE"; body?: Record<string, unknown> }
): Promise<T> {
  const res = await fetch(url, {
    method: init?.method ?? "GET",
    headers: init?.body ? { "Content-Type": "application/json" } : undefined,
    body: init?.body ? JSON.stringify(init.body) : undefined,
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const headerRetry = Number(res.headers.get("Retry-After"));
    const retryAfter =
      typeof data?.retryAfter === "number" ? data.retryAfter : Number.isFinite(headerRetry) && headerRetry > 0 ? headerRetry : null;
    // The generic route-level limiter (rateLimit()) answers 429 without
    // a typed code; treat it the same as a service-level rate_limited.
    const code = typeof data?.code === "string" ? data.code : res.status === 429 ? "rate_limited" : null;
    throw new LiveApiError(
      localizeApiMessage(data?.error, t) || t("liveAudio.genericError"),
      code,
      res.status,
      retryAfter
    );
  }
  return data as T;
}

/** Error codes shared by every Live panel (gifts, chat, reactions, replay). */
const SHARED_ERROR_KEYS: Record<string, TranslationKey> = {
  not_participant: "liveRoom.errNotParticipant",
  blocked: "liveRoom.errBlocked",
  room_not_live: "liveRoom.errNotLive",
  rate_limited: "liveRoom.errRateLimited",
  room_not_found: "liveAudio.roomNotFound",
};

/**
 * Translated text for a caught error: a feature-specific mapping first,
 * then the shared Live codes, then the (localized-where-known) server
 * message, then the generic Live error.
 */
export function liveErrorMessage(err: unknown, t: Translate, specific: Record<string, TranslationKey> = {}): string {
  if (err instanceof LiveApiError) {
    const key = (err.code && (specific[err.code] ?? SHARED_ERROR_KEYS[err.code])) || null;
    if (key) return t(key);
    return err.message;
  }
  return t("liveAudio.genericError");
}

/**
 * Admin-defined gift keys are lowercase slugs (`/^[a-z0-9_-]+$/`, see
 * /api/admin/live-gifts) and the catalog ships with no seed, so there is
 * no fixed set to translate ahead of time. The slug is shown humanized
 * ("super_rose" -> "Super rose"), the same way other admin-authored
 * catalog content (room titles, community names) is shown as authored.
 */
export function giftDisplayName(key: string): string {
  const spaced = key.replace(/[-_]+/g, " ").trim();
  return spaced ? spaced.charAt(0).toUpperCase() + spaced.slice(1) : key;
}

export function displayNameOf(user: { username: string; name: string | null }): string {
  return user.name || user.username;
}
