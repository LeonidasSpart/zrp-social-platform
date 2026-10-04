"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Gift, Loader2 } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import { Avatar } from "@/components/ui/avatar";
import type { TranslationKey } from "@/lib/translations";
import LiveSheet from "./LiveSheet";
import BuyCoinsModal from "./BuyCoinsModal";
import { useLiveSocketEvent } from "./useLiveSocketEvent";
import {
  displayNameOf,
  giftDisplayName,
  liveErrorMessage,
  liveRequest,
  liveRoomBase,
  LiveApiError,
  type LiveParticipantSummary,
  type LiveRoomType,
} from "./live-api";
import styles from "./live.module.css";

interface GiftDefinition {
  id: string;
  key: string;
  priceCoins: number;
  iconUrl: string | null;
  animationUrl: string | null;
  enabled: boolean;
  sortOrder: number;
}

interface ReceivedGift {
  id: string;
  quantity: number;
  totalCoins: number;
  createdAt: string;
  giftDefinition: { key: string; iconUrl: string | null };
  sender: { id: string; username: string; name: string | null; avatarUrl: string | null };
}

interface GiftEvent {
  transactionId: string;
  senderId: string;
  giftKey: string;
  quantity: number;
  totalCoins: number;
}

const QUANTITIES = [1, 5, 10] as const;

const SEND_ERROR_KEYS: Record<string, TranslationKey> = {
  insufficient_balance: "liveGifts.errInsufficientBalance",
  gift_not_found: "liveGifts.errUnavailable",
  gift_disabled: "liveGifts.errUnavailable",
  gift_unavailable_window: "liveGifts.errNotAvailableYet",
  gift_requires_higher_plan: "liveGifts.errRequiresHigherPlan",
  cannot_gift_self: "liveGifts.errSelf",
  duplicate_transaction: "liveGifts.errDuplicate",
};

function GiftIcon({ iconUrl, className }: { iconUrl: string | null | undefined; className: string }) {
  if (iconUrl) {
    // Admin-configured catalog art from an arbitrary https host (CSP
    // img-src allows https:); next/image would need every host listed in
    // next.config's remotePatterns, which an admin catalog can't promise.
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={iconUrl} alt="" className={`${className} object-contain`} loading="lazy" />;
  }
  return <Gift className={`${className} text-zrp-red`} aria-hidden="true" />;
}

export default function LiveGiftPanel({
  roomType,
  roomId,
  myUserId,
  isHost,
  participants,
}: {
  roomType: LiveRoomType;
  roomId: string;
  myUserId: string | undefined;
  /** The host is the gift recipient: they see what they've received instead of a send form. */
  isHost: boolean;
  participants: LiveParticipantSummary[];
}) {
  const { t } = useLanguage();
  const tRef = useRef(t);
  tRef.current = t;

  const [open, setOpen] = useState(false);
  const [catalog, setCatalog] = useState<GiftDefinition[] | null>(null);
  const catalogRequested = useRef(false);

  const loadCatalog = useCallback(async () => {
    catalogRequested.current = true;
    const data = await liveRequest<{ gifts: GiftDefinition[] }>("/api/live/gifts", tRef.current);
    setCatalog(data.gifts ?? []);
    return data.gifts ?? [];
  }, []);

  // ── Realtime gift toasts (every viewer, not just the sender) ──────
  const [queue, setQueue] = useState<GiftEvent[]>([]);
  const seenRef = useRef<Set<string>>(new Set());

  const enqueueGift = useCallback(
    (event: GiftEvent) => {
      if (seenRef.current.has(event.transactionId)) return;
      seenRef.current.add(event.transactionId);
      if (seenRef.current.size > 200) seenRef.current = new Set(Array.from(seenRef.current).slice(-100));
      if (!catalogRequested.current) void loadCatalog().catch(() => {});
      setQueue((prev) => {
        // A burst of the same gift from the same sender coalesces into
        // one toast with the summed quantity instead of stacking up.
        const last = prev[prev.length - 1];
        if (prev.length > 1 && last.senderId === event.senderId && last.giftKey === event.giftKey) {
          return [...prev.slice(0, -1), { ...last, quantity: last.quantity + event.quantity }];
        }
        // Bounded: a flood drops the oldest waiting toasts, never the one on screen.
        const next = [...prev, event];
        return next.length > 8 ? [next[0], ...next.slice(-7)] : next;
      });
    },
    [loadCatalog]
  );

  useLiveSocketEvent<GiftEvent>(myUserId, "live-gift:sent", enqueueGift);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="inline-flex items-center gap-1.5 min-h-11 px-3 rounded-full bg-gray-100 dark:bg-white/10 text-gray-900 dark:text-white font-semibold text-sm hover:bg-gray-200 dark:hover:bg-white/20 transition"
      >
        <Gift className="w-5 h-5 text-zrp-red" aria-hidden="true" />
        <span className="sr-only sm:not-sr-only">{isHost ? t("liveGifts.received") : t("liveGifts.sendGift")}</span>
      </button>

      <LiveSheet
        open={open}
        title={isHost ? t("liveGifts.received") : t("liveGifts.sendGift")}
        onClose={() => setOpen(false)}
      >
        {isHost ? (
          <ReceivedGifts />
        ) : (
          <SendGiftForm
            roomType={roomType}
            roomId={roomId}
            catalog={catalog}
            loadCatalog={loadCatalog}
            onSent={(gift) => enqueueGift({ ...gift, senderId: myUserId ?? gift.senderId })}
          />
        )}
      </LiveSheet>

      <GiftToastOverlay
        queue={queue}
        onDone={() => setQueue((prev) => prev.slice(1))}
        catalog={catalog}
        participants={participants}
      />
    </>
  );
}

