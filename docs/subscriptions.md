# ZRP Subscriptions: Time-bounded entitlement lifecycle

Before this feature, ZRP knew WHICH plan a user was on (`User.plan`) but
had no time-bounded record of that entitlement at all: no purchased
duration, no period start/end, no expiration, no renewal reminder, no
downgrade-on-lapse. A payment being "verified" or an upgrade request
being "approved" just flipped `User.plan` and never revisited it - a
`pro` user from a year ago was still `pro` forever, whether or not they
ever paid again. This is the fix: a real `Subscription` domain model,
plus the payment-to-entitlement, expiration and reminder engines that
make it authoritative, plus an admin Subscriptions & Billing dashboard.

See `src/lib/subscriptions.ts` for the implementation; everything below
describes what that file actually does, not aspirational scope.

## Source of truth

`Subscription` (one row per user, `userId` unique) is the single
authoritative answer to "is this user entitled to their paid plan right
now?". `User.plan` still exists - dozens of existing call sites read it
directly (`src/lib/limits.ts`, `src/lib/permissions.ts`, the JWT/session
`FeatureStatus` cache in `auth-state.ts`) and changing all of them was
out of scope - but from this feature onward it is a denormalized display
cache, **never written on its own**. Every write to `User.plan` for a
paid entitlement happens inside the same transaction as a `Subscription`
write, in exactly three places: `applyVerifiedPayment`,
`expireDueSubscriptions`, and the admin cancel/restore helpers, all in
`src/lib/subscriptions.ts`. (Admin ban/moderation code that resets a
user's plan for punitive/unrelated reasons is a separate, pre-existing
concern this feature does not touch.)

## Why manual renewal, not auto-charging

ZRP has no payment method capable of charging a user without their
active participation - Solana/USDC payments are always user-submitted
and manually verified (`PaymentRequest`, `UpgradeRequest`,
`src/lib/solana.ts`). So "renewal" here always means **the user paid
again**, and the system extended their period - never a server-initiated
charge. `nextBillingAt` is "the date you need to pay again by to avoid a
gap in service", not a scheduled auto-charge job. If ZRP ever adds a
payment provider capable of real recurring billing, that would plug into
`applyVerifiedPayment` the same way a manual payment does today - the
domain model doesn't need to change, only what triggers a call into it.

## Data model

```
Subscription        (1 per user - current state)
  ├─ SubscriptionPayment[]   (append-only ledger: every period-granting payment)
  └─ SubscriptionEvent[]     (append-only billing audit log: every state transition)
```

`Subscription` fields: `plan`, `status` (`PENDING` / `ACTIVE` / `EXPIRED`
/ `CANCELED`), `billingInterval` (`MONTHLY` / `YEARLY`), `startedAt`,
`currentPeriodStart`, `currentPeriodEnd`, `nextBillingAt` (mirrors
`currentPeriodEnd` while `ACTIVE`), `canceledAt`, `expiredAt`,
`lastPaymentAt`, `reminderSentAt` (durable J-7 dedup marker, reset
whenever the period changes), `isLegacyBackfill` (true for a row created
by the historical migration below, never a real payment).

**Deliberately smaller than the task's suggested field list**: no
`PAYMENT_FAILED` or `EXPIRING` status. A failed manual payment is
recorded as a `PaymentRequest`/rejected row and a
`subscriptionEvent`-style count in the admin overview, not a
`Subscription.status` value, because a failed payment attempt never
actually changes what the user is entitled to right now - the existing
active period (if any) is untouched. "Expiring soon" is a computed label
(`currentPeriodEnd` within N days while `status = ACTIVE`), not a stored
status, so there's no separate transition to get wrong.

`SubscriptionPayment` is the actual idempotency guard for payment→
entitlement (see below): exactly one of `paymentRequestId` /
`upgradeRequestId` / `adminGrantRef` is set per row, each with its own
`@unique` database constraint.

