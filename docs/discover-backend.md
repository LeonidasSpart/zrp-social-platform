# ZRP Discover: Backend V1

Backend foundation for ZRP's vertical-video discovery feed. This is the
server side only: no Android/iOS/web UI changes ship with it. See
`src/lib/discover/` for the implementation and the "Non-negotiable
rules"/"Mandatory audit" sections of the implementation directive this
was built against for the full brief.

## What Discover items actually are

There is no new content type. A Discover item is exactly the same
`Post` row the existing Shorts feed (`GET /api/videos`) already serves:
`type: POST`, `mediaType: "video"`, a real (non-GIF) video URL. Discover
reuses that content and that classification logic
(`src/lib/video-media.ts`, extracted out of `/api/videos` during this
work so both routes share one implementation instead of two copies)
rather than introducing a parallel video model. Likes, comments,
reposts, bookmarks, reports, blocks, mutes, and follows are all the
existing `Post`-scoped tables; nothing new there either.

The only genuinely new thing this feature adds is `DiscoverEvent`, a
table to record watch-signal analytics (impression/start/25/50/75/
complete/skip) that didn't exist for Shorts before this.

## Architecture

```
GET /api/discover
        │
        ▼
DiscoverFeedService (src/lib/discover/feed.ts)
   │        │             │              │
   ▼        ▼             ▼              ▼
Candidate  Ranking     Diversity     Viewer-state +
Service    Service     pass          premium gating
(DB query, (score:     (creator      (liked/saved/
moderation freshness + repeat        reposted/follows,
+ privacy  weighted    limiting)     applyPremiumGating)
filtering) engagement)

POST /api/discover/events
        │
        ▼
DiscoverEventService (src/lib/discover/events.ts)
   (validate → existence check → dedup → persist DiscoverEvent)
```

Each stage is a separate, independently testable module under
`src/lib/discover/` (`candidates.ts`, `ranking.ts`, `diversity.ts`,
`feed.ts`, `events.ts`, `types.ts`). The route handlers
(`src/app/api/discover/route.ts`,
`src/app/api/discover/events/route.ts`) only handle HTTP concerns:
identity, rate limiting, param parsing, response/error shape, so a
future change to ranking or diversity never touches the API contract or
the route files.

## API

### `GET /api/discover`

Public: works for both anonymous and signed-in callers (same as the
existing `GET /api/videos` and `GET /api/posts/explore`). Only
`viewerState` differs by auth status; everything else is identical.

Query params:

| Param | Default | Notes |
| --- | --- | --- |
| `cursor` | none | Opaque: currently a numeric offset into a cached ranked list (see Pagination below), but callers must not parse it. An invalid/garbage cursor restarts from the top rather than erroring. |
| `limit` | 20 | Clamped to a max of 50. Invalid/non-numeric values fall back to the default. |

Response:

```jsonc
{
  "items": [
    {
      "id": "post-id",
      "author": { "id": "...", "username": "...", "name": "...", "avatarUrl": "...", "badgeType": "..." },
      "media": { "url": "https://...", "type": "video" }, // url is null only for a locked pay-per-view item - see below
      "caption": "post content",
      "audio": null, // see "Audio / music" below
      "stats": { "likes": 0, "comments": 0, "reposts": 0, "saves": 0, "views": 0 },
      "viewerState": { "liked": false, "saved": false, "reposted": false, "followsAuthor": false },
      "commentsEnabled": true,
      "createdAt": "2026-09-15T12:00:00.000Z"
    }
  ],
  "nextCursor": "20" // or null when there is no next page
}
```