function SendGiftForm({
  roomType,
  roomId,
  catalog,
  loadCatalog,
  onSent,
}: {
  roomType: LiveRoomType;
  roomId: string;
  catalog: GiftDefinition[] | null;
  loadCatalog: () => Promise<GiftDefinition[]>;
  onSent: (gift: GiftEvent) => void;
}) {
  const { t } = useLanguage();
  const tRef = useRef(t);
  tRef.current = t;

  const [balance, setBalance] = useState<number | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [quantity, setQuantity] = useState<number>(1);
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [buyCoinsOpen, setBuyCoinsOpen] = useState(false);

  const refreshBalance = useCallback(async () => {
    const data = await liveRequest<{ balance: number }>("/api/wallet/coins/balance", tRef.current);
    setBalance(data.balance);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      await Promise.all([loadCatalog(), refreshBalance()]);
    } catch (err) {
      setLoadError(liveErrorMessage(err, tRef.current));
    } finally {
      setLoading(false);
    }
  }, [loadCatalog, refreshBalance]);

  useEffect(() => {
    void load();
  }, [load]);

  const selected = catalog?.find((g) => g.key === selectedKey) ?? null;
  const total = selected ? selected.priceCoins * quantity : 0;
  const cannotAfford = selected !== null && balance !== null && total > balance;

  const send = async () => {
    if (!selected || sending) return;
    setSending(true);
    setSendError(null);
    try {
      const data = await liveRequest<{ gift: GiftEvent }>(`${liveRoomBase(roomType, roomId)}/gifts`, tRef.current, {
        method: "POST",
        body: { giftKey: selected.key, quantity, idempotencyKey: crypto.randomUUID() },
      });
      onSent(data.gift);
    } catch (err) {
      setSendError(liveErrorMessage(err, tRef.current, SEND_ERROR_KEYS));
      if (
        err instanceof LiveApiError &&
        (err.code === "gift_not_found" || err.code === "gift_disabled" || err.code === "gift_unavailable_window")
      ) {
        setSelectedKey(null);
        void loadCatalog().catch(() => {});
      }
    } finally {
      setSending(false);
      // The server's balance is the only truth - re-read it after every
      // attempt, success or failure, rather than doing local arithmetic.
      void refreshBalance().catch(() => {});
    }
  };

  if (loading && (catalog === null || balance === null)) {
    return (
      <div className="p-4" aria-busy="true">
        <div className="h-5 w-32 rounded bg-gray-100 dark:bg-white/5 animate-pulse mb-4" />
        <div className="grid grid-cols-3 gap-2">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-24 rounded-xl bg-gray-100 dark:bg-white/5 animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="p-6 text-center">
        <p role="alert" className="text-sm text-gray-600 dark:text-gray-300 mb-3">
          {loadError}
        </p>
        <button type="button" onClick={() => void load()} className="min-h-11 px-4 text-sm font-semibold text-zrp-red hover:underline">
          {t("action.retry")}
        </button>
      </div>
    );
  }

  return (
    <div className="p-4 flex flex-col gap-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm text-gray-600 dark:text-gray-300">
          {t("settings.balance")}:{" "}
          <span className="font-semibold text-gray-900 dark:text-white tabular-nums">
            {t("liveGifts.coins", { n: balance ?? 0 })}
          </span>
        </p>
        <button
          type="button"
          onClick={() => setBuyCoinsOpen(true)}
          className="shrink-0 min-h-11 px-3 rounded-full border border-zrp-red/40 text-zrp-red font-semibold text-xs hover:bg-zrp-red/5 transition"
        >
          {t("buyCoins.title")}
        </button>
      </div>

      <BuyCoinsModal
        isOpen={buyCoinsOpen}
        onClose={() => setBuyCoinsOpen(false)}
        onPurchased={() => void refreshBalance().catch(() => {})}
      />

      {catalog && catalog.length === 0 ? (
        <div className="py-8 text-center">
          <Gift className="w-8 h-8 mx-auto text-gray-400 mb-2" aria-hidden="true" />
          <p className="text-sm text-gray-500 dark:text-gray-400">{t("liveGifts.empty")}</p>
        </div>
      ) : (
        <>
          <ul className="grid grid-cols-3 gap-2">
            {catalog?.map((gift) => {
              const isSelected = gift.key === selectedKey;
              return (
                <li key={gift.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedKey(gift.key)}
                    aria-pressed={isSelected}
                    className={`w-full flex flex-col items-center gap-1 p-2 rounded-xl border transition ${
                      isSelected
                        ? "border-zrp-red bg-zrp-red/5"
                        : "border-gray-200 dark:border-gray-700 hover:border-zrp-red/50"
                    }`}
                  >
                    <GiftIcon iconUrl={gift.iconUrl} className="w-10 h-10" />
                    <span className="w-full truncate text-xs font-medium text-gray-900 dark:text-white">
                      {giftDisplayName(gift.key)}
                    </span>
                    <span className="text-[11px] text-gray-500 dark:text-gray-400 tabular-nums">
                      {t("liveGifts.coins", { n: gift.priceCoins })}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>

          <fieldset>
            <legend className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-2">{t("liveGifts.quantity")}</legend>
            <div className="flex gap-2">
              {QUANTITIES.map((q) => (
                <button
                  key={q}
                  type="button"
                  onClick={() => setQuantity(q)}
                  aria-pressed={quantity === q}
                  className={`min-h-11 min-w-11 px-3 rounded-md border text-sm font-semibold tabular-nums transition ${
                    quantity === q
                      ? "border-zrp-red bg-zrp-red text-white"
                      : "border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-200 hover:border-zrp-red/50"
                  }`}
                >
                  ×{q}
                </button>
              ))}
            </div>
          </fieldset>

          {(sendError || cannotAfford) && (
            <p role="alert" aria-live="polite" className="text-sm text-zrp-red">
              {sendError ?? t("liveGifts.errInsufficientBalance")}
            </p>
          )}

          <button
            type="button"
            onClick={() => void send()}
            disabled={!selected || sending || cannotAfford}
            aria-busy={sending}
            className="inline-flex items-center justify-center gap-2 min-h-11 px-5 rounded-full bg-zrp-red text-white font-semibold text-sm hover:bg-zrp-darkRed transition disabled:opacity-50"
          >
            {sending ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> : <Gift className="w-4 h-4" aria-hidden="true" />}
            {t("liveGifts.sendGift")}
            {selected && <span className="tabular-nums">· {t("liveGifts.coins", { n: total })}</span>}
          </button>
        </>
      )}
    </div>
  );
}

function ReceivedGifts() {
  const { t, language } = useLanguage();
  const tRef = useRef(t);
  tRef.current = t;
  const [gifts, setGifts] = useState<ReceivedGift[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    setGifts(null);
    try {
      const data = await liveRequest<{ gifts: ReceivedGift[] }>("/api/creator/gifts", tRef.current);
      setGifts(data.gifts ?? []);
    } catch (err) {
      setError(liveErrorMessage(err, tRef.current));
      setGifts([]);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (error) {
    return (
      <div className="p-6 text-center">
        <p role="alert" className="text-sm text-gray-600 dark:text-gray-300 mb-3">
          {error}
        </p>
        <button type="button" onClick={() => void load()} className="min-h-11 px-4 text-sm font-semibold text-zrp-red hover:underline">
          {t("action.retry")}
        </button>
      </div>
    );
  }

  if (gifts === null) {
    return (
      <div className="p-4 flex flex-col gap-3" aria-busy="true">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-12 rounded-xl bg-gray-100 dark:bg-white/5 animate-pulse" />
        ))}
      </div>
    );
  }

  if (gifts.length === 0) {
    return (
      <div className="py-10 px-4 text-center">
        <Gift className="w-8 h-8 mx-auto text-gray-400 mb-2" aria-hidden="true" />
        <p className="text-sm text-gray-500 dark:text-gray-400">{t("liveGifts.receivedEmpty")}</p>
      </div>
    );
  }

  const timeFormat = new Intl.DateTimeFormat(language, { dateStyle: "short", timeStyle: "short" });

  return (
    <ul className="divide-y divide-gray-100 dark:divide-gray-800">
      {gifts.map((g) => (
        <li key={g.id} className="flex items-center gap-3 px-4 py-3">
          <Avatar src={g.sender.avatarUrl} alt="" name={displayNameOf(g.sender)} className="w-9 h-9 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm text-gray-900 dark:text-white truncate">
              {t("liveGifts.sentBy", {
                name: displayNameOf(g.sender),
                gift: giftDisplayName(g.giftDefinition.key),
                n: g.quantity,
              })}
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              <time dateTime={g.createdAt}>{timeFormat.format(new Date(g.createdAt))}</time>
            </p>
          </div>
          <span className="shrink-0 text-xs font-semibold text-gray-700 dark:text-gray-200 tabular-nums">
            {t("liveGifts.coins", { n: g.totalCoins })}
          </span>
        </li>
      ))}
    </ul>
  );
}

const TOAST_VISIBLE_MS = 2600;
const TOAST_LEAVE_MS = 200;

/**
 * One toast at a time, top-centre, pointer-events-none so it never
 * blocks the video or the room controls. Timer-driven (not
 * animation-driven), so reduced-motion users still get the full
 * reading time even though the entrance animation is collapsed.
 */
function GiftToastOverlay({
  queue,
  onDone,
  catalog,
  participants,
}: {
  queue: GiftEvent[];
  onDone: () => void;
  catalog: GiftDefinition[] | null;
  participants: LiveParticipantSummary[];
}) {
  const { t } = useLanguage();
  const [mounted, setMounted] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;
  const current = queue[0];

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!current) return;
    setLeaving(false);
    const leaveTimer = setTimeout(() => setLeaving(true), TOAST_VISIBLE_MS);
    const doneTimer = setTimeout(() => onDoneRef.current(), TOAST_VISIBLE_MS + TOAST_LEAVE_MS);
    return () => {
      clearTimeout(leaveTimer);
      clearTimeout(doneTimer);
    };
  }, [current?.transactionId]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!mounted) return null;

  let text = "";
  let iconUrl: string | null = null;
  if (current) {
    const sender = participants.find((p) => p.user.id === current.senderId);
    const giftName = giftDisplayName(current.giftKey);
    iconUrl = catalog?.find((g) => g.key === current.giftKey)?.iconUrl ?? null;
    // A sender who has already left the room is no longer in the
    // participant list - show the gift itself rather than a made-up name.
    text = sender
      ? t("liveGifts.sentBy", { name: displayNameOf(sender.user), gift: giftName, n: current.quantity })
      : `${giftName} ×${current.quantity}`;
  }

  return createPortal(
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed z-[10000] inset-x-0 top-[calc(4.5rem+env(safe-area-inset-top))] flex justify-center px-4"
    >
      {current && (
        <div
          key={current.transactionId}
          className={`${leaving ? styles.giftToastLeaving : styles.giftToast} flex items-center gap-3 max-w-full ps-2 pe-4 py-2 rounded-full border border-zrp-red/30 bg-white/95 dark:bg-zrp-charcoal/95 shadow-lg`}
        >
          <span className={`${styles.giftIcon} shrink-0 inline-flex items-center justify-center w-10 h-10 rounded-full bg-zrp-red/10`}>
            <GiftIcon iconUrl={iconUrl} className="w-7 h-7" />
          </span>
          <span className="min-w-0 truncate text-sm font-semibold text-gray-900 dark:text-white">
            <bdi>{text}</bdi>
          </span>
        </div>
      )}
    </div>,
    document.body
  );
}