`SubscriptionEvent.action` values actually emitted: `payment_verified`,
`subscription_created`, `subscription_renewed`, `subscription_extended`,
`subscription_plan_changed`, `subscription_expired`,
`subscription_canceled`, `subscription_restored`, `reminder_sent`,
`reminder_failed`, `backfilled`. (`plan_changed` renders as
`subscription_plan_changed` via the `subscription_${kind}` action name in
`applyVerifiedPayment`.)

## Payment → entitlement (`applyVerifiedPayment`)

Called from inside the *same* `prisma.$transaction` that claims the
underlying `PaymentRequest`/`UpgradeRequest` row via the existing
conditional-`updateMany` compare-and-swap pattern
(`src/app/api/admin/payments/verify/route.ts`,
`src/app/api/upgrade-requests/[id]/route.ts`). That claim is the
outer idempotency guard; `SubscriptionPayment`'s unique constraint is a
second, independent, database-level guard underneath it.

**Extension rule** (Step 3's worked example, tested in
`src/lib/__tests__/subscriptions.integration.test.ts`): if the user
already has an `ACTIVE` subscription for the *same* plan whose
`currentPeriodEnd` is still in the future, the new payment's period is
appended after the existing one ends - active until Oct 15, buys another
month on Sep 20, now active until Nov 15, not Oct 20. Otherwise (no
active period, a lapsed subscription, or a plan change) a fresh period
starts from `now`.

**Plan changes are never prorated.** Upgrading (or downgrading) mid-period
starts a brand new period from today at the new plan's price, with
whatever time remained on the old plan simply forfeited. This mirrors
the rest of the codebase - there is no refund/credit/proration concept
anywhere else in ZRP's monetisation code - and is called out explicitly
rather than silently assumed. If ZRP wants prorated upgrades later, that
policy lives entirely inside `applyVerifiedPayment`'s branch logic; no
caller or schema change is needed.

**Amount and duration are always server-derived, never trusted from the
client.** `getPlanPrice(plan, interval)` reads straight from
`PLANS.priceMonthly` / `PLANS.priceYearly` in `src/lib/limits.ts` - the
one existing table of ZRP's real prices. `POST /api/payment/crypto` lets
a user pick a plan and an interval (monthly/yearly - the only two ZRP
publishes) but the amount charged is always looked up server-side.

### A real concurrency bug this caught

Building the idempotency guard above surfaced two genuine race conditions
during integration testing (not hypothetical - both reproduced
consistently under `Promise.all` before the fix):

1. **First-ever payment for a user**: two concurrent payments for a user
   with no `Subscription` row yet both see `null` from `findUnique` and
   both attempt to `create` one. Only one can win the
   `Subscription_userId_key` unique constraint - the naive fix (catch the
   error, re-`findUnique`) doesn't work, because **Postgres poisons an
   entire transaction on any statement error**: once the `create` throws,
   every later statement in that same transaction fails too, including
   the caller's own audit-log write. The fix uses a raw
   `INSERT ... ON CONFLICT ("userId") DO NOTHING`, which never raises on
   conflict - Postgres blocks it until the winning transaction commits,
   then either inserts or silently no-ops - so the transaction is never
   poisoned.
2. **Same fix applied to the `SubscriptionPayment` duplicate-payment
   guard**: since three different columns can each be the unique
   conflict target (`paymentRequestId` / `upgradeRequestId` /
   `adminGrantRef`), a single `ON CONFLICT` target doesn't work generically.
   Instead the insert is wrapped in an explicit `SAVEPOINT` /
   `ROLLBACK TO SAVEPOINT`, so a unique-constraint hit rolls back just
   that one statement and lets the transaction continue to log the
   "duplicate" event/response.

Both are covered by dedicated concurrent-write tests and were reproduced
failing before the fix, not just asserted to pass after.

## Expiration engine (`expireDueSubscriptions`, `GET /api/cron/expire-subscriptions`)

