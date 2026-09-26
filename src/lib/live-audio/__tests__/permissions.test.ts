import { describe, it, expect } from "vitest";
import {
  isRoomAuthority,
  canEndRoom,
  canCancelScheduledRoom,
  canPromoteSpeaker,
  canDemoteSpeaker,
  canMuteParticipant,
  canRemoveParticipant,
  canResolveSpeakerRequest,
  canRequestToSpeak,
  canPublishAudio,
  canViewRoom,
} from "../permissions";

// The full authorization matrix from docs/live-audio-architecture.md §6,
// tested exhaustively per role rather than spot-checked - every cell of
// that table is a real assertion here, both the "yes" and "no" sides.
describe("Live Audio authorization matrix", () => {
  const roles = ["HOST", "MODERATOR", "SPEAKER", "LISTENER", null] as const;

  it("isRoomAuthority is true only for HOST/MODERATOR", () => {
    expect(isRoomAuthority("HOST")).toBe(true);
    expect(isRoomAuthority("MODERATOR")).toBe(true);
    expect(isRoomAuthority("SPEAKER")).toBe(false);
    expect(isRoomAuthority("LISTENER")).toBe(false);
    expect(isRoomAuthority(null)).toBe(false);
  });

  const authorityOnlyChecks: Array<[string, (role: (typeof roles)[number]) => boolean]> = [
    ["canEndRoom", canEndRoom],
    ["canPromoteSpeaker", canPromoteSpeaker],
    ["canDemoteSpeaker", canDemoteSpeaker],
    ["canMuteParticipant", canMuteParticipant],
    ["canRemoveParticipant", canRemoveParticipant],
    ["canResolveSpeakerRequest", canResolveSpeakerRequest],
  ];

  for (const [name, fn] of authorityOnlyChecks) {
    it(`${name}: only HOST and MODERATOR`, () => {
      expect(fn("HOST")).toBe(true);
      expect(fn("MODERATOR")).toBe(true);
      expect(fn("SPEAKER")).toBe(false);
      expect(fn("LISTENER")).toBe(false);
      expect(fn(null)).toBe(false);
    });
  }

  it("canCancelScheduledRoom: HOST only, not even MODERATOR", () => {
    expect(canCancelScheduledRoom("HOST")).toBe(true);
    expect(canCancelScheduledRoom("MODERATOR")).toBe(false);
    expect(canCancelScheduledRoom("SPEAKER")).toBe(false);
    expect(canCancelScheduledRoom("LISTENER")).toBe(false);
    expect(canCancelScheduledRoom(null)).toBe(false);
  });

  it("canRequestToSpeak: LISTENER only - a speaker/host/moderator has nothing to request", () => {
    expect(canRequestToSpeak("LISTENER")).toBe(true);
    expect(canRequestToSpeak("SPEAKER")).toBe(false);
    expect(canRequestToSpeak("MODERATOR")).toBe(false);
    expect(canRequestToSpeak("HOST")).toBe(false);
    expect(canRequestToSpeak(null)).toBe(false);
  });

  it("canPublishAudio: HOST, MODERATOR, SPEAKER - never LISTENER", () => {
    expect(canPublishAudio("HOST")).toBe(true);
    expect(canPublishAudio("MODERATOR")).toBe(true);
    expect(canPublishAudio("SPEAKER")).toBe(true);
    expect(canPublishAudio("LISTENER")).toBe(false);
    expect(canPublishAudio(null)).toBe(false);
  });

  describe("canViewRoom (visibility gate)", () => {
    it("PUBLIC is visible to anyone, participant or not", () => {
      expect(canViewRoom({ visibility: "PUBLIC", isParticipant: false, isCommunityMember: false })).toBe(true);
      expect(canViewRoom({ visibility: "PUBLIC", isParticipant: true, isCommunityMember: false })).toBe(true);
    });

    it("COMMUNITY is visible only to a community member or an existing participant", () => {
      expect(canViewRoom({ visibility: "COMMUNITY", isParticipant: false, isCommunityMember: false })).toBe(false);
      expect(canViewRoom({ visibility: "COMMUNITY", isParticipant: false, isCommunityMember: true })).toBe(true);
      expect(canViewRoom({ visibility: "COMMUNITY", isParticipant: true, isCommunityMember: false })).toBe(true);
    });

    it("PRIVATE is invisible to anyone who isn't already a participant - no enumeration oracle", () => {
      expect(canViewRoom({ visibility: "PRIVATE", isParticipant: false, isCommunityMember: false })).toBe(false);
      expect(canViewRoom({ visibility: "PRIVATE", isParticipant: false, isCommunityMember: true })).toBe(false);
      expect(canViewRoom({ visibility: "PRIVATE", isParticipant: true, isCommunityMember: false })).toBe(true);
    });
  });
});
