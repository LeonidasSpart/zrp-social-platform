# ZRP Live Video: Architecture

Status: backend implemented (domain model, authorization, realtime
signaling, moderation, notifications, discovery, cleanup, LiveKit
integration) plus a functional web client (`/live-video`,
`/live-video/[id]`). **Update**: Android and iOS, which had no client UI
when this document was first written (no native toolchain was available
to build or verify native UI in that environment), each built a full
native Live Video client in a later pass
(`android-native/.../ui/livevideo/`, `ios-native/.../Features/LiveVideo/`)
against this same backend contract, unchanged. See
`ios-native/PARITY.md`'s "ZRP Live Video" and "ZRP Live engagement"
tables for the current, row-by-row status on both native platforms; §4
below is this document's own (now partially superseded) gap list.

## 1. Relationship to Live Audio

Live Video is a second, separate "real-time room" feature parallel to
Live Audio (its own top-level nav entry, its own discovery page, its
own room page), not a mode bolted onto `LiveAudioRoom`. It is also
**not a rewrite**: almost everything below is Live Audio's own
architecture, reused unchanged, because the underlying problem (a
server-authoritative SFU room with roles, moderation, and realtime
fan-out) is identical for audio and video. Camera feeds are the one
genuine difference, and the lift was small precisely because LiveKit's
publish grant already covers both audio and video tracks.

Reused **as-is**, no new code:

- `src/lib/live-audio/livekit.ts` - `mintLiveKitToken`,
  `forceDisconnectParticipant`, `getLiveKitConfig`. A token's
  `canPublish` grant isn't audio-specific; it already permits
  publishing whatever tracks the client has (mic, camera, or both).
- `src/lib/live-audio/permissions.ts` - `canViewRoom`, `canPromoteSpeaker`,
  `isRoomAuthority`, etc. Pure predicates over a role/visibility value;
  nothing in them says "audio."
- `src/lib/live-audio/errors.ts` - `LiveAudioError`,
  `liveAudioErrorResponseBody`. Live Video's `errors.ts`
  (`src/lib/live-video/errors.ts`) re-exports `LiveAudioError` as
  `LiveVideoError` and spreads `LiveAudioErrors` into `LiveVideoErrors`,
  overriding only `paidFeatureRequired()` (the one message that
  actually says "Live Audio").
- `src/lib/live-audio/route-helpers.ts` - `withLiveAudioAuth`,
  `checkRateLimit`. The auth-wrap-and-catch-LiveAudioError helper is
  generic; since `LiveVideoError` *is* `LiveAudioError`, the same
  `instanceof` check in its catch block handles both.
- `src/lib/live-audio/entitlement.ts` - `checkLiveAudioAccess`. See §2.

