# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

ZRP is a Twitter/X-style social platform built on Next.js 14 (App Router) with a custom
Node HTTP server that layers Socket.IO on top for realtime features (DMs, typing
indicators, presence, WebRTC call signaling). It has tiered paid plans (free/pro/business/
enterprise), creator monetisation (tips, pay-per-view posts) settled in USDC over Solana,
and an admin backoffice for moderation and payment approval.

## Commands

- `npm run dev` — starts the app via `server.js` (NOT `next dev`). This is required because
  Socket.IO is attached to the raw HTTP server in `server.js`; using `next dev` directly will
  not wire up realtime features.
- `npm run build` — `next build`.
- `npm run start` — production start, also via `server.js` (`NODE_ENV=production node server.js`).
- `npm run lint` — `next lint`.
- `npx prisma generate` — regenerate the Prisma client after schema changes (also runs
  automatically as `postinstall`).
- `npx prisma migrate dev --name <name>` — create/apply a migration during development.
- `npx prisma studio` — inspect the database.

There is no test suite configured in this repo (no test script, framework, or test files) —
don't assume one exists.

`.npmrc` sets `legacy-peer-deps=true`; use plain `npm install`, not `npm ci` with strict
peer resolution.

## Environment variables

Required for local dev (see `.env`, not committed): `DATABASE_URL` (Postgres), `NEXTAUTH_SECRET`,
`NEXTAUTH_URL`, `EMAIL_SERVER`, `EMAIL_FROM`, `UPLOADTHING_SECRET`, `UPLOADTHING_APP_ID`.

Other features read these when present (all fail soft/are optional at runtime):
- `REDIS_URL` / `REDIS_PUBLIC_URL` — rate limiting and caching (`src/lib/redis.ts`,
  `src/lib/rate-limit.ts`). Without Redis, rate limiting is skipped and requests are allowed.
- `SOLANA_RPC_URL` / `NEXT_PUBLIC_SOLANA_RPC_URL`, `SOLANA_PRIVATE_KEY`,
  `NEXT_PUBLIC_SOLANA_WALLET_ADDRESS` / `NEXT_PUBLIC_PLATFORM_WALLET`, `NEXT_PUBLIC_USDC_MINT` —
  Solana/USDC tipping, premium posts, withdrawals (`src/lib/solana.ts`, `src/contexts/SolanaContext.tsx`).
- `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` / `NEXT_PUBLIC_VAPID_PUBLIC_KEY` — Web Push.
- `RESEND_API_KEY` — transactional email via Resend (`src/lib/email.ts`).
- `GIPHY_API_KEY` — GIF search/trending endpoints.
- `CRON_SECRET` — auth for `/api/cron/*` endpoints (scheduled post publishing).
- `SENTRY_DSN` / `NEXT_PUBLIC_SENTRY_DSN` / `SENTRY_ORG` / `SENTRY_PROJECT` / `SENTRY_AUTH_TOKEN` —
  error tracking, wired in `next.config.js` via `withSentryConfig` and `src/sentry.*.config.ts`.
- `NEXT_PUBLIC_TURN_USERNAME` / `NEXT_PUBLIC_TURN_CREDENTIAL` — TURN server creds for WebRTC calls.
- `PORT` — HTTP port for `server.js` (defaults to 8080).

## Architecture

### Custom server + realtime (`server.js`)

Production and dev both boot through `server.js`, not the Next.js CLI. It creates a plain
Node `http` server, hands page/API requests to Next's request handler, and attaches a
Socket.IO server at path `/api/socket.io`. Socket events cover: room join per userId,
online/offline presence broadcast, direct messaging (`send-message`/`receive-message`,
persisted via a separate REST call — the socket layer itself does not write messages to
the DB except for `mark-read`), typing indicators, and WebRTC call signaling
(`call-user`/`accept-call`/`reject-call`/`end-call`, via `simple-peer` on the client —
see `src/components/CallComponent.tsx` and `src/lib/socket-client.ts` /
`src/lib/socket-server.ts`).

### Auth (`src/lib/auth.ts`, `src/middleware.ts`)

NextAuth with a single Credentials provider, JWT session strategy (no DB sessions table).
`authorize()` does bcrypt comparison but also has a legacy plain-text fallback that
transparently upgrades old plain-text passwords to bcrypt hashes on successful login — this
is intentional migration logic, not a bug. Login is blocked until `emailVerified` is set.

The JWT/session callbacks compute and cache a `FeatureStatus` object (see Plans below) on
the token so pages don't need a DB round trip to check plan features.

`src/middleware.ts` runs on nearly every route (see `config.matcher`) and: exempts NextAuth
internal routes and public auth pages; rate-limits login/register attempts; force-redirects
banned users to `/login?error=banned` (and clears their session cookies); force-redirects
users with `onboardingCompleted === false` to `/onboarding`; and gates `/settings/team`,
`/api/team`, `/settings/api-keys`, `/api/api-keys` behind plan features.