A pay-per-view (`PremiumPost`) item the viewer hasn't purchased is
redacted the same way every other Post-serving route redacts it, via
the existing `applyPremiumGating` (`src/lib/premium-content.ts`, not a
new gate): `caption` is replaced with the creator's own preview text,
`media.url` becomes `null` (the real video URL is never sent to a
viewer who hasn't paid for it: there is nothing else to redact it to,
since unlike a text preview there's no "preview clip" concept), and a
`premiumPost` summary object (`{ id, price, currency, previewContent,
locked: true }`) is attached so the client can render a paywall instead
of an unexplained missing video. `media.url` is otherwise always a
real string; it is nullable in the `DiscoverFeedItem` type
specifically for this one case. Covered by the "redacts a pay-per-view
post's real content" test in
`src/app/api/discover/__tests__/route.integration.test.ts`, which
asserts a non-purchasing viewer gets `media.url: null` while the
creator and a completed purchaser get the real URL.

`items`/`nextCursor` (not the legacy `posts` key some older routes like
`/api/videos` and `/api/posts/explore` use) matches the newer
convention already established by `src/lib/pagination.ts` and
`GET /api/users/[username]/posts`; Discover is a new endpoint, so it
follows that one.

Never returned: password hash, tokens/secrets, raw email, or any other
`User` field beyond the five listed above. The Prisma `select` in
`src/lib/discover/candidates.ts` is deny-by-default: only those fields
are ever pulled off `User`.

### `POST /api/discover/events`

Body: `{ postId: string, eventType: DiscoverEventType, watchedMs?: number }`
where `DiscoverEventType` is one of `IMPRESSION | START | PROGRESS_25 |
PROGRESS_50 | PROGRESS_75 | COMPLETE | SKIP`.

Response: `{ recorded: boolean }`. `recorded: false` is not an error:
it means the target post no longer qualifies (deleted/unpublished/not a
video) or this exact signal was deduped; either way nothing new was
written. A malformed request (missing `postId`, invalid `eventType`)
is a `400` with `{ error: string }`.

Works for both anonymous and signed-in callers; a signed-in event is
attributed to the caller's verified user id
(`getVerifiedToken`, `src/lib/auth-guards.ts`), never a client-supplied
id.

## Pagination

Discover's ordering is score-based, not something a plain `createdAt`/
`id` database cursor can walk directly; the same situation
`GET /api/posts/explore` is already in. This reuses that established
convention rather than inventing a third pagination scheme for the
codebase: `DiscoverCandidateService` fetches a bounded pool (200 posts,
matching explore's own pool size), `DiscoverRankingService` scores and
sorts it once, the creator-diversity pass reorders it once, and the
resulting ordered list is cached (`src/lib/redis.ts`, 45s TTL) and
paginated with a numeric offset cursor.

Every page for the cache entry's lifetime is a slice of the *same*
underlying array, so within that window pagination is trivially
correct: no duplicate items, no skipped items, deterministic ordering.
A cache miss (first request, or TTL expiry) recomputes the whole
ordered list from a fresh DB read; an in-flight scroll session that
straddles a recompute can see its batch boundary shift, the exact same
accepted tradeoff `/api/posts/explore` already documents for itself.
Redis being unavailable doesn't break this: `getCached`/`setCached`
fail soft to "no cache," so every request just recomputes the ordered
list directly from Postgres instead.

## Ranking (V1)

No machine learning. `src/lib/discover/ranking.ts`'s `scoreCandidate`
is a pure function of data already on the `Post` row:

```
engagement = likes·1 + comments·2 + reposts·3 + saves·2 + log1p(views)·1
score      = engagement / max(0.001, ageHours)
```

- **Freshness**: dividing by age in hours (the same decay shape
  `/api/posts/explore`'s own "For You" ranking already uses) means a
  new post with modest engagement can outrank an old post with more
  absolute engagement.
- **Engagement weighting**: reposts > comments > likes > saves, the
  same relative ordering explore already established for "higher-effort
  engagement counts for more."
- **Views can't dominate alone**: `log1p(views)`, not raw views, per
  the explicit requirement that raw view count must not be allowed to
  dominate ranking on its own. A 100x view-count gap produces nowhere
  near a 100x score gap (see the unit test in
  `src/lib/discover/__tests__/ranking.test.ts`).

Ties are broken by the database's own `createdAt desc` order (a stable
sort preserves it), so ranking is fully deterministic and reproducible,
useful if a creator ever asks why their post ranked where it did.

Isolated entirely behind `scoreCandidate`/`rankCandidates` so future
signals (watch time, completion rate, skip rate, repeat views, follows-
after-view, negative feedback, interests, language, session behavior:
all readable from `DiscoverEvent` once there's enough volume to be
meaningful) replace or extend this function without touching the API
contract, the candidate service, or the diversity pass.

## Creator diversity

`src/lib/discover/diversity.ts`. Simple and deterministic, as directed:
walk the ranked list; whenever the next item would repeat the
immediately preceding item's author, look ahead up to 10 items for the
nearest different-author item and pull it forward ahead of the repeat.
If no such item exists in that window, the repeat is left in place;
diversity is never forced at the cost of showing nothing, or by
dropping/duplicating content. It's a pure reordering of the same array,
so it cannot itself introduce a pagination bug.

## Safety / filtering

All applied as real database `WHERE` conditions in
`src/lib/discover/candidates.ts`; not a post-hoc client-side filter:

| Rule | Mechanism |
| --- | --- |
| Deleted / removed posts | Moderation removal in ZRP is a hard `prisma.post.delete` (see `DELETE /api/admin/posts/[id]`): a deleted/removed post simply no longer exists to be queried. No extra "removed" flag needed. |
| Unpublished / scheduled posts | `status: "published"`, `scheduledAt: null` |
| Non-video content | `mediaType: "video"`, `imageUrl: { not: null }`, plus a second in-process pass with `isRealVideoPost()` (the same classifier `/api/videos` uses) as defense-in-depth against a mislabeled row |
| Banned authors | `author.banned: false` |
| Blocked / blocking / muted authors | Same combined-exclusion-array pattern already used by `/api/videos`, `/api/posts/explore`, and `/api/users/[username]/posts` |
| Private accounts | `viewablePostAuthorFilter(viewerId)` (`src/lib/permissions.ts`); the same helper `/api/posts/explore`, `/api/search`, `/api/posts/hashtag/[tag]`, Lists and Communities already use: visible only to the author, an approved follower, or when the account isn't private |
| Pay-per-view content the viewer hasn't purchased | `applyPremiumGating` (`src/lib/premium-content.ts`), applied fresh per request after pagination/hydration |

There is no dedicated NSFW/sensitive-content flag anywhere in the
existing `Post` model, so Discover has nothing to gate on for that
today: see "Known limitations."

## Authentication

`GET /api/discover` and `POST /api/discover/events` both accept
anonymous callers, matching `/api/videos` and `/api/posts/explore`
exactly. `GET` reads the session via `getServerSession(authOptions)`
(optional, `viewerId` is `null` when signed out); `POST /events` reads
the verified JWT via `getVerifiedToken` (`src/lib/auth-guards.ts`,
never `next-auth/jwt`'s raw `getToken`), also optional. A banned
account never reaches either route in the first place:
`src/middleware.ts` already rejects any `/api/*` request from a banned
session with `403` before the route runs, and the NextAuth session
callback returns no session at all for a banned/deleted account, so
there is nothing Discover-specific to add for that case. Whether the
Shorts *page* itself should allow anonymous browsing is a frontend
product decision outside this backend-only change; today's `/shorts`
page redirects an anonymous visitor to `/login`, independent of what
the backend already supports.

## Rate limiting

Reuses `src/lib/rate-limit.ts` (`rateLimit()`) exclusively; no second
limiter. Both endpoints are keyed per-IP the same way
`/api/ads/impression`/`/api/ads/click` are (the closest existing analog
, a partly-anonymous, high-frequency, client-triggered logging
endpoint):

| Endpoint | Limit | Rationale |
| --- | --- | --- |
| `GET /api/discover` | 60 / 60s per IP | ~1 page fetch/sec, generous for real scroll behavior, real against scripted scraping |
| `POST /api/discover/events` | 120 / 60s per IP | Several watch-signal events per item, several items per minute of real use |

Falls back to the existing in-memory limiter when Redis is unavailable
(`checkRateLimitKey`): limits are never skipped, matching the rest of
the codebase's fail-closed convention.

## Watch events / analytics

`DiscoverEvent` (see `prisma/schema.prisma`) is one row per reported
signal: `postId`, optional `userId` (nullable, anonymous viewers still
count), optional `ip` (see dedup below), `eventType`, optional
`watchedMs`, `createdAt`. Deliberately **not** split into seven tables
(one per event type) or into per-post aggregate counter columns on
`Post`: this keeps the write path simple and keeps a Redis or Postgres
hiccup on analytics from ever being able to affect the feed itself (V1
ranking never reads this table; see "Future ranking evolution").

Abuse handling, mirroring the only existing precedent for this shape of
endpoint (`AdImpression`/`AdClick`'s dedup in
`src/app/api/ads/impression/route.ts` and `.../click/route.ts`):

- The target post must still be a live, qualifying Discover candidate
  (published, non-scheduled, video-typed) or the event is accepted-but-
  not-recorded (`recorded: false`): stops writes against arbitrary/
  deleted/private ids. `recorded: false` is returned for exactly the
  same reason whether the id is wrong, belongs to a private/removed/
  non-video post, or was deduped; the response never lets a caller
  distinguish those cases from each other, so it can't be used as an
  existence/visibility oracle for a post id.
- `IMPRESSION`/`START` are deduped within a 60s window, keyed on the
  strongest identity available for that request:
  - **Signed-in caller**: `(post, userId)`, the verified session's id
    (`getVerifiedToken`), never anything from the request body.
  - **Anonymous caller (no session at all)**: `(post, ip)`, the same
    trusted-proxy-resolved IP every rate-limited route in this codebase
    already uses (`getRequestIp()`, `src/lib/rate-limit.ts`), so this
    adds no new authentication requirement and no new way to resolve a
    client's identity beyond what already exists elsewhere in ZRP.
    **This anonymous half did not exist in an earlier version of this
    file**: the code only deduped by `userId`, so a signed-out caller
    (`userId` always `null`) was never deduped at all, silently
    contradicting this same paragraph's own claim. Fixed by adding the
    `ip` column above and the anonymous branch in
    `DiscoverEventService.recordDiscoverEvent`: see
    `src/app/api/discover/events/__tests__/route.integration.test.ts`
    tests 19c–19f for the regression coverage (anonymous spam from one
    IP is deduped; two different anonymous IPs are each still counted;
    an authenticated viewer's dedup is unaffected by IP changes; `ip`
    is never persisted on a row that already has a `userId`).
  - `ip` is populated **only** when `userId` is `null`, a request that
    already carries a verified identity never also gets its IP
    persisted here, to avoid retaining IP data the dedup logic has no
    use for once a stronger identity exists.
  - `PROGRESS_*`/`COMPLETE`/`SKIP` aren't deduped (a real session only
    produces a handful of these), bounded instead by the route's
    overall per-IP rate limit.
- `watchedMs` is clamped to 30 minutes and never trusted as an
  authoritative signal on its own: the same "bounded plausibility, not
  full verification" stance ZRP PLAY's `REACTION` game already
  documents for client-reported timing it can't independently verify
  server-side either.
- `userId` on every row is read from `RecordDiscoverEventInput.viewerId`
  only, which the route populates exclusively from the server-verified
  JWT (`getVerifiedToken`): a client-supplied `userId`/`viewerId` field
  in the POST body is never read by `recordDiscoverEvent()` at all, so
  it cannot attribute an event to another account. See the "never
  attributes an event to a client-supplied userId" regression test.

This gives the backend what it needs to eventually compute average
watch time, completion rate, and skip rate per post via aggregation
queries over `DiscoverEvent`; none of that aggregation is implemented
in V1 (see "What V1 does not attempt").

## Audio / music

ZRP already has a full music subsystem (`MusicArtist`/`MusicAlbum`/
`MusicTrack`/`MusicPlaylist`, `src/app/music/`, `src/app/api/music/`)
but there is **no existing attachment between a `Post` and a
`MusicTrack`**: a Short today carries no "sound used" reference at
all, on any platform. Building that attachment is a real content-model
change (schema + upload flow + a track picker UI) well outside a
backend-only V1. Per the directive's own instruction not to build a
parallel/partial music system, `audio` is modeled as an explicit `null`
field on every `DiscoverFeedItem` today, ready for a client to branch
on, but with nothing behind it yet.

## Multilingual discovery

`Post` has no content-language field and `User` has no stored viewer-
language preference (`LanguageContext`/`translations.ts` is UI-chrome
language only, unrelated to post content), so there is no real signal
to rank or filter on yet. Discover intentionally does not hard-code a
single language anywhere: nothing in `candidates.ts` or `ranking.ts`
filters or re-weights by language, so per-item or per-viewer language
support can be added later (a real content-language field, a per-
request viewer-language hint, caption translation) as a pure addition
to the candidate query and/or ranking score, without a contract change.

## Database

One new table, one new enum, additive only, no changes to any
existing model or column:

- `DiscoverEventType` enum
- `DiscoverEvent` model (`id`, `postId`, `userId?`, `ip?`, `eventType`,
  `watchedMs?`, `createdAt`): see
  `prisma/migrations/20260915120000_add_discover_events/migration.sql`.
  `ip` was added in this feature's hardening pass to close the
  anonymous-dedup gap described in "Watch events / analytics" above;
  since this migration had not shipped to any deployed environment yet,
  it was amended in place rather than stacked as a second migration.

Indexes (`src/lib/discover/candidates.ts` / `events.ts` describe the
queries these support):

- `Post`: no new indexes needed, `@@index([createdAt])`,
  `@@index([authorId])`, `@@index([status])`, `@@index([scheduledAt])`
  already cover the candidate query's filters, and `mediaType` isn't
  indexed on its own (same as `/api/videos` today) because it's always
  combined with the already-indexed `status`/`scheduledAt`/`createdAt`
  filters and a 200-row `take` cap bounds the worst case regardless.
- `DiscoverEvent`: `(postId, eventType)` and `(postId, createdAt)` for
  the future per-post aggregation queries (avg watch time/completion/
  skip rate); `(userId, postId, eventType, createdAt)` for the
  authenticated-caller dedup lookup; `(ip, postId, eventType,
  createdAt)` for the anonymous-caller dedup lookup.

## Performance

- The candidate query is a single indexed, `take(200)` Postgres query
  no N+1 (author is a nested `select`, not a follow-up query per
  post; `_count` is one aggregate join, not per-row round trips).
- Only five `User` fields and no unnecessary relations are ever
  selected off `author`; never a full `User` row.
- Viewer-state hydration (`liked`/`saved`/`reposted`/`followsAuthor`) is
  four batched `findMany` calls scoped to just the current page's ids,
  not one query per item.
- The ranked+diversified list is cached for 45s (`src/lib/redis.ts`),
  so most page-2/3/... requests during a scroll session cost zero
  additional database round trips.
- Redis is optional everywhere it's touched: `getCached`/`setCached`
  fail soft to "recompute from Postgres," so a Redis outage degrades
  Discover to "every request hits the DB," never a blank page or a
  hard failure.

## Security review (self-assessment against the directive's checklist)

- **Authorization bypass / IDOR**: every filter (banned/blocked/
  muted/private/premium) is enforced server-side in the candidate query
  and in `applyPremiumGating`, never left to the client; there is no
  by-id post-detail lookup in this feature to IDOR against; the event
  endpoint's `postId` only ever narrows to "exists and still qualifies,"
  never exposes anything about a non-qualifying post either way (`200
  { recorded: false }` either way, whether the id is wrong, private, or
  deleted).
- **Blocked/private/deleted-content leakage**: covered above and by
  the integration tests in `src/app/api/discover/__tests__/route.integration.test.ts`.
- **Cursor/parameter abuse**: cursor is parsed as a plain non-negative
  integer with a silent fallback to 0 on anything else; `limit` is
  clamped server-side regardless of what's requested.
- **Rate-limit bypass / event spam / database amplification**: see
  "Rate limiting" and "Watch events" above; both endpoints are IP rate
  limited and the event endpoint additionally dedupes its two highest-
  frequency event types **for both authenticated and anonymous
  callers** (see "Anonymous event abuse" immediately below, this was a
  real gap in an earlier version of this PR, now closed and tested).
- **Anonymous event abuse**: a hardening pass found and fixed a real
  documented-vs-actual mismatch: `DiscoverEventService`'s dedup
  originally keyed only on `userId`, so every anonymous caller
  (`userId` is always `null` when signed out) was never deduped at
  all: a scripted, signed-out client could POST unlimited
  IMPRESSION/START rows for the same post with no dedup protection,
  undermining the rank-inflation defense the dedup exists for (bounded
  only by the route's 120/min IP rate limit, which is a much coarser
  ceiling than per-post dedup). Fixed by adding `DiscoverEvent.ip`
  (populated only when `userId` is `null`) and an anonymous dedup
  branch keyed on `(post, ip)`, using the same trusted-proxy
  `getRequestIp()` every other rate-limited route already resolves:
  no new authentication requirement, no new identity-resolution
  mechanism. Regression tests: `src/app/api/discover/events/__tests__/route.integration.test.ts`
  tests 19c (repeated anonymous IMPRESSION from one IP is deduped),
  19d (two different anonymous IPs are each still counted, proving
  this isn't over-aggressive), 19e (an authenticated viewer's dedup
  stays keyed on `userId`, unaffected by IP changes), and 19f (`ip` is
  never persisted on a row that already has a `userId`). IP-based
  dedup is still just a rate-*shaping* measure, not a strong identity
  boundary (shared IPs, such as NAT, a household, or a school, can
  under-count distinct real viewers as one; a motivated attacker can
  rotate IPs to evade it); the route's hard 120/min-per-IP rate limit
  is the actual abuse ceiling either way; dedup only stops trivial,
  unrotated spam from inflating engagement-derived rank.
- **Unauthenticated writes**: `POST /api/discover/events` is
  reachable while signed out by design (anonymous impressions are
  real signal, same as `/api/ads/impression`), but it can only ever
  create a `DiscoverEvent` row, never mutate a `Post`/`User`/anything
  else, and every row is attributed to a verified user id or explicitly
  `null`; never a client-supplied id.
- **Client-supplied identity spoofing**: `recordDiscoverEvent()`
  (`src/lib/discover/events.ts`) reads `viewerId` only from its typed
  `RecordDiscoverEventInput.viewerId` parameter, which the route
  populates exclusively from `getVerifiedToken`; it never reads a
  `userId`/`viewerId` field out of the parsed request body, so a client
  cannot attribute an event to a different account by sending one.
  Regression test: "never attributes an event to a client-supplied
  userId/viewerId" in the same integration test file (test 20b):
  sends a spoofed `userId`/`viewerId` in the body alongside a real
  verified session for a *different* account and asserts the stored row
  is attributed to the verified session, never the spoofed id.
- **Sensitive data exposure / logging secrets**: `console.error` calls
  in both routes log only the caught `Error` object (matching every
  other route in the codebase), never a request body or session; the
  author `select` is a fixed five-field allowlist, so there is no
  password/token/email field to ever leak. `DiscoverEvent.ip` is
  written to the database but never read back into any API response;
  neither `GET /api/discover` nor `POST /api/discover/events` selects
  or returns it.
- **Redis failure behavior (re-audited in this pass)**: dedup itself
  has no Redis dependency at all (it's a plain `prisma.discoverEvent.findFirst`
  query), so a Redis outage cannot disable or weaken the anonymous/
  authenticated dedup fix above. Rate limiting still fails closed via
  the existing in-memory fallback (`checkRateLimitKey`,
  `src/lib/rate-limit.ts`); never fail-open. Feed ranking/pagination
  caching still fails soft to a fresh per-request Postgres recompute;
  never a blank page or a crash.
- **Premium leakage (re-audited in this pass, one real bug found and
  fixed)**: `applyPremiumGating` sets a locked premium post's
  `imageUrl` to `null`, but `DiscoverFeedItem.media.url` was originally
  typed as a plain (non-nullable) `string`, with a `post.imageUrl as
  string` cast at the one call site that built it, a type assertion,
  not a runtime guard, so the real behavior (a `null` reaching the
  response) was masked from the type checker rather than fixed. This
  was a correctness/data-shape bug, not an actual content leak; the
  real video URL was never sent to an unpaid viewer either before or
  after this fix, but a `null` disguised as `string` risked breaking a
  client's video player and contradicted the surrounding code comment's
  own claim ("never null by the time a post reaches here", which was
  true for the candidate pool but not after premium gating runs).
  Fixed by making `media.url` honestly `string | null` in the type and
  removing the cast; verified with the "redacts a pay-per-view post's
  real content" integration test, which explicitly asserts
  `media.url === null` for a non-purchasing viewer and the real URL for
  the creator/a purchaser.

## Tests

- `src/lib/discover/__tests__/ranking.test.ts`, pure unit: freshness
  decay, engagement weight ordering, view-count log-dampening,
  deterministic tie-breaking.
- `src/lib/discover/__tests__/diversity.test.ts`, pure unit: no
  same-author repeat when an alternative exists in the lookahead
  window, repeats allowed when none exists, never drops/duplicates an
  item.
- `src/lib/discover/__tests__/events-validation.test.ts`, pure unit:
  `DiscoverEventType` validation, `watchedMs` normalization/clamping.
- `src/app/api/discover/__tests__/rate-limit.test.ts` and
  `src/app/api/discover/events/__tests__/rate-limit.test.ts`, exercise
  the real rate limiter (not mocked) against both routes, same
  convention as `src/app/api/turn-credentials/__tests__/route.test.ts`.
- `src/app/api/discover/__tests__/route.integration.test.ts` and
  `src/app/api/discover/events/__tests__/route.integration.test.ts`,
  real-Postgres coverage: valid feed content, empty feed, cursor
  pagination with no duplicates/no skips, invalid cursor, limit
  clamping, banned/blocked/muted/private/deleted-content filtering,
  creator diversity, freshness and engagement ranking, low-engagement
  content still surfacing, no sensitive fields ever returned,
  anonymous-vs-authenticated viewer state, event recording, event
  validation, event dedup (both the authenticated-userId path and the
  anonymous-IP path added in the hardening pass), client-supplied-
  identity-spoofing rejection, pay-per-view redaction (caption AND
  media URL, for a non-purchasing viewer vs. the creator vs. a
  purchaser), and `watchedMs` clamping.
  `describe.skipIf`-gated on a real `DATABASE_URL`, per the project's
  existing integration-test convention (`CLAUDE.md`).

See the PR description's "Tests" section for exactly which of the
above were actually executed against a live database and their exact
results: as of the hardening pass, all of them were (57/57 Discover
tests passed against a real, freshly-provisioned Postgres, 0 skipped).

## Known limitations / audit findings

- **`GET /api/posts/explore` (the existing "For You" feed) does not
  exclude banned authors**: `viewablePostAuthorFilter` alone only
  governs private-account visibility, not the ban flag, and explore's
  own `where` clause never adds `banned: false` the way
  `GET /api/hashtags/search` already learned to. Discover adds
  `banned: false` explicitly for itself (see `candidates.ts`); the
  same fix for `/api/posts/explore` is a good, narrowly-scoped follow-
  up but is out of scope for this backend-only Discover PR per the
  directive's "do not redesign unrelated parts of the application."
- **No NSFW/sensitive-content flag exists anywhere in the `Post`
  model**: Discover has nothing to gate on for this today; adding one
  would be a schema change affecting the whole posting/moderation
  system, not a Discover-specific concern.
- **No Post↔MusicTrack attachment exists**: `audio` is always `null`
  in V1 (see "Audio / music" above).
- **No content-language field on `Post`**: no language-aware
  filtering/ranking is possible yet (see "Multilingual discovery").
- **A future concurrent-write race**: `DiscoverEventService`'s dedup
  check-then-create is not atomic (two simultaneous requests for the
  same viewer-or-IP/post/event-type within the same instant could both
  pass the dedup check before either writes). Consistent with the
  existing `AdImpression`/`AdClick` dedup this was modeled on, which has
  the same property: a reasonable, documented V1 tradeoff for an
  analytics-only table, not a security or correctness boundary for
  anything financial or access-controlling.
- **IP-based anonymous dedup is a rate-shaping measure, not a strong
  identity boundary**: see "Anonymous event abuse" in the Security
  review above: shared IPs can under-count distinct anonymous viewers
  as one, and a motivated attacker can rotate IPs to evade it. The
  route's 120/min-per-IP hard rate limit is the actual abuse ceiling
  either way.
- **`DiscoverEvent.ip` retention has no dedicated purge job**: an
  anonymous row's `ip` is retained indefinitely once written (matching
  `AdImpression`/`AdClick`'s own indefinite retention of `userId`, the
  closest existing precedent), even though it's only ever read back
  within the 60s dedup window. A future privacy/retention pass could
  add a scheduled job to null out `ip` (or delete the row) once it's
  aged past that window; not implemented here to avoid introducing a
  new background job as part of this PR.

## Future ranking evolution

`DiscoverRankingService`'s `scoreCandidate` is the only function that
needs to change to layer in, without touching the API contract:

- Watch time / completion rate / skip rate / repeat views, once
  `DiscoverEvent` has enough volume to aggregate meaningfully per post.
- Personalization from the viewer's own like/follow/watch history.
- Negative feedback (an explicit "not interested" signal doesn't exist
  yet anywhere in ZRP).
- Interest/topic and language-aware ranking, once a real content-
  language signal exists (see "Multilingual discovery").
- Creator-quality signals (e.g. folding in `CreatorProfile`/Trust
  Passport-style signals that already exist elsewhere in ZRP).
- Session-level re-ranking (what the viewer already scrolled past this
  session), would need session state, which Discover's stateless
  per-request model doesn't carry today.
- A genuine candidate-generation stage beyond "most recent 200
  qualifying posts" (e.g. a wider, sampled/indexed candidate set) if
  the 200-row window stops being representative at scale.

None of these require a new API version: `DiscoverFeedItem`'s shape
already has room (`stats`, `viewerState`, `audio`) for what they'd add.
