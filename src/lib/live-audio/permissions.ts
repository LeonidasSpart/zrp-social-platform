import type { LiveAudioParticipantRole, LiveAudioVisibility } from "@prisma/client";

/*
 * ============================================================
 * Live Audio authorization matrix
 * ============================================================
 *
 * See docs/live-audio-architecture.md §6 for the full table this
 * implements. Every function here is a pure predicate over a role/
 * visibility value already read fresh from Postgres by the caller -
 * nothing here reads the database itself, and nothing here ever
 * accepts a role from request input. The API routes are what fetch the
 * real LiveAudioParticipant.role for (roomId, userId) and pass it in.
 */

const ROOM_AUTHORITY_ROLES: ReadonlySet<LiveAudioParticipantRole> = new Set<LiveAudioParticipantRole>([
  "HOST",
  "MODERATOR",
]);

/** HOST or MODERATOR - the two roles with moderation authority over a room. */
export function isRoomAuthority(role: LiveAudioParticipantRole | null): boolean {
  return role !== null && ROOM_AUTHORITY_ROLES.has(role);
}

/** Only the HOST may end their own room or cancel a scheduled one outright. */
export function canEndRoom(role: LiveAudioParticipantRole | null): boolean {
  return isRoomAuthority(role);
}

export function canCancelScheduledRoom(role: LiveAudioParticipantRole | null): boolean {
  return role === "HOST";
}

export function canPromoteSpeaker(role: LiveAudioParticipantRole | null): boolean {
  return isRoomAuthority(role);
}

export function canDemoteSpeaker(role: LiveAudioParticipantRole | null): boolean {
  return isRoomAuthority(role);
}

export function canMuteParticipant(role: LiveAudioParticipantRole | null): boolean {
  return isRoomAuthority(role);
}

export function canRemoveParticipant(role: LiveAudioParticipantRole | null): boolean {
  return isRoomAuthority(role);
}

export function canResolveSpeakerRequest(role: LiveAudioParticipantRole | null): boolean {
  return isRoomAuthority(role);
}

/** Only a LISTENER can request to speak - anyone already speaking has nothing to request. */
export function canRequestToSpeak(role: LiveAudioParticipantRole | null): boolean {
  return role === "LISTENER";
}

/** Whether this role is allowed to publish audio in the room. */
export function canPublishAudio(role: LiveAudioParticipantRole | null): boolean {
  return role === "HOST" || role === "MODERATOR" || role === "SPEAKER";
}

export interface RoomVisibilityContext {
  visibility: LiveAudioVisibility;
  /** True if the viewer already has a LiveAudioParticipant row (any state) for this room. */
  isParticipant: boolean;
  /** True if the room has a communityId AND the viewer is a member of it. */
  isCommunityMember: boolean;
}

/**
 * Whether a viewer may see a room's details/join it at all. This is the
 * single gate every read/join path must pass through -
 * GET /rooms/[id], POST /rooms/[id]/join, and the discovery list's own
 * filter all call this rather than duplicating visibility logic.
 *
 * A PRIVATE room is invisible to anyone who isn't already a participant
 * - there is no invite-token/link mechanism in this MVP (see the
 * architecture doc's deferred-features list), so "already a participant"
 * only ever becomes true via the host adding someone directly at
 * creation time in a future iteration; for now PRIVATE effectively means
 * "host + whoever the host has already put in the room."
 */
export function canViewRoom(ctx: RoomVisibilityContext): boolean {
  if (ctx.isParticipant) return true;
  switch (ctx.visibility) {
    case "PUBLIC":
      return true;
    case "COMMUNITY":
      return ctx.isCommunityMember;
    case "PRIVATE":
      return false;
  }
}
