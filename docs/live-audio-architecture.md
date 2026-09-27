# ZRP Live Audio — Architecture

Status: backend MVP implemented (domain model, authorization, realtime
signaling, moderation, notifications, discovery, cleanup, LiveKit
integration), plus a functional web client (`/live-audio`,
`/live-audio/[id]`) built in a follow-up pass. **Android and iOS still
have no client UI.** See section 12 for exact platform-by-platform status.

## 1. What already exists, and what this reuses

ZRP already has one realtime voice/video primitive: 1:1 WebRTC calls
(`server.js`'s `call-user`/`accept-call`/`reject-call`/`end-call` Socket.IO
events, `socket-authz.js`'s `createCallRegistry`, `/api/turn-credentials`,
`simple-peer` on web, native WebRTC on Android, **nothing on iOS** —
`IncomingCallResponder.swift` auto-declines every call today because this
app has no WebRTC dependency on iOS at all). That stack is a **mesh**
design: each call is exactly one peer-to-peer connection between two
parties, signaled over Socket.IO, NAT-traversed via STUN/TURN
(Metered, proxied through `/api/turn-credentials`).

Live Audio reuses from this:

- The **pattern**, not the mesh itself: server-authoritative state, a
  DB-backed authorization check before every relay/action, an ephemeral
  Redis-backed registry with TTL + generation tokens for race-safety
  (`createCallRegistry` is the direct template for the join/leave
  bookkeeping shape, even though the actual mechanism differs — see §3).
- `emitToUser()` (`src/lib/socket-emit.ts`) — the existing bridge that
  lets a plain Next.js API route push a realtime event to a user's
  Socket.IO room via `globalThis.__zrpIO`. Live Audio's room-state pushes
  (someone joined, was promoted, was muted, room ended) go through this
  exact mechanism (extended with a room-broadcast variant), not a new
  parallel signaling channel.
- `/api/turn-credentials`'s pattern (session-gated, dual IP+user rate
  limit, provider credentials never reach the client bundle,
  environment-variable-gated with a safe fallback) — mirrored by the new
  LiveKit token-minting route.
- Auth: `requireActiveUser()`/`requireAdmin()`/`requireModerator()`
  (`src/lib/auth-guards.ts`), which always re-read role/ban state fresh
  from Postgres rather than trusting a JWT snapshot.
- Rate limiting: `rateLimit()`/`checkRateLimitKey()`
  (`src/lib/rate-limit.ts`) — no second rate-limit system.
- Moderation: `isBlockedEitherWay()`, the `Report`/`Appeal` polymorphic
  moderation system (Live Audio rooms become the Report model's 8th
  optional target, exactly like `listingId`/`challengeId`/etc. before
  it — no parallel reporting system).
- Notifications: `createNotification()` (`src/lib/notifications.ts`) —
  new `live_audio_*` type strings added to the existing union, same
  copy-table pattern every other vertical (`opportunity_*`,
  `help_campaign_*`) already follows.
- Communities: `CommunityMember` — a room's optional `communityId` is
  checked against this exact table (`communityId_userId` unique lookup),
  no second membership system.
- Cron: the existing `/api/cron/*` + `isAuthorizedCronRequest()`
  (`CRON_SECRET`) pattern, for the abandoned-room sweep.
- API conventions: `{ error: string }` responses, `getServerSession`/
  `getVerifiedToken`, `$transaction` for counter-consistent writes,
  `P2002` handling for unique-constraint races, async `params` (Next 15).

Nothing above needed to be duplicated. What's genuinely new is the media
transport itself (§2) and the domain model it's built on (§4).

## 2. Media architecture: why an SFU, and why LiveKit

**Mesh WebRTC (what calls use) does not fit Live Audio.** A mesh needs
`n·(n-1)/2` peer connections for `n` participants — it stops being
viable well before "dozens" of listeners, let alone the "hundreds/
thousands" this feature must support. It also does nothing to solve the
concrete problem that **iOS has zero WebRTC infrastructure today** — an
audio room built on raw mesh WebRTC would mean hand-rolling WebRTC on
iOS from scratch, on top of also hand-rolling multi-party SFU-like
fan-out logic that doesn't actually exist anywhere in this codebase.

