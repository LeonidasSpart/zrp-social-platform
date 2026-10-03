import { LiveAudioError } from "@/lib/live-audio/errors";

/**
 * Reuses LiveAudioError rather than a parallel error class - every
 * route-helper that already catches `instanceof LiveAudioError`
 * (live-audio AND live-video's withLiveAudioAuth, see
 * live-video/route-helpers.ts's own comment on why that reuse is
 * safe) maps a thrown LiveGiftErrors.xxx() correctly for free.
 */
export const LiveGiftErrors = {
  giftNotFound: () => new LiveAudioError("gift_not_found", "This gift is not available.", 404),
  giftDisabled: () => new LiveAudioError("gift_disabled", "This gift is not currently available.", 400),
  invalidQuantity: () => new LiveAudioError("invalid_quantity", "Quantity must be a positive whole number.", 400),
  insufficientBalance: () =>
    new LiveAudioError("insufficient_balance", "You don't have enough coins for this gift.", 402),
  roomNotFound: () => new LiveAudioError("room_not_found", "Room not found.", 404),
  roomNotLive: () => new LiveAudioError("room_not_live", "This room is not live.", 409),
  notParticipant: () => new LiveAudioError("not_participant", "You're not in this room.", 409),
  blocked: () => new LiveAudioError("blocked", "You can't send a gift to this host.", 403),
  cannotGiftSelf: () => new LiveAudioError("cannot_gift_self", "You can't send a gift to yourself.", 400),
  duplicateTransaction: () =>
    new LiveAudioError("duplicate_transaction", "This payment has already been processed.", 409),
  invalidTransaction: () =>
    new LiveAudioError("invalid_transaction", "Invalid or pending transaction.", 400),
  amountMismatch: () =>
    new LiveAudioError("amount_mismatch", "Transaction amount does not match the requested purchase.", 400),
  validation: (message: string) => new LiveAudioError("validation_error", message, 400),
};
