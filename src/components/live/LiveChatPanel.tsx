"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState, type FormEvent } from "react";
import { Loader2, MessageCircle, MoreHorizontal, Send, Trash2, VolumeX, MessageSquare } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import { Avatar } from "@/components/ui/avatar";
import type { TranslationKey } from "@/lib/translations";
import LiveSheet from "./LiveSheet";
import { useLiveSocketEvent } from "./useLiveSocketEvent";
import {
  displayNameOf,
  isLiveAuthority,
  liveErrorMessage,
  liveRequest,
  liveRoomBase,
  LiveApiError,
  type LiveParticipantRole,
  type LiveParticipantSummary,
  type LiveRoomType,
} from "./live-api";

// Mirrors MAX_MESSAGE_LENGTH in src/lib/live-chat/chat-service.ts; the
// server stays authoritative, this only stops an over-long send early.
const MAX_LENGTH = 500;
const SLOW_MODE_OPTIONS = [0, 10, 30, 60, 300] as const;

type ChatUser = LiveParticipantSummary["user"];

interface ChatMessage {
  id: string;
  body: string;
  createdAt: string;
  authorId: string;
}

interface HistoryMessage {
  id: string;
  body: string;
  createdAt: string;
  author: ChatUser;
}

const SEND_ERROR_KEYS: Record<string, TranslationKey> = {
  chat_muted: "liveChat.errMuted",
};