**An SFU (Selective Forwarding Unit) is required.** Every participant
sends one upstream audio stream to the SFU; the SFU forwards it to every
subscriber. Bandwidth and CPU scale linearly with participants instead of
quadratically, TURN/STUN/ICE complexity is handled once (by the SFU
client SDK) instead of per-peer-pair, and reconnection/mobile-network
handling is the SFU vendor's problem, not ours to re-invent per platform.

**Choice: LiveKit**, specifically because:

- **Self-hostable AND cloud-hosted from the same open-source server**
  (Apache 2.0) — the app-facing contract (access tokens, room API,
  webhooks) is identical either way, so starting self-hosted and moving
  to LiveKit Cloud later (or vice versa) is a `LIVEKIT_URL` change, not a
  rewrite. This directly satisfies the mission's "document vendor
  dependency / migration strategy" requirement: the migration strategy
  is "change one environment variable."
- **Ships real client SDKs for Web, Android (Kotlin), and iOS (Swift)**
  that wrap WebRTC internally. This is the concrete way iOS gains real
  audio capability for the first time, without ZRP hand-building a
  WebRTC stack there — the SDK is the WebRTC stack.
- **Server-side token minting is a pure local operation.** LiveKit access
  tokens are self-signed JWTs, generated with `livekit-server-sdk` from
  `LIVEKIT_API_KEY`/`LIVEKIT_API_SECRET` alone — no network call to
  LiveKit is needed to mint one. That means the authorization-critical
  part ("is this user actually allowed to publish audio in this room, at
  this role") is real, fully testable, production code, independent of
  whether a LiveKit server is reachable. See `src/lib/live-audio/livekit.ts`.
  The token encodes the *grants* (`roomJoin`, `canPublish`,
  `canSubscribe`, `canPublishData`) our backend decided — LiveKit's
  server enforces them; a listener's token simply never carries
  `canPublish: true`, so no amount of client tampering lets them publish
  (§7, §8).
- **Webhooks give the media server itself as the source of truth for
  "is anyone still connected"**, which is what makes the room-lifecycle
  guarantee in §5 (a room can't stay LIVE forever because a phone
  disappeared) actually correct rather than a heuristic.

**Cost/security implications, stated plainly:** running LiveKit (self-
hosted or Cloud) is a real, metered dependency — it is not free compute,
and Cloud LiveKit bills by connection-minutes. `LIVEKIT_API_SECRET` is a
credential capable of minting a token for *any* room; it must never reach
a client, exactly like `NEXTAUTH_SECRET`/`METERED_API_KEY` today. This is
the **explicit external-infrastructure boundary** for this feature: no
LiveKit server (self-hosted or Cloud) exists in this sandbox to actually
connect to, and none was provisioned as part of this task. Every line of
code up to "call `RoomServiceClient`/mint a token/verify a webhook
signature" is real and tested; actually joining an audio room end-to-end
requires a running LiveKit deployment and has not been exercised. See
the final report for the exact IMPLEMENTED/TESTED/REQUIRES EXTERNAL
INFRASTRUCTURE breakdown.

## 3. Redis vs. Postgres split

Unlike a 1:1 call (which has no durable identity worth persisting —
`createCallRegistry` has no Postgres backing at all), a Live Audio room
is a real, discoverable, reportable, statistics-bearing object. So the
split here is different from the call registry's "Redis only":

- **Postgres is authoritative** for room existence, membership, role,
  moderation actions, and final statistics — anything that must survive
  a restart, be queried/joined, support the Report/Appeal moderation
  flow, or be analyzed later. See §4.
- **Redis is used for exactly one purpose**: rate limiting room
  creation / speaker requests / join attempts (existing `rateLimit()`/
  `checkRateLimitKey()` — no new mechanism). There is deliberately no
  separate Redis "room is still alive" heartbeat key: because the host
  is always seeded as an active `LiveAudioParticipant` row in the same
  transaction that creates the room, "does this LIVE room have zero
  active (non-`leftAt`) participants" is a self-contained Postgres fact
  that needs no additional ephemeral state to compute — see §5.

There is deliberately **no** Redis-based "current listener count" cache
the way `/api/posts/explore` caches ranked feeds: room membership is
read directly from `LiveAudioParticipant` (`WHERE roomId AND leftAt IS
NULL`), which is cheap at Live Audio's expected volume (rooms are
created far less often than posts or messages) and avoids a second
source of truth that could drift from the moderation-relevant Postgres
rows.