**Reused enums** (`prisma/schema.prisma`): `LiveAudioRoomStatus`,
`LiveAudioVisibility`, `LiveAudioParticipantRole`,
`LiveAudioSpeakerRequestStatus`, `LiveAudioModerationActionType` are
all reused on the new `LiveVideoRoom`/`LiveVideoParticipant`/
`LiveVideoSpeakerRequest`/`LiveVideoModerationAction` models rather
than duplicated. `LISTENER`/`SPEAKER` read a little audio-flavored for
a video room, but the underlying permission ("can this participant
publish a track") is identical, and the product-facing labels
("Viewer"/"On camera") live in the translation layer
(`liveVideo.viewersHeading`/`liveVideo.participantsHeading`), not the
enum. This was a deliberate call to avoid duplicate enum/migration
surface with zero behavioral upside.

**New, Live-Video-specific:**

- `src/lib/live-video/room-service.ts` - the state machine. Same shape
  as `live-audio/room-service.ts` function-for-function
  (`createRoom`/`joinRoom`/`leaveRoom`/`endRoom`/`cleanupAbandonedRooms`/
  `forceLeaveAllLiveVideoRooms`/`listLiveRoomsForAdmin`/
  `adminForceEndRoom`/...), with two role-transition functions renamed
  for clarity (`promoteToParticipant`/`demoteToViewer`, still setting
  the same `SPEAKER`/`LISTENER` enum values) and one genuinely new
  function: `setParticipantCamera`.
- `src/lib/live-video/entitlement.ts` - thin wrapper over
  `checkLiveAudioAccess` (see §2).
- Prisma: `LiveVideoRoom`, `LiveVideoParticipant` (adds `isCameraOff`
  alongside `isMuted`), `LiveVideoSpeakerRequest`,
  `LiveVideoModerationAction`. Migration:
  `prisma/migrations/20261003120000_add_live_video/`.
- `src/app/api/live-video/**` - full route set mirroring
  `src/app/api/live-audio/**`, plus `rooms/[id]/camera/route.ts` (no
  Live Audio equivalent).
- `src/app/live-video/page.tsx` and `src/app/live-video/[id]/page.tsx` -
  the discovery list and room page. The room page renders on-camera
  participants as a video-tile grid (one `<video>` per published
  camera track, attached into a per-participant container keyed by
  LiveKit identity) and viewers as a plain avatar list, same avatar-grid
  component Live Audio uses for everyone.
- `socket-authz.js`: `liveVideoRoom()`/`isLiveVideoParticipant()`.
  `server.js`: `join-live-video-room`/`leave-live-video-room` socket
  events. `src/lib/socket-emit.ts`:
  `emitToLiveVideoRoom()`/`evictUserFromLiveVideoRoom()`. All direct
  mirrors of the Live Audio equivalents.
- `src/app/api/cron/live-video-cleanup/route.ts` - mirrors
  `live-audio-cleanup`. **Note**: as of this writing, `live-audio-cleanup`
  itself has no GitHub Actions workflow scheduling it (unlike every
  other `CRON_SECRET` route under `.github/workflows/cron-*.yml`) - a
  pre-existing gap, not something this feature introduced. The Live
  Video cleanup route exists and works when invoked, but inherits the
  same "nothing in this repo currently calls it on a schedule" gap as
  its audio counterpart; wiring both up is a reasonable follow-up.
- `src/app/api/admin/live-video/**` - admin force-close
  (`rooms/route.ts`, `rooms/[id]/end/route.ts`), mirroring the Live
  Audio admin tooling added for the same operator need ("a host forgot
  to close their room"). The admin dashboard
  (`src/app/admin/page.tsx`) merges both kinds into one "Live rooms"
  list with a kind badge, rather than two separate panels.

## 2. Entitlement: bundled with Live Audio, not a new plan limit

`requireLiveVideoAccess()` calls the exact same
`checkLiveAudioAccess()` Live Audio uses (same `hasFeature(plan,
"liveAudio")` check, same subscription-lifecycle rules), and only
overrides the thrown error's copy. This is a product decision made in
this pass, not a constraint of the code: Live Audio and Live Video are
treated as one "real-time ZRP rooms" perk a paid plan unlocks, rather
than two separately metered features. If product direction wants Live
Video gated independently (its own plan flag, a different tier), that
means: a new `liveVideo` key in `PlanLimits` (`src/lib/limits.ts`), a
real per-plan decision for free/pro/business/enterprise, and swapping
`requireLiveVideoAccess`'s delegate call for a parallel
`checkLiveVideoAccess` that reads it. Not done here because there was
no product signal for a different pricing boundary, and bundling ships
faster with zero new plan-matrix decisions.

## 3. Camera moderation: the one new axis

A Live Audio participant has one publishable track (mic) and one
moderation flag (`isMuted`). A Live Video participant has two
independent tracks (mic, camera) and two independent flags (`isMuted`,
`isCameraOff`), each separately force-mutable by a moderator:

- `muteParticipant()` - unchanged from Live Audio, forces the mic
  track off at the LiveKit media layer via `mutePublishedTrack` on the
  participant's `TrackType.AUDIO` track.
- `setParticipantCamera()` - the new function. Same shape (DB flag +
  moderation-action log + realtime broadcast + best-effort SFU-level
  enforcement), but targets `TrackType.VIDEO`.

Self mute/unmute and self camera-on/off are **both** purely
client-side (`room.localParticipant.setMicrophoneEnabled()` /
`setCameraEnabled()`), exactly like Live Audio's self-mute - neither
makes a server round trip. Only a moderator forcing someone else's
track off goes through the API.

## 4. Known, deliberate gaps

- **Report integration**: Live Video rooms are *not* one of `Report`'s
  polymorphic target types (unlike `LiveAudioRoom`, which is the
  documented 8th target - see `prisma/schema.prisma`'s `Report` model
  comment and this repo's own history of a bug caused by a missed 8th
  target). Adding a 9th target touches every target-type switch across
  admin/appeals, which is its own follow-up with real blast radius. A
  video room's host can still be reported today via the existing
  bare-profile report flow (`reportedUserId`).
- **No native (Android/iOS) client at the time this was written**: both
  platforms already had working Live Audio UI
  (`android-native/.../ui/liveaudio/`, `ios-native/.../Features/LiveAudio/`),
  so native Live Video parity was flagged here as a real, expected
  follow-up - out of scope at the time because that environment had no
  Android SDK/emulator and no macOS/Xcode to build or verify it. That
  follow-up has since shipped: see the status line at the top of this
  document and `ios-native/PARITY.md`'s "ZRP Live Video" table.
- **No scheduled cleanup invocation**: see §1's note on
  `live-video-cleanup` inheriting `live-audio-cleanup`'s own
  missing-cron-schedule gap.

## 5. Testing

- `src/lib/live-video/__tests__/room-service.integration.test.ts` -
  real-Postgres integration tests (self-skip without `DATABASE_URL`,
  matching every other integration suite in this repo): full lifecycle,
  camera moderation specifically, join-request flow, the
  viewer-can't-promote security check, the free-plan paywall, cron
  cleanup, admin force-end, and the banned-user sweep.
- `src/lib/live-audio/__tests__/livekit.test.ts` /
  `room-service.integration.test.ts` are unchanged and still cover
  token minting / webhook verification - Live Video needed no new
  tests there since it reuses that code unchanged.