API routes that aren't covered by session auth (external integrations) use bearer-token
auth instead — see `src/lib/api-auth.ts` (`validateApiKey`, SHA-256-hashed keys) and the
`src/app/api/external/*` routes.

### Plans, limits, and feature gating

`src/lib/limits.ts` defines the `Plan` type (`free`/`pro`/`business`/`enterprise`) and the
`PLANS` table of numeric limits (post length, image count, video size, scheduled posts) and
boolean features (custom URL, recruitment posts, article publishing, team management, API
access). `checkPostLength`/`checkImagesPerPost`/`checkVideoSize`/`checkScheduledPostsCount`
return `{ allowed, message, limit }` and are called from the relevant API routes.

`src/lib/permissions.ts` wraps `limits.ts` with per-feature boolean helpers
(`canUseCustomUrl`, `canPostRecruitment`, `canPublishArticle`, `canManageTeam`,
`canAccessApi`) plus `getFeatureStatus()` which produces the `FeatureStatus` cached on the
JWT, and DB-backed team membership helpers (`isTeamMember`, `isTeamAdmin`, `getTeamMembers`).
When adding a new paid feature, add it to `PlanLimits` in `limits.ts`, wire a helper in
`permissions.ts`, and gate the route/UI off `session.user.features` (client) or a fresh
`getFeatureStatus()` call (server) — don't hand-roll plan checks elsewhere.

### Data model (`prisma/schema.prisma`)

Single Postgres schema via Prisma. Broad shape:
- **Social graph**: `User`, `Follow`, `Mute`, `Blocked`.
- **Content**: `Post` (has a `type`: `POST`/`RECRUITMENT`/`ARTICLE`, each with its own
  extra fields on the same model — recruitment uses `company`/`location`/`applyUrl`,
  articles use `body`), `Comment` (self-referential for replies via `parentId`), `Poll`/
  `PollVote`, `Story`/`StoryView` (24h expiry set in application code, not DB-enforced),
  quote-posts (`Post.quotePostId` self-relation), and reactions/likes/reposts/bookmarks
  duplicated as parallel tables for both `Post` and `Comment` (e.g. `Like` vs `CommentLike`,
  `Repost` vs `CommentRepost`, `Bookmark` vs `CommentBookmark`) — there is no shared
  polymorphic "reactable" table, so new reaction-like features typically need both variants.
- **Messaging/notifications**: `Message` (DM, persisted independent of the socket layer),
  `Notification`, `PushSubscription`.
- **Moderation**: `Report` (against posts or comments), admin ban/plan endpoints under
  `src/app/api/admin/*`.
- **Monetisation**: `CreatorProfile` (per-user monetisation settings + running balance
  totals), `Tip`, `PremiumPost`/`PremiumPurchase` (pay-to-view posts), `WithdrawalRequest`
  (payout to a Solana wallet address). All of these carry a `platformFee`/`charityAmount`/
  `creatorAmount` split (platform takes a cut, a fixed portion of that goes to charity —
  see `charityContribution` in `PLANS`) and a `TransactionStatus`/`WithdrawalStatus` enum.
- **Team/API accounts**: `TeamMember` (role-based, tied to a Business/Enterprise account
  owner via `accountId`), `ApiKey` (hashed, revocable, expirable).
- **Upgrades/payments**: `UpgradeRequest` (manual plan upgrade requests, admin-approved) and
  `PaymentRequest` (crypto payment claims, admin-verified) — these are the legacy/manual
  path alongside the newer direct Solana flow in `src/lib/solana.ts` and
  `src/app/api/payment/crypto`.

### App Router layout (`src/app`)

Route groups: `(auth)` currently only supplies a `loading.tsx` for `/login`; the actual
`/login` page lives in the sibling (non-grouped) `src/app/login/`, so don't assume
`(auth)/login/page.tsx` is where login UI lives. `src/app/api/*` holds ~100 route handlers,
organized by resource, generally following: read `getToken()` for the session, load/mutate
via `prisma`, apply plan/feature checks from `lib/limits.ts` / `lib/permissions.ts` where
relevant. `src/app/admin/*` is the moderation/ops UI (analytics, payments, posts, reports,
upgrade-requests, users) — gate any new admin page/route on `session.user.role`/`isAdmin`,
matching existing routes under `src/app/api/admin/*`.

### Shared client state

`src/contexts/`: `AuthProvider`-adjacent NextAuth session (via `SessionProvider`, not a
custom context), `ThemeContext` (light/dark), `LanguageContext` (i18n — see
`src/lib/translations.ts`), `SolanaContext` (wallet adapter setup for
`@solana/wallet-adapter-react`). Uploads go through UploadThing
(`src/lib/uploadthing.ts` server config, `src/lib/uploadthing-client.ts` client hooks) —
prefer that over the raw `/api/upload` route for new upload UI.

### Path aliases

`@/*` maps to `src/*` (see `tsconfig.json`). Use it instead of relative `../../..` imports.