## 4. Domain model

See `prisma/schema.prisma` for the authoritative definitions. Summary:

```
LiveAudioRoom
  id, hostId -> User, communityId? -> Community
  title, description?, category?
  status: SCHEDULED | LIVE | ENDED | CANCELLED
  visibility: PUBLIC | COMMUNITY | PRIVATE
  scheduledAt?, startedAt?, endedAt?
  peakListenerCount, peakSpeakerCount, totalUniqueParticipants (final stats,
    finalized at ENDED — no separate 1:1 "statistics" table: a handful of
    denormalized counters on the room row itself is simpler than a joined
    table for data this small, and it's exactly one row to write once at
    end-of-room, not a running aggregate write on every event)

LiveAudioParticipant
  id, roomId -> LiveAudioRoom (Cascade), userId -> User (Cascade)
  role: LISTENER | SPEAKER | MODERATOR | HOST
  joinedAt, leftAt?, isMuted, removedAt?, removedById? -> User
  @@unique([roomId, userId])   <- see below

LiveAudioSpeakerRequest
  id, roomId, userId, status: PENDING | APPROVED | REJECTED | CANCELLED
  requestedAt, resolvedAt?, resolvedById? -> User
  @@unique([roomId, userId])   <- see below

LiveAudioModerationAction
  id, roomId, actorId -> User, targetUserId -> User
  action: MUTE | UNMUTE | REMOVE | PROMOTE_SPEAKER | DEMOTE_SPEAKER
  reason?, createdAt
```

**Why `@@unique([roomId, userId])` and not a partial/filtered index for
"one active membership":** Prisma's schema DSL has no `WHERE` clause on
`@@unique`, and hand-editing a partial-unique index into the generated
migration SQL would silently drift from `schema.prisma` on the next
`migrate dev`. The simpler, drift-proof design used here: **one row per
`(roomId, userId)` for the lifetime of the room**, mutated in place —
joining is an upsert (`leftAt: null`, fresh `joinedAt` if rejoining),
leaving sets `leftAt`, removal sets `removedAt`. "Currently active" is
just `leftAt IS NULL AND removedAt IS NULL`. This also directly satisfies
"prevent duplicate active membership": a second `POST /join` from the
same user can never create a second row, by construction, not by a
race-prone check-then-insert.

Same reasoning for `LiveAudioSpeakerRequest`: a repeated request just
updates the existing row back to `PENDING` rather than accumulating
request spam.

**Indexes**, and why each one exists:
- `LiveAudioRoom(status)` — the cleanup cron's exact query shape
  (`WHERE status = 'LIVE'`).
- `LiveAudioRoom(visibility, status)` — the discovery list's exact query
  shape (`WHERE visibility = 'PUBLIC' AND status = 'LIVE'`).
- `LiveAudioRoom(communityId)` — a community's "live now" surface.
- `LiveAudioRoom(hostId)` — "my rooms" / abuse investigation.
- `LiveAudioParticipant(roomId, role)` — "who are the current speakers/
  moderators in this room" (promote/demote/mute/remove all need this).
- `LiveAudioParticipant(userId)` — "which rooms is this user in" (used
  by the banned-user-mid-session check, §7).
- `LiveAudioSpeakerRequest(roomId, status)` — "pending requests for this
  room," the host/moderator queue view.
- `LiveAudioModerationAction(roomId)`, `(targetUserId)` — room audit
  trail, and "has this user been actioned before" lookups.

**State transitions are validated exclusively server-side** in
`src/lib/live-audio/room-service.ts` — every transition function takes
the *authenticated userId*, re-reads the room/participant rows fresh,
and re-derives the caller's role from Postgres. No transition ever
trusts a client-supplied role, roomId-implies-membership assumption, or
"I'm the host" claim.