Follows the exact existing pattern already used by
`/api/cron/publish-scheduled-posts` and `/api/cron/expire-ad-campaigns`:
a `CRON_SECRET`-gated route, failing **closed** if the secret is unset.
Scheduled via its own GitHub Actions workflow
(`.github/workflows/cron-expire-subscriptions.yml`), hourly, matching
`cron-expire-ad-campaigns.yml` - this repo has no in-repo record of how
the two oldest cron routes are invoked in production, so every newer one
gets its own independent, reviewable schedule (see that workflow's own
comment).

Safe across concurrent Railway instances and repeated/overlapping runs:
each candidate subscription (`status: ACTIVE`, `currentPeriodEnd < now`)
is claimed with its own conditional `updateMany` (`where: { id, status:
"ACTIVE", currentPeriodEnd: { lt: now } }`) inside its own transaction.
Two workers racing on the same row: the loser's claim matches zero rows
and is skipped, no read-then-write anywhere in the hot path. On a
successful claim: `status → EXPIRED`, `User.plan → "free"`, one
`subscription_expired` `SubscriptionEvent`, and the in-memory auth-state
cache is invalidated so the downgrade takes effect on the user's very
next request rather than up to 30s later.

## J-7 reminder (`sendJ7Reminders`, `GET /api/cron/subscription-reminders`)

Same cron shape/schedule as the expiration engine. Candidates: `status:
ACTIVE`, `reminderSentAt: null`, `currentPeriodEnd` within the next 7
days. `reminderSentAt` is claimed via the same conditional-`updateMany`
pattern **before** attempting delivery, not after - the durable state
that guarantees "exactly one reminder per billing period" is this
column, reset to `null` whenever `applyVerifiedPayment` starts or
extends a period, so a new period always gets its own fresh reminder
window.

Delivery uses ZRP's existing notification infra unchanged -
`sendPushNotification` (`src/lib/push-notifications.ts`, both Web Push
and FCM) and `sendEmail` (`src/lib/email.ts`, Resend) - no parallel
notification system. Both are called independently and each wrapped in
its own `try/catch`; a `SubscriptionEvent` is logged either way
(`reminder_sent` if either channel didn't throw, `reminder_failed`
otherwise), but **the financial fields on `Subscription` are never
touched by this function regardless of delivery outcome** - notification
failure cannot corrupt subscription state, by construction (there's
nothing in the reminder path that writes `plan`/`status`/period dates at
all).

**Documented tradeoff**: because the claim happens before delivery, a
transient push/email failure is *at-most-once*, not retried - the next
worker run will not re-attempt it, since `reminderSentAt` is already set.
This is a deliberate choice: the actual requirement is "never more than
one reminder per period," and no email/push provider guarantees delivery
regardless, so retrying would only reintroduce the duplicate-send risk
this design eliminates. If guaranteed-eventually-delivered reminders
become a real requirement, that needs a proper outbox/retry queue, which
is out of scope here and called out as a known limitation rather than
silently assumed away (matching how ZRP PLAY's `REACTION` timing
limitation is documented in the root `CLAUDE.md`).

## Renewal lifecycle, worked through

- **Before expiration**: `applyVerifiedPayment` extends from
  `currentPeriodEnd` (see above).
- **On/after expiration**: `currentPeriodEnd` has already passed, so
  `hasActiveSamePlanPeriod` is false and a fresh period starts from `now`
  - the user simply loses the gap between when their old period ended and
  when they paid again, matching how a real manual-renewal business
  actually works.
- **Multiple consecutive purchases**: each extends the running period
  further; `reminderSentAt` resets on every one, so a user who renews
  repeatedly always gets exactly one reminder per fresh period.
- **Failed payment**: a rejected `PaymentRequest`/denied `UpgradeRequest`
  never reaches `applyVerifiedPayment` at all - the existing subscription
  (if any) is completely untouched. Counted in the admin overview via
  `PaymentRequest.status = "rejected"`.