export default function LiveChatPanel({
  roomType,
  roomId,
  myUserId,
  myRole,
  participants,
  initialSlowModeSeconds,
}: {
  roomType: LiveRoomType;
  roomId: string;
  myUserId: string | undefined;
  myRole: LiveParticipantRole | null;
  participants: LiveParticipantSummary[];
  initialSlowModeSeconds: number;
}) {
  const { t, language } = useLanguage();
  const tRef = useRef(t);
  tRef.current = t;
  const base = liveRoomBase(roomType, roomId);
  const amAuthority = isLiveAuthority(myRole);
  const inputId = useId();
  const slowSelectId = useId();

  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState(0);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [historyAuthors, setHistoryAuthors] = useState<Record<string, ChatUser>>({});
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [historyState, setHistoryState] = useState<"loading" | "ready" | "error">("loading");
  const [loadingMore, setLoadingMore] = useState(false);
  const [slowMode, setSlowMode] = useState(initialSlowModeSeconds);
  const [chatMuteOverrides, setChatMuteOverrides] = useState<Record<string, boolean>>({});
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState<{ until: number; kind: "slow" | "rate" } | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [actionsOpenId, setActionsOpenId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const listRef = useRef<HTMLOListElement>(null);
  const nearBottomRef = useRef(true);
  const openRef = useRef(open);
  openRef.current = open;

  useEffect(() => setSlowMode(initialSlowModeSeconds), [initialSlowModeSeconds]);

  const participantById = useMemo(() => {
    const map = new Map<string, LiveParticipantSummary>();
    for (const p of participants) map.set(p.user.id, p);
    return map;
  }, [participants]);

  const authorOf = (id: string): ChatUser | null => participantById.get(id)?.user ?? historyAuthors[id] ?? null;
  const isChatMuted = (id: string) => chatMuteOverrides[id] ?? participantById.get(id)?.isChatMuted ?? false;
  const iAmChatMuted = myUserId ? isChatMuted(myUserId) : false;

  const mergeHistory = useCallback((page: HistoryMessage[], mode: "replace-latest" | "prepend") => {
    setHistoryAuthors((prev) => {
      const next = { ...prev };
      for (const m of page) next[m.author.id] = m.author;
      return next;
    });
    // API pages are newest-first; the list renders oldest-first.
    const asc = page
      .slice()
      .reverse()
      .map((m) => ({ id: m.id, body: m.body, createdAt: m.createdAt, authorId: m.author.id }));
    setMessages((prev) => {
      const seen = new Set(prev.map((m) => m.id));
      const fresh = asc.filter((m) => !seen.has(m.id));
      const merged = mode === "prepend" ? [...fresh, ...prev] : [...prev, ...fresh];
      return merged.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    });
  }, []);

  const loadLatest = useCallback(async () => {
    const data = await liveRequest<{ messages: HistoryMessage[]; nextCursor: string | null }>(
      `${base}/chat?limit=50`,
      tRef.current
    );
    mergeHistory(data.messages, "replace-latest");
    return data;
  }, [base, mergeHistory]);

  const backfill = useCallback(async () => {
    setHistoryState("loading");
    try {
      const data = await loadLatest();
      setNextCursor(data.nextCursor);
      setHistoryState("ready");
    } catch {
      setHistoryState("error");
    }
  }, [loadLatest]);

  useEffect(() => {
    void backfill();
  }, [backfill]);

  const loadEarlier = async () => {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    const list = listRef.current;
    const prevHeight = list?.scrollHeight ?? 0;
    try {
      const data = await liveRequest<{ messages: HistoryMessage[]; nextCursor: string | null }>(
        `${base}/chat?limit=50&cursor=${encodeURIComponent(nextCursor)}`,
        tRef.current
      );
      mergeHistory(data.messages, "prepend");
      setNextCursor(data.nextCursor);
      // Keep the reader's place instead of jumping when older rows land above.
      requestAnimationFrame(() => {
        if (list) list.scrollTop += list.scrollHeight - prevHeight;
      });
    } catch (err) {
      setActionError(liveErrorMessage(err, tRef.current));
    } finally {
      setLoadingMore(false);
    }
  };

  // A message from someone no longer in the participant list (and not in
  // any history page yet) has no name to show - re-read the latest page,
  // which carries author objects, rather than inventing one.
  const authorRefetchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const requestAuthorRefetch = useCallback(() => {
    if (authorRefetchTimer.current) return;
    authorRefetchTimer.current = setTimeout(() => {
      authorRefetchTimer.current = null;
      void loadLatest().catch(() => {});
    }, 500);
  }, [loadLatest]);
  useEffect(
    () => () => {
      if (authorRefetchTimer.current) clearTimeout(authorRefetchTimer.current);
    },
    []
  );

  const appendMessage = useCallback((m: ChatMessage) => {
    setMessages((prev) => (prev.some((x) => x.id === m.id) ? prev : [...prev, m]));
  }, []);

  useLiveSocketEvent<{ id: string; authorId: string; body: string; createdAt: string }>(myUserId, "live-chat:message", (m) => {
    appendMessage({ id: m.id, authorId: m.authorId, body: m.body, createdAt: String(m.createdAt) });
    if (!participantById.has(m.authorId) && !historyAuthors[m.authorId]) requestAuthorRefetch();
    if (!openRef.current && m.authorId !== myUserId) setUnread((n) => n + 1);
  });
  useLiveSocketEvent<{ id: string }>(myUserId, "live-chat:message-deleted", ({ id }) => {
    setMessages((prev) => prev.filter((m) => m.id !== id));
  });
  useLiveSocketEvent<{ userId: string; isChatMuted: boolean }>(myUserId, "live-chat:mute-changed", ({ userId, isChatMuted: muted }) => {
    setChatMuteOverrides((prev) => ({ ...prev, [userId]: muted }));
  });
  useLiveSocketEvent<{ seconds: number }>(myUserId, "live-chat:slow-mode-changed", ({ seconds }) => {
    if (typeof seconds === "number") setSlowMode(seconds);
  });

  // Stick to the bottom as messages arrive, unless the reader scrolled up.
  useEffect(() => {
    const list = listRef.current;
    if (list && nearBottomRef.current) list.scrollTop = list.scrollHeight;
  }, [messages, open]);

  useEffect(() => {
    if (open) setUnread(0);
  }, [open]);

  // Countdown tick, only while a cooldown is running.
  useEffect(() => {
    if (!cooldown) return;
    const id = setInterval(() => {
      const ts = Date.now();
      setNow(ts);
      if (ts >= cooldown.until) setCooldown(null);
    }, 250);
    return () => clearInterval(id);
  }, [cooldown]);

  const startCooldown = (seconds: number, kind: "slow" | "rate") => {
    if (seconds <= 0) return;
    const ts = Date.now();
    setNow(ts);
    setCooldown({ until: ts + seconds * 1000, kind });
  };

  const secondsLeft = cooldown ? Math.max(1, Math.ceil((cooldown.until - now) / 1000)) : 0;
  const trimmed = draft.trim();
  const inputDisabled = iAmChatMuted || cooldown !== null || sending;

  const send = async (e: FormEvent) => {
    e.preventDefault();
    if (!trimmed || trimmed.length > MAX_LENGTH || inputDisabled) return;
    setSending(true);
    setSendError(null);
    try {
      const data = await liveRequest<{ message: { id: string; authorId: string; body: string; createdAt: string } }>(
        `${base}/chat`,
        tRef.current,
        { method: "POST", body: { body: trimmed } }
      );
      appendMessage({ ...data.message, createdAt: String(data.message.createdAt) });
      nearBottomRef.current = true;
      setDraft("");
      // The server applies slow mode to every sender, host included.
      startCooldown(slowMode, "slow");
    } catch (err) {
      if (err instanceof LiveApiError && err.code === "slow_mode") {
        startCooldown(err.retryAfter ?? slowMode, "slow");
      } else if (err instanceof LiveApiError && err.code === "rate_limited") {
        startCooldown(err.retryAfter ?? 10, "rate");
      } else {
        if (err instanceof LiveApiError && err.code === "chat_muted" && myUserId) {
          setChatMuteOverrides((prev) => ({ ...prev, [myUserId]: true }));
        }
        setSendError(liveErrorMessage(err, tRef.current, SEND_ERROR_KEYS));
      }
    } finally {
      setSending(false);
    }
  };

  const deleteMessage = async (id: string) => {
    setBusyId(id);
    setActionError(null);
    try {
      await liveRequest(`${base}/chat/${id}`, tRef.current, { method: "DELETE" });
      setMessages((prev) => prev.filter((m) => m.id !== id));
      setActionsOpenId(null);
    } catch (err) {
      setActionError(liveErrorMessage(err, tRef.current));
    } finally {
      setBusyId(null);
    }
  };

  const toggleChatMute = async (messageId: string, userId: string) => {
    const muted = !isChatMuted(userId);
    setBusyId(messageId);
    setActionError(null);
    try {
      await liveRequest(`${base}/chat/mute`, tRef.current, { method: "POST", body: { userId, muted } });
      setChatMuteOverrides((prev) => ({ ...prev, [userId]: muted }));
      setActionsOpenId(null);
    } catch (err) {
      setActionError(liveErrorMessage(err, tRef.current));
    } finally {
      setBusyId(null);
    }
  };

  const changeSlowMode = async (seconds: number) => {
    const previous = slowMode;
    setActionError(null);
    setSlowMode(seconds);
    try {
      await liveRequest(`${base}/chat/slow-mode`, tRef.current, { method: "POST", body: { seconds } });
    } catch (err) {
      setSlowMode(previous);
      setActionError(liveErrorMessage(err, tRef.current));
    }
  };

  const timeFormat = new Intl.DateTimeFormat(language, { timeStyle: "short" });

  const slowModeBar = amAuthority ? (
    <div className="flex items-center gap-2 px-4 py-2 border-b border-gray-100 dark:border-gray-800">
      <label htmlFor={slowSelectId} className="text-xs font-semibold text-gray-500 dark:text-gray-400">
        {t("liveChat.slowModeLabel")}
      </label>
      <select
        id={slowSelectId}
        value={slowMode}
        onChange={(e) => void changeSlowMode(Number(e.target.value))}
        className="min-h-11 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-zrp-deepBlack px-2 text-sm text-gray-900 dark:text-white"
      >
        {/* A value set from another client (e.g. 45s) is still shown truthfully. */}
        {!SLOW_MODE_OPTIONS.includes(slowMode as (typeof SLOW_MODE_OPTIONS)[number]) && (
          <option value={slowMode}>{t("liveChat.slowModeSeconds", { n: slowMode })}</option>
        )}
        {SLOW_MODE_OPTIONS.map((s) => (
          <option key={s} value={s}>
            {s === 0 ? t("liveChat.slowModeOff") : t("liveChat.slowModeSeconds", { n: s })}
          </option>
        ))}
      </select>
    </div>
  ) : slowMode > 0 ? (
    <p className="px-4 py-2 border-b border-gray-100 dark:border-gray-800 text-xs text-gray-500 dark:text-gray-400">
      {t("liveChat.slowModeLabel")}: {t("liveChat.slowModeSeconds", { n: slowMode })}
    </p>
  ) : null;

  const composer = (
    <form onSubmit={send} className="p-3 flex flex-col gap-1.5">
      {iAmChatMuted ? (
        <p role="status" className="text-sm text-gray-600 dark:text-gray-300 px-1 py-2">
          {t("liveChat.errMuted")}
        </p>
      ) : (
        <>
          {cooldown && (
            <p role="status" className="text-xs text-gray-500 dark:text-gray-400 px-1">
              {cooldown.kind === "slow" ? t("liveChat.slowModeWait", { n: secondsLeft }) : t("liveRoom.errRateLimited")}
            </p>
          )}
          {sendError && (
            <p role="alert" aria-live="polite" className="text-xs text-zrp-red px-1">
              {sendError}
            </p>
          )}
          <div className="flex items-center gap-2">
            <label htmlFor={inputId} className="sr-only">
              {t("liveChat.placeholder")}
            </label>
            <input
              id={inputId}
              type="text"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              maxLength={MAX_LENGTH}
              disabled={inputDisabled}
              placeholder={t("liveChat.placeholder")}
              autoComplete="off"
              className="flex-1 min-w-0 min-h-11 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-zrp-deepBlack px-3 text-sm text-gray-900 dark:text-white placeholder:text-gray-500 disabled:opacity-60"
            />
            <button
              type="submit"
              disabled={inputDisabled || !trimmed}
              aria-label={t("chat.sendMessageAria")}
              aria-busy={sending}
              className="shrink-0 inline-flex items-center justify-center w-11 h-11 rounded-full bg-zrp-red text-white hover:bg-zrp-darkRed transition disabled:opacity-50"
            >
              {sending ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> : <Send className="w-4 h-4 rtl:-scale-x-100" aria-hidden="true" />}
            </button>
          </div>
          {draft.length >= MAX_LENGTH - 100 && (
            <p className={`text-[11px] tabular-nums text-end px-1 ${draft.length >= MAX_LENGTH ? "text-zrp-red" : "text-gray-500 dark:text-gray-400"}`}>
              {draft.length}/{MAX_LENGTH}
            </p>
          )}
        </>
      )}
    </form>
  );

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="relative inline-flex items-center gap-1.5 min-h-11 px-3 rounded-full bg-gray-100 dark:bg-white/10 text-gray-900 dark:text-white font-semibold text-sm hover:bg-gray-200 dark:hover:bg-white/20 transition"
      >
        <MessageCircle className="w-5 h-5" aria-hidden="true" />
        <span className="sr-only sm:not-sr-only">{t("liveChat.title")}</span>
        {unread > 0 && (
          <span className="absolute -top-1 -end-1 min-w-5 h-5 px-1 rounded-full bg-zrp-red text-white text-[11px] font-bold leading-5 text-center tabular-nums">
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </button>

      <LiveSheet open={open} title={t("liveChat.title")} onClose={() => setOpen(false)} footer={composer} keepMounted variant="fill">
        {slowModeBar}
        {actionError && (
          <p role="alert" aria-live="polite" className="px-4 py-2 text-xs text-zrp-red">
            {actionError}
          </p>
        )}
        {historyState === "loading" && messages.length === 0 ? (
          <div className="flex-1 p-4 flex flex-col gap-3" aria-busy="true">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="flex gap-2">
                <div className="w-7 h-7 rounded-full bg-gray-100 dark:bg-white/5 animate-pulse shrink-0" />
                <div className="flex-1 h-10 rounded-xl bg-gray-100 dark:bg-white/5 animate-pulse" />
              </div>
            ))}
          </div>
        ) : historyState === "error" && messages.length === 0 ? (
          <div className="flex-1 p-6 text-center">
            <p role="alert" className="text-sm text-gray-600 dark:text-gray-300 mb-3">
              {t("liveAudio.genericError")}
            </p>
            <button type="button" onClick={() => void backfill()} className="min-h-11 px-4 text-sm font-semibold text-zrp-red hover:underline">
              {t("action.retry")}
            </button>
          </div>
        ) : messages.length === 0 ? (
          <div className="flex-1 py-12 px-4 text-center">
            <MessageCircle className="w-8 h-8 mx-auto text-gray-400 mb-2" aria-hidden="true" />
            <p className="text-sm text-gray-500 dark:text-gray-400">{t("chat.noMessagesYet")}</p>
          </div>
        ) : (
          <ol
            ref={listRef}
            role="log"
            aria-live="polite"
            aria-relevant="additions"
            onScroll={(e) => {
              const el = e.currentTarget;
              nearBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
            }}
            className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-2 py-2 flex flex-col gap-0.5"
          >
            {nextCursor && (
              <li className="flex justify-center py-1">
                <button
                  type="button"
                  onClick={() => void loadEarlier()}
                  disabled={loadingMore}
                  className="min-h-11 px-4 text-xs font-semibold text-zrp-red hover:underline disabled:opacity-50"
                >
                  {t("feed.loadMore")}
                </button>
              </li>
            )}
            {messages.map((m) => {
              const author = authorOf(m.authorId);
              const authorRole = participantById.get(m.authorId)?.role ?? null;
              const isMine = m.authorId === myUserId;
              const canDelete = isMine || amAuthority;
              const canMute = amAuthority && !isMine && authorRole !== "HOST";
              const hasActions = canDelete || canMute;
              const muted = isChatMuted(m.authorId);
              return (
                <li key={m.id} className="rounded-xl px-2 py-1.5 hover:bg-gray-50 dark:hover:bg-white/5">
                  <div className="flex items-start gap-2">
                    {author ? (
                      <Avatar src={author.avatarUrl} alt="" name={displayNameOf(author)} className="w-7 h-7 shrink-0 mt-0.5" />
                    ) : (
                      <div className="w-7 h-7 shrink-0 mt-0.5 rounded-full bg-gray-100 dark:bg-white/10" aria-hidden="true" />
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="flex items-baseline gap-2 min-w-0">
                        {author ? (
                          <span className="min-w-0 truncate text-xs font-semibold text-gray-900 dark:text-white">
                            <bdi>{displayNameOf(author)}</bdi>
                          </span>
                        ) : (
                          <span className="inline-block w-16 h-3 rounded bg-gray-100 dark:bg-white/10 animate-pulse" aria-hidden="true" />
                        )}
                        <time dateTime={m.createdAt} className="shrink-0 text-[11px] text-gray-500 dark:text-gray-400">
                          {timeFormat.format(new Date(m.createdAt))}
                        </time>
                      </p>
                      <p className="text-sm text-gray-800 dark:text-gray-100 whitespace-pre-wrap break-words">{m.body}</p>
                    </div>
                    {hasActions && (
                      <button
                        type="button"
                        onClick={() => setActionsOpenId((cur) => (cur === m.id ? null : m.id))}
                        aria-expanded={actionsOpenId === m.id}
                        aria-label={t("post.moreOptions")}
                        className="shrink-0 inline-flex items-center justify-center w-11 h-11 -my-2 -me-1 rounded-full text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-white/10 transition"
                      >
                        <MoreHorizontal className="w-4 h-4" aria-hidden="true" />
                      </button>
                    )}
                  </div>
                  {hasActions && actionsOpenId === m.id && (
                    <div className="flex flex-wrap gap-1 ps-9 pt-1">
                      {canDelete && (
                        <button
                          type="button"
                          onClick={() => void deleteMessage(m.id)}
                          disabled={busyId === m.id}
                          className="inline-flex items-center gap-1.5 min-h-11 px-3 rounded-full text-xs font-semibold text-zrp-red hover:bg-zrp-red/10 transition disabled:opacity-50"
                        >
                          <Trash2 className="w-4 h-4" aria-hidden="true" />
                          {t("chat.deleteMessage")}
                        </button>
                      )}
                      {canMute && (
                        <button
                          type="button"
                          onClick={() => void toggleChatMute(m.id, m.authorId)}
                          disabled={busyId === m.id}
                          className="inline-flex items-center gap-1.5 min-h-11 px-3 rounded-full text-xs font-semibold text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-white/10 transition disabled:opacity-50"
                        >
                          {muted ? <MessageSquare className="w-4 h-4" aria-hidden="true" /> : <VolumeX className="w-4 h-4" aria-hidden="true" />}
                          {muted ? t("liveChat.unmuteUser") : t("liveChat.muteUser")}
                        </button>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ol>
        )}
      </LiveSheet>
    </>
  );
}
