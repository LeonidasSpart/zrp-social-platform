# Notifications & Social Interactions

Architecture notes for the notification system and the social interactions
that produce notifications (likes, comments, replies, reposts, follows,
mentions). Written alongside a surgical audit-and-fix pass - see git
history around this file's introduction for the full list of confirmed
bugs found and fixed. When this document and the source disagree, the
source wins.

A second pass (see git history for the commit introducing "Blocked-user
enforcement" and the `comment_repost` type below) closed two gaps the
first pass's own audit had missed: likes/comments/comment-likes/reposts
only ever suppressed the *notification* for a blocked-either-way
relationship, not the interaction itself (unlike follow and messages,
which already blocked the interaction) - and `/api/comments/[id]/repost`
had been missed entirely, with none of the hardening every sibling toggle
route already had.

## Source of truth

- **Notification state**: the `Notification` table (`prisma/schema.prisma`).
  `src/lib/notifications.ts`'s `createNotification()` is the single writer.
- **Unread counts**: computed fresh from the DB on every read
  (`GET /api/notifications/unread`, `GET /api/messages/unread`) - never
  cached/derived client-side by incrementing a counter.
- **Client unread state**: `src/contexts/UnreadCountContext.tsx` is the
  ONE shared source for the whole web app. Header, Sidebar and BottomNav
  all read from it; none of them may poll or fetch independently (Sidebar
  used to - that was a confirmed bug, fixed by wiring it to the same
  context).
- **Repost quota**: `RepostDailyUsage` (a per-user-per-day row), enforced
  atomically by `src/lib/repost-quota.ts`. No repost quota existed
  anywhere in this codebase before this - see "Repost quota" below.

## Blocked-user enforcement

`isBlockedEitherWay()` (`src/lib/auth-guards.ts`) checks both directions
of the `Blocked` table in one query. Follow and messages already checked
it up front, before any mutation, returning 403 - the interaction itself
never forms for a blocked-either-way relationship. Like, comment (and
reply), comment-like, post-repost and comment-repost did not: they only
suppressed the resulting *notification* (via `createNotification()`'s own
internal check), so the Like/Comment/CommentLike/Repost/CommentRepost row
itself still landed. This is now fixed the same way as follow/messages -
checked up front, before the row is created (and, for reposts, before a
daily quota slot is even reserved, so a blocked relationship can't cost
the reposter part of their limit for an interaction that can't happen
anyway). `createNotification()`'s own check is unchanged and still runs -
it's a second, redundant layer now, not the only one.

## The notification pipeline

```
domain action (like/comment/reply/repost/follow/mention)
      |
      v
createNotification()  (src/lib/notifications.ts)
      |  - skip if self-action
      |  - skip if either party has blocked the other
      v
Notification row created (durable)
      |
      +--> emitToUser(userId, "notification:new") -- realtime, best-effort
      |         (src/lib/socket-emit.ts -> server.js's Socket.IO instance)
      |
      +--> email, IF the type isn't in NEVER_EMAIL_TYPES and the
      |         recipient's preferences allow it
      |
      v
caller (the route) sends push ONLY if createNotification() returned true
      (src/lib/push-notifications.ts - a separate delivery channel;
      a blocked relationship or a self-action must not still push)
```

`createNotification()` returns `boolean`: whether a Notification row was
actually created. Every call site that also sends push checks this first,
so a suppressed in-app notification (self-action, blocked relationship)
never still fires a push alert.

## Realtime

`server.js` stashes its one Socket.IO instance on `globalThis.__zrpIO`
right after creating it. `src/lib/socket-emit.ts` is the only place any
`src/app/api/**` route reads it back from - both run in the same Node
process (the custom-server pattern this repo already uses for messaging),
but API routes have no other way to reach the socket server.

`"notification:new"` is a tiny payload (just the notification's `type`) -
the client re-fetches its real unread count from
`/api/notifications/unread` rather than trusting anything in the socket
event, the same pattern `"receive-message"` already used before this. A
duplicate/replayed event can never leave the badge permanently wrong,
because it's a re-fetch, not an increment.

## Read semantics

Two distinct pieces of state, never confused:

- `PUT /api/notifications` - marks **every** unread notification read.
  Only fired by an explicit "Mark all as read" button.
- `PUT /api/notifications/[id]` - marks **one** notification read. Fired
  when a user clicks that specific notification, before navigating.
  Ownership-checked (404s for someone else's notification, never reveals
  it exists) and idempotent.

Opening the notifications page does **not** mark anything read - it used
to (a `useEffect` fired on every mount the moment any unread notification
existed), which was a confirmed bug against the intended semantics.

Message read state (`Message.read` / `ConversationParticipant.lastReadAt`)
is entirely separate from `Notification.read` - opening a message
notification marks that notification read; it does not, by itself, mark
the underlying message(s) read. That's controlled by opening the actual
conversation, unchanged by this pass.

## Duplicate-notification prevention

There's no DB-level dedup constraint on `Notification` (its `type`/
`fromUserId`/`postId` combination isn't unique) - instead, undo actions
retract their own notification directly:

- Unlike deletes the matching unread `like` notification.
- Un-liking a comment deletes the matching unread `comment_like`
  notification (a distinct type from `like`, specifically so an unlike on
  a post and an unlike on a comment can never delete the wrong one for
  the same `postId`).
- Unfollow deletes the matching unread `follow` notification.
- Un-reposting deletes the matching unread `repost` notification.
- Un-reposting a comment deletes the matching unread `comment_repost`
  notification (a distinct type from `repost`, mirroring why
  `comment_like` is distinct from `like`).

`Notification.commentId` (nullable, `onDelete: Cascade` to `Comment`)
disambiguates *which* comment a `comment_like`/`comment_repost`
notification is about - it is the actual identity key of the underlying
interaction, since `CommentLike`/`CommentRepost` are each uniquely keyed
on `(commentId, userId)`. Before this column existed, both notification
types only had `postId`+`type`+`fromUserId` to match on for retraction -
insufficient, because a single post can have many comments, and the same
actor can like (or repost) several different comments under the same
post: two such notifications would share an identical
`postId`+`type`+`fromUserId` (and even `userId`/recipient, if the same
person authored both comments) despite being two entirely distinct
interactions. Retraction now filters on `commentId` too, so it can only
ever match the specific comment being un-liked/un-reposted - `comment`
and `reply` do not carry a `commentId` since neither is ever retracted
(there is no "un-comment" action), so no such ambiguity exists for them.

This means a like -> unlike -> like cycle (or repost -> un-repost ->
repost) leaves exactly one notification behind, not an orphaned first one
plus a second, and interacting with a different comment on the same post
never disturbs another comment's already-existing notification.

**Migration/backfill note**: `commentId` is nullable specifically so
existing `Notification` rows (created before this column existed) don't
need a backfill to remain valid - a NULL `commentId` is simply a
notification with no comment-level identity, which is what every existing
row already was in practice. A deliberate choice was made NOT to
heuristically backfill `commentId` on old `comment_like`/`comment_repost`
rows: the only way to guess which comment an old row was about is by
matching `postId`+`fromUserId`+approximate `createdAt` against
`CommentLike`/`CommentRepost`, which is exactly ambiguous in the one case
that matters (the same user having liked/reposted more than one comment
by the same author on the same post around the same time) - a guessed
backfill could assign the *wrong* comment, which is worse than leaving it
unset. The bounded, one-time consequence: an unlike/un-repost on a
comment whose original notification predates this migration won't match
the new precise-`commentId` retraction query (a NULL column never equals
a concrete id), so that specific old notification is left in place rather
than retracted - a cosmetically stale notification, not an incorrect one,
and not a security or data-integrity issue. It self-resolves once read
(the `read: false` guard on every retraction query already excludes read
notifications) or ages out with normal use; every notification created
from this deploy onward carries the correct `commentId` from day one.

**Side effect of the FK's `onDelete: Cascade`**: deleting a comment
(`DELETE /api/comments/[id]`) now also deletes any `comment_like`/
`comment_repost` notification that referenced it - previously those rows
were orphaned indefinitely, pointing at a comment that no longer exists,
the same way a deleted post already cascades all of its own
notifications via `Notification.postId`. `comment`/`reply` notifications
are not part of this cascade (no `commentId`) and remain orphaned on
comment deletion exactly as they did before this pass - unchanged,
existing behavior, not a regression introduced here.

## Reply vs. comment

A reply (a comment with `parentId` set) notifies **both** the post author
(`type: "comment"`, unchanged) and the parent comment's author
(`type: "reply"`, new) - unless they're the same person, in which case
only one notification is sent, never two for one action.

## Mentions

`src/lib/mentions.ts` is shared between post creation and comment
creation. `Post.mentions` (a denormalized array of raw usernames) already
existed but nothing ever notified anyone - `notifyMentionedUsers()` is the
missing half: it resolves `@username` to a real, existing user
(case-insensitive) and calls `createNotification()` for each one found,
skipping the author, anyone already notified for the same action (e.g. the
post/parent-comment author), and any blocked-either-way relationship
(via `createNotification()`'s own check). A scheduled post's mentions are
never notified until it actually publishes.

## Repost quota

No repost quota existed anywhere in this codebase before this pass -
reposting was unlimited per user/day. `src/lib/repost-quota.ts` adds one,
following the exact atomic-reservation pattern `src/lib/ai-quota.ts`
already established for AI daily usage:

```
UPDATE "RepostDailyUsage" SET reposts = reposts + 1
 WHERE userId = ? AND date = ? AND reposts < ?
```

A single conditional `UPDATE` the database serializes - two concurrent
requests racing for the last slot can't both pass a stale pre-increment
read. `PlanLimits.repostsPerDay` (`src/lib/limits.ts`): free 50, pro 150,
business 500, enterprise effectively unlimited - chosen as a generous
anti-spam ceiling, not a monetization lever (reposting has always been
free; this only stops automation).

The slot is reserved **before** the `Repost` row is written, and handed
back (`releaseRepost()`) if the write then fails for any reason (a
concurrent duplicate, the post having been deleted) - a failed repost
never costs a slot. Undoing a repost does **not** restore the slot: this
is deliberate, so a repost/un-repost loop can't bypass the daily limit.

`/api/comments/[id]/repost` shares the exact same per-user
`RepostDailyUsage` counter - a repost is a repost for quota purposes,
whether of a post or a comment. This route was missed entirely by the
first audit pass: before this fix it had no quota accounting at all (a
straightforward bypass - hit your post-repost limit, keep reposting
comments for free), no notification to the comment's author, no blocked-
either-way check, and no race-safety on concurrent create/delete (an
unhandled `P2002`/`P2025` would 500). It's now been brought fully in line
with `/api/posts/[id]/repost`, including a new `comment_repost`
notification type (distinct from `comment_like` and `repost` - see
"Duplicate-notification prevention" above) and web UI support
(icon/action text on the notifications page, `GROUPABLE_TYPES`).

## What was audited and found already correct (not touched)

- Web Push / FCM delivery (`src/lib/push-notifications.ts`, `src/lib/fcm.ts`):
  durable DB write always happens before push is attempted, push failure
  is fully isolated (never rolls back or blocks the business mutation),
  and stale subscriptions/tokens are pruned on a permanent-failure
  response (404/410/`registration-token-not-registered`).
- `Like`, `Repost`, `CommentLike`, `CommentRepost`, `Follow`, `Mute`,
  `Blocked` all already had `@@unique` composite constraints preventing a
  duplicate row at the database level, even before the race-handling
  added in this pass (which only fixed the resulting unhandled-error ->
  500 UX, not a data-integrity gap).
- Android and iOS unread-badge state: both already have one shared
  ViewModel per count, not scattered per-screen state (unlike web's
  Sidebar, which was the one outlier there).
- iOS push notifications are not implemented - a known, already-documented
  gap (`ios-native/PARITY.md` §B3) blocked on external Firebase/APNs
  credentials, not something this pass could fix.

## Deliberately not built this pass

- Notification.type is not an enum - keeping it a plain `String` avoided a
  larger, riskier migration for a cosmetic type-safety improvement; the
  one real bug this caused (two monetization notification types stored in
  inconsistent casing) was left alone since fixing it meant touching
  payment-flow files outside this pass's actual scope (notifications and
  social interactions, not monetization).
- No generic notification-grouping infrastructure beyond what already
  existed (`GROUPABLE_TYPES` on the web notifications page, already
  present before this pass) - extended only far enough to cover the new
  `comment_like` and `comment_repost` types consistently with `like` and
  `repost`.
- No request-level idempotency key on comment creation - the existing
  rate limiter plus the client's own submit-in-flight guard were judged a
  reasonable existing mitigation; a dedicated idempotency-key system was
  out of proportion for the confirmed risk (a double-tap creating two
  near-identical comments), which is a lesser issue than the security/
  business-rule bugs this pass focused on.