- **Duplicate verification**: a no-op the second time, at the database
  level (see "payment → entitlement" above).

## Admin Subscriptions & Billing (`/admin/subscriptions`)

**UI/UX fix (post-launch, second pass):** a real device screenshot showed
the table squeezed into a phone viewport - every column and header wrapped
character-by-character ("STATUS" as a single letter per line, usernames
broken into fragments), and every avatar rendered as a broken-image icon.
Two distinct root causes:

1. The table's own `w-full` class, with no `min-w`, let it shrink to fit
   any viewport instead of overflowing and scrolling - so a phone-width
   screen compressed all 8 columns instead of scrolling past them. Fixed
   by giving the table a `min-w-[1040px]` (so it now scrolls horizontally,
   with a sticky first column, on anything narrower) and replacing it
   entirely below the `md` breakpoint with a card-per-user list
   (`MobileUserCard`) rather than trying to force a wide table into a
   narrow layout at all.
2. `/public/default-avatar.png` - the fallback every avatar in the app
   (not just this dashboard) fell back to - has never existed as a real
   file. `src/components/ui/avatar.tsx` now renders generated initials on
   a deterministic color (`src/lib/avatar-fallback.ts`, unit-tested) when
   there's no image or the real one fails to load, instead of pointing at
   a second missing asset. Scoped to the shared `Avatar` component and its
   two real call sites (`AdminUserIdentity`, `FeedItem`) - the ~14 other
   places in the app that reference `/default-avatar.png` directly as a
   raw string (Comments, Play, Opportunity, Aid, Settings, Explore, …) are
   a separate, pre-existing, sitewide issue outside this fix's scope.

**Root-cause fix (post-launch):** the list route originally queried
`Subscription` as its base table. Since a `Subscription` row is only
created via the new payment/grant/backfill path, any user without one -
every free user, and every legacy-paid user not yet run through
`scripts/backfill-subscriptions.ts` (a manual, one-time operator step,
never wired into CI/CD) - was structurally invisible to search and every
filter, even though the KPI counters (computed separately, over `User`)
showed real numbers. The symptom matched exactly: correct-looking KPIs
next to a search/filter table that silently came back empty for real
users. The fix moves the base query to `prisma.user.findMany` with
`subscription` as an optional relation, so every user is reachable with
or without a `Subscription` row, and defines a `buildPopulationWhere()`
helper that both the overview KPIs and the filtered list call with the
exact same arguments - making a KPI/list count mismatch structurally
impossible rather than something to keep in sync by hand. A second, real
bug found during this fix (pre-dating it, not introduced by it): the row
wrapped `AdminUserIdentity` - which already renders its own `<Link>`s to
`/profile/username` - inside another `<Link>` to the billing detail page,
producing invalid nested `<a>` tags and a reproducible hydration error
that left the table rendering empty after certain navigations. Every
other admin page using `AdminUserIdentity` leaves it unwrapped for
exactly this reason; the subscriptions page now does too, with a separate
"Billing" link alongside it.

Four population values beyond the four real `SubscriptionStatus` values
are supported by both the KPI counters and the `status` filter, via the
same `buildPopulationWhere()`:
- `PAID` - `User.plan !== "free"` (mirrors what the app itself currently
  grants access on, per "Source of truth" above).
- `FREE` - `User.plan === "free"`.
- `NO_SUBSCRIPTION` - `User.plan !== "free"` **and** no `Subscription`
  row: the "needs reconciliation" bucket. Never folded into `FREE` -
  this user is still receiving paid features via the legacy plan field,
  and reporting them as free would understate paid usage exactly the
  way "Existing users" below warns against.