## 5. Room lifecycle, host disappearance, and cleanup

```
SCHEDULED -> LIVE -> ENDED
          -> CANCELLED (from SCHEDULED only)
LIVE -> ENDED (explicit end, by host/moderator/admin)
LIVE -> ENDED (webhook: LiveKit's own room_finished event)
LIVE -> ENDED (cron: heartbeat TTL expired with no webhook ever arriving)
```

Three independent mechanisms end a room, so no single point of failure
leaves one stuck LIVE forever:
1. **Explicit end** — `POST /rooms/[id]/end`, authorized to host/
   moderator.
2. **LiveKit webhook** (`POST /api/live-audio/webhooks/livekit`, signature-verified
   via `livekit-server-sdk`'s `WebhookReceiver`) — `room_finished` (the
   SFU's own room emptied and closed) transitions our row to `ENDED`;
   `participant_left` marks the corresponding `LiveAudioParticipant.leftAt`
   so departures are reflected even if the client's own `POST /leave`
   never arrives (app killed, network died).
3. **Cron sweep** (`GET /api/cron/live-audio-cleanup`, `CRON_SECRET`-gated
   like every other cron route), which ends any `LIVE` room matching
   either of two independent, Postgres-only conditions - no separate
   Redis heartbeat key needed:
   - **Zero active participants.** The host is always seeded as an
     active `HOST` participant row in the same transaction that creates
     the room, so "this LIVE room currently has zero rows with `leftAt
     IS NULL AND removedAt IS NULL`" can only become true once everyone,
     including the host, has actually left/been removed/disconnected
     (webhook-observed or explicit) - a genuine abandonment signal with
     no extra state to maintain.
   - **Absolute max duration exceeded** (24h since `startedAt`) — the
     backstop of last resort for the case LiveKit itself is unreachable/
     misconfigured and no webhook ever updates a participant's `leftAt`
     at all, so the first condition could never fire. Real products
     cap session length for exactly this reason; 24h is generous enough
     to never affect a real conversation while bounding the worst case.

## 6. Authorization matrix

| Action | HOST | MODERATOR | SPEAKER | LISTENER | Non-member |
|---|---|---|---|---|---|
| Create room | (any active user) | — | — | — | — |
| View public room | yes | yes | yes | yes | yes |
| View community room | yes | yes | yes | yes | only if community member |
| View private room | yes | yes | yes | yes | **no** |
| Join room | yes | yes | yes | yes | yes, if visibility allows |
| End room | yes | yes | no | no | no |
| Cancel scheduled room | yes | no | no | no | no |
| Promote listener to speaker | yes | yes | no | no | no |
| Demote speaker to listener | yes | yes | no | no | no |
| Mute a speaker | yes | yes | no | no | no |
| Remove a participant | yes | yes | no | no | no |
| Request to speak | n/a | n/a | n/a | yes | no |
| Approve/reject speak request | yes | yes | no | no | no |
| Publish audio | yes | yes | yes | no | no |
| Leave room | yes* | yes | yes | yes | n/a |

`*` the host leaving does **not** transfer host role or end the room
automatically (mirrors Communities: no owner-succession flow exists
there either, and inventing one is out of scope for this MVP) — a
moderator can still end the room; if none exists, the cleanup cron
eventually reclaims it once the heartbeat lapses. This is a documented,
intentional simplification, not an oversight.

Every row of this table is enforced in `src/lib/live-audio/permissions.ts`,
re-checked on every request — never cached, never inferred from a
client-supplied role.

## 7. Security-relevant guarantees

- **A listener cannot become a publisher by editing the client.** The
  LiveKit access token minted for a `LISTENER` never sets `canPublish:
  true`. LiveKit's server — not our client, not our trust — enforces the
  grant. Promotion to `SPEAKER` requires a fresh server-side
  authorization check and re-mints a new token with `canPublish: true`;
  the old listener-only token is not retroactively upgraded.
- **A banned user cannot keep speaking because an old connection is
  open.** `requireActiveUser()` re-reads ban state fresh on every
  mutating Live Audio request — no caching. On ban, `POST /admin/users/
  [id]/ban` (existing route) additionally calls a new
  `forceLeaveAllLiveAudioRooms(userId)` helper that ends the user's
  Postgres membership rows immediately AND revokes them at the media
  layer via `RoomServiceClient.removeParticipant()`, so the SFU itself
  drops their connection rather than merely marking a DB row stale.
- **Private/community rooms never leak existence or participant data to
  unauthorized users.** `GET /rooms` (discovery) filters `visibility`/
  community-membership in the Postgres query itself, not after the fact
  in application code; `GET /rooms/[id]` returns 404 (not 403) for a
  private room the caller can't see, so a private room's existence
  can't be distinguished from a nonexistent id (no enumeration oracle).
- **Two moderators promoting the same listener simultaneously** cannot
  both succeed: promotion is `prisma.$transaction` guarded by an
  `updateMany({ where: { roomId, userId, role: "LISTENER" }, data: {
  role: "SPEAKER" } })` whose returned `count` must be exactly 1 — the
  same atomic conditional-update idiom this codebase already uses for
  AI-quota reservation (never check-then-write). The loser gets a 409.
- **TURN/LiveKit credentials never appear in logs**; the webhook route
  logs event type and roomId only, never the raw signed payload or the
  webhook secret.
- **A removed/banned participant is evicted from the room's realtime
  channel itself, not just told to leave.** Removal and the banned-user
  sweep both force-drop the user's actual LiveKit audio connection
  (`forceDisconnectParticipant`) AND call `evictUserFromLiveAudioRoom()`
  to forcibly remove their socket(s) from the `live-audio:<roomId>`
  Socket.IO broadcast room server-side — found and fixed during the
  §36 adversarial pass: without it, a client that simply ignored the
  polite `you-were-removed` event (or never reconnected) would keep
  receiving that room's realtime metadata (speaker list, mute/role
  changes) indefinitely, even with its audio already cut off.

## 8. What is explicitly deferred (not built, and why that's fine for an MVP)

- **Recording.** Not built. The schema has no recording-related field;
  adding one later (LiveKit supports room composite recording via its
  own Egress API) would be a new, separate table (`LiveAudioRecording`)
  and consent/retention flow — not a redesign of anything here.
- **A numeric hard speaker-limit.** Not enforced. LiveKit imposes no
  inherent limit; nothing in the mission's product spec asked for a
  specific number, and inventing one (say, "8 speakers max") would be
  product policy this task has no authority to set. The atomic
  promotion transaction in §7 is exactly where such a limit would slot
  in later (`updateMany` guarded by `count(role=SPEAKER) < N`) without
  restructuring anything.
- **Plan-gating who can host.** Not built. `src/lib/limits.ts`/
  `permissions.ts` is the existing extension point if ZRP later wants
  e.g. "Business+ only" hosting; adding it is a `canHostLiveAudio(plan)`
  helper plus one check in the create-room route, not a new system.
- **Android/iOS native UI.** Not built — see the final report.

## 9. Discovery

`GET /api/live-audio/rooms` returns `PUBLIC` rooms with `status = LIVE`
plus, for an authenticated caller, `COMMUNITY`-visibility rooms in
communities they belong to — never `PRIVATE` rooms unless the caller is
already a participant. Cursor-paginated via the existing
`parseCursorParams`/`buildPage` helpers, ordered by listener count
descending then `startedAt` (busiest/newest first), matching Explore's
own "don't just show chronological" instinct without introducing a
second ranking/caching system — no Redis cache here (§3), since a live
room's listener count changing invalidates a cache immediately anyway,
and query volume for a "who's live right now" list is low.

## 10. Notifications added

New `CreateNotificationParams.type` members (all following the existing
`opportunity_*`/`help_campaign_*` pattern — union entry, `NEVER_EMAIL_TYPES`
membership decision, `typeMap`, `actionMap`, `subjectMap` entries):

- `live_audio_started` — sent to a community's members when a room goes
  LIVE in that community (never for a public/non-community room — that
  would be feed-dominating spam, explicitly warned against in the
  mission). Never emailed (`NEVER_EMAIL_TYPES`) — this is a "happening
  now" notification; an email arriving after the room ends is useless.
- `live_audio_speaker_invited` — a moderator/host invited a listener to
  speak directly (distinct from the listener requesting it themselves).
- `live_audio_speaker_approved` / `live_audio_speaker_rejected` — the
  outcome of the requester's own `speak/request`.

## 11. Environment variables

| Variable | Purpose | Required |
|---|---|---|
| `LIVEKIT_API_KEY` | LiveKit server SDK auth (token minting, webhook verification, RoomService calls) | Yes, to actually mint usable tokens |
| `LIVEKIT_API_SECRET` | Paired secret for the above. **Never sent to any client.** | Yes |
| `LIVEKIT_URL` | The LiveKit server's WebSocket URL, given to clients so they know where to connect (not secret — it's a hostname) | Yes |
| `LIVEKIT_WEBHOOK_API_KEY` / `LIVEKIT_WEBHOOK_API_SECRET` | Only needed if the webhook is verified against a *different* key/secret pair than the main one (LiveKit supports per-endpoint keys); defaults to `LIVEKIT_API_KEY`/`LIVEKIT_API_SECRET` if unset | No |

None of these are set in this repository or in any committed file.
Every code path that needs them fails closed with a clear `503`
("Live Audio is not configured") rather than silently no-op'ing or
falling back to a fake token, matching this route's own "never fake an
integration" requirement.

## 12. Cross-platform status

- **Web/PWA**: **implemented and manually verified** — `src/app/live-audio/page.tsx`
  (discovery + a "Go Live" create-room modal,
  `src/components/live-audio/CreateLiveAudioModal.tsx`) and
  `src/app/live-audio/[id]/page.tsx` (the room screen: joins via
  `POST /rooms/[id]/join`, connects with `livekit-client`'s
  `Room.connect(livekitUrl, token)`, publishes/subscribes audio per
  role, renders participants grouped by role, and exposes speak-request/
  approve/reject, promote/demote/mute/remove, leave/end — all through
  the existing REST routes). Realtime updates come from this repo's
  Socket.IO `live-audio:*` broadcasts (`join-live-audio-room`), not
  polling. ZRP has one web codebase for web and PWA/mobile-browser (see
  CLAUDE.md), so this single implementation covers both. Reachable from
  the Sidebar's primary nav (new `nav.liveAudio` entry, `Radio` icon);
  all new user-facing strings are translated across all 29 supported
  languages, verified by the repo's own translation-completeness CI
  gate. **Manually exercised end-to-end** with Playwright against a real
  local dev server + Postgres + Redis: login, discovery empty/loaded
  states, room creation, and the room screen's HOST view — this is how
  a real, confirmed bug was caught and fixed (see below). **Not
  exercised**: an actual LiveKit media connection (no deployment exists
  in this sandbox — the UI's own "Live Audio isn't set up yet" fallback
  state was what was verified instead, which is the correct, honest
  behavior for that case) or native mobile browsers specifically.
- **Android**: backend contract only. `CallViewModel.kt`'s existing
  native WebRTC stack is unrelated (mesh, 1:1) and is not reused or
  touched. A native Live Audio screen would use LiveKit's Android SDK
  against the same REST/token endpoints.
- **iOS**: backend contract only. As noted in §1, iOS has no WebRTC
  today; LiveKit's iOS SDK would be the actual mechanism to give it
  audio capability, but building that screen is out of scope here.

**A real bug found and fixed during this web UI pass**: the room page's
cleanup effect originally called `POST /leave` unconditionally on
unmount, even when `POST /join` had never succeeded (LiveKit
unconfigured, a failed request, or React Strict Mode's dev-only double-
invoke of effects). For a room's own HOST — who never goes through the
join upsert, since they're seeded directly at room creation — this
silently marked their already-existing participant row as departed,
observed directly via the room detail API returning `myRole: null` and
an empty participant list for the room's own creator. Fixed by only
firing the leave call when a join had actually completed; re-verified
via a direct API check showing `myRole: "HOST"` and the participant
correctly persisted afterward.

This matches the mission's own instruction: implement completely up to
the external-infrastructure/scope boundary, document what's outside it
honestly, and never claim a client is done when only the backend
contract exists.