`src/app/api/admin/subscriptions/route.ts` (list + overview, server-side
search/filter/sort/pagination - never loads the full table),
`.../[userId]/route.ts` (per-user detail: current state, full payment
history, full billing audit log, legacy manual-request history for
context), and three admin action routes: `.../[userId]/grant`,
`.../[userId]/cancel`, `.../[userId]/restore`. All gated by
`requireAdmin()` per the existing `src/lib/admin.ts` convention, and each
action also writes an `AuditLog` row (`subscription.grant` /
`subscription.cancel` / `subscription.restore`) alongside its
`SubscriptionEvent`, so it shows up in both the existing platform-wide
`/admin/audit-log` and the per-user billing history.

**Admin controls deliberately excluded**: no arbitrary "set any field"
editor, no way to fabricate a payment amount or a specific historical
transaction reference. Grant reuses the exact same extend-or-fresh logic
as a real payment (tagged `paymentMethod: "admin_grant"`, `amount: 0`, so
it's visibly distinct from revenue in the payment ledger, never posing as
a real purchase). Cancel/restore only ever touch the current
`ACTIVE`/`CANCELED` row for one user - there is no bulk action, since a
bulk financial mutation is exactly the kind of thing this feature exists
to make deliberate and audited, not fast.

**Revenue reporting is honest about its own boundary**: the overview's
revenue total sums `SubscriptionPayment.amount` (excluding
`admin_grant` rows), which only exist for payments verified *after* this
feature shipped, plus whatever the historical backfill created (`amount:
0`, also excluded). Revenue from payments verified before this feature
existed is not retroactively reconstructed and is not represented in that
total - the UI labels this explicitly rather than presenting a number
that looks complete but isn't.

## Existing users / historical migration

`prisma/migrations/20260915200000_add_subscription_lifecycle/` is purely
additive (two new enums, three new tables, one new nullable column with
a default on `PaymentRequest`) and touches zero existing rows - per
CLAUDE.md's expand → backfill → verify → switch policy, the actual data
backfill is a separate, reviewable, re-runnable script:
`scripts/backfill-subscriptions.ts` (`--dry-run` supported).

Policy for every existing paid user (`User.plan != "free"`) with no
`Subscription` row yet:

1. **Free-plan users get nothing** - there's no paid entitlement to
   reconstruct.
2. If a real signal exists - a `verified` `PaymentRequest` or an
   `approved` `UpgradeRequest` for that user matching their current plan
   - **and** the period that record implies (`billingInterval` +
   verified/approved date) has **not yet lapsed** as of today, that real
   period is used. This is a genuinely reconstructed period, not a guess.
3. **Otherwise** - no record found, or the reconstructed period would
   already be in the past (there is no way to know how many times a user
   has silently renewed since an old record, so no renewal history is
   invented) - a conservative one-interval grant starting **today** is
   created instead, so the migration never removes access from a user who
   took no action. The interval used is the historical record's if one
   was found, otherwise monthly (the only duration ZRP's crypto route has
   ever actually charged to date).

Every row this script creates is flagged `isLegacyBackfill: true` and
logged with a `backfilled` `SubscriptionEvent` recording exactly which
policy branch applied, so the admin dashboard can label it distinctly
rather than presenting it as an ordinary dated purchase. The script is
idempotent - it only ever considers users with no `Subscription` row, so
running it again after new real payments have started flowing is safe.

Verified against a realistic local dataset (a free user with no history,
a `pro` user with a real verified `PaymentRequest`, a `business` user
with a real approved `UpgradeRequest`, a `pro` user with *no* payment
history at all, and an `enterprise` user whose only payment record is
over a year old) - see the worked dry-run output in the PR description.
All five resolved to the documented branch, and re-running the script
afterward found zero remaining candidates.

## What this explicitly does NOT do

- **No automatic recurring charging.** ZRP's payment rails don't support
  it; building a lifecycle that pretended otherwise would be actively
  misleading. Renewal is always the user paying again.
- **No proration on plan changes.**
- **No retry queue for failed reminder delivery** (see the J-7 section's
  documented tradeoff).
- **No revenue reconstruction for payments verified before this feature
  existed** - the admin overview is explicit about this boundary rather
  than fabricating historical figures.
