# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

ZRP is a Twitter/X-style social platform built on Next.js 15 (App Router) with a custom
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
- `npm test` — Vitest (`src/**/*.test.ts`). Pure unit tests always run; the
  `*.integration.test.ts` files need a real Postgres at `DATABASE_URL` and skip themselves
  otherwise. Never delete or weaken an existing test to make a change pass.
- `npx tsc --noEmit` — typecheck (run `rm -rf .next` first after switching branches).
- `npx prisma generate` — regenerate the Prisma client after schema changes (also runs
  automatically as `postinstall`).
- `npx prisma migrate dev --name <name>` — create/apply a migration during development.
  Production migrations must be expand → backfill → verify → switch; never
  `prisma migrate reset` or any destructive statement against production data.
- `npx prisma studio` — inspect the database.

`.npmrc` sets `legacy-peer-deps=true`; use plain `npm install`, not `npm ci` with strict
peer resolution.

## Environment variables

The full list the code reads is in README.md ("Configuration"). Required for local dev
(see `.env`, not committed): `DATABASE_URL` (Postgres), `NEXTAUTH_SECRET`, `NEXTAUTH_URL`,
plus the UploadThing credentials for uploads.

Other features read these when present (all fail soft/are optional at runtime):
- `REDIS_URL` / `REDIS_PUBLIC_URL` — rate limiting and caching (`src/lib/redis.ts`,
  `src/lib/rate-limit.ts`). Without Redis, an in-process limiter is used instead; limits
  are never skipped (they fail closed).
- `TRUSTED_PROXY_HOPS` — number of trusted reverse proxies in front of the app, used to
  pick the real client IP from `X-Forwarded-For` (rightmost trusted entry). Defaults to 1
  (Railway's edge). Never read the first XFF entry directly - it is client-controlled.
- `ALLOWED_MEDIA_HOSTS` — extra hosts accepted as post/chat media in addition to
  UploadThing and GIPHY (`src/lib/media-url.ts`).
- `LEGACY_PASSWORD_MIGRATION=off` — skips the boot-time plaintext→bcrypt password
  migration in `server.js` (only for a process that must not write, e.g. a replica).
- `SOLANA_RPC_URL` / `NEXT_PUBLIC_SOLANA_RPC_URL`, `SOLANA_PRIVATE_KEY`,
  `NEXT_PUBLIC_SOLANA_WALLET_ADDRESS` / `NEXT_PUBLIC_PLATFORM_WALLET`, `NEXT_PUBLIC_USDC_MINT` —
  Solana/USDC tipping, premium posts, withdrawals (`src/lib/solana.ts`, `src/contexts/SolanaContext.tsx`).
- `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` / `NEXT_PUBLIC_VAPID_PUBLIC_KEY` — Web Push.
- `RESEND_API_KEY` — transactional email via Resend (`src/lib/email.ts`).
- `GIPHY_API_KEY` — GIF search/trending endpoints.
- `CRON_SECRET` — auth for `/api/cron/*` endpoints (scheduled post publishing).
- `SENTRY_DSN` / `NEXT_PUBLIC_SENTRY_DSN` / `SENTRY_ORG` / `SENTRY_PROJECT` / `SENTRY_AUTH_TOKEN` —
  error tracking, wired in `next.config.js` via `withSentryConfig` and `src/sentry.*.config.ts`.
- `METERED_API_KEY` / `METERED_APP_NAME` — TURN credentials for WebRTC calls, issued
  server-side by `/api/turn-credentials` (never shipped to the client as env vars).
- `SOCKET_ALLOWED_ORIGINS` — comma-separated CORS origins for the Socket.IO server
  (falls back to `NEXTAUTH_URL`).
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
see `src/components/CallComponent.tsx` and `src/lib/socket-client.ts`).

The handshake verifies the NextAuth JWT from the cookie and checks the ban flag in the
database; `socket.data.userId` is the only identity ever used. Every relay is authorized
in `socket-authz.js` against the real DB record (sender/participant of the message, the
two parties of a placed call) and relays the stored row, never the client's payload.
Add new socket events following that pattern: identity → validate payload → verify
ownership/membership → rate limit → act → broadcast.

`server.js` also runs the legacy plaintext→bcrypt password migration
(`legacy-passwords.js`) automatically after `listen()` on every boot: a single COUNT when
the data is clean, batched in-place hashing otherwise. It never logs a password or hash.

### Auth (`src/lib/auth.ts`, `src/lib/auth-state.ts`, `src/lib/auth-guards.ts`, `src/middleware.ts`)

NextAuth with Credentials, Google and Apple providers, JWT session strategy (no DB
sessions table). `verifyCredentials()` accepts bcrypt hashes only — there is no plaintext
fallback (any legacy plaintext row is hashed in place by the boot-time migration above).
Login is blocked until `emailVerified` is set.

Privileged claims on the JWT (`isAdmin`, `role`, `plan`, `banned`) are snapshots. They are
overlaid from the database on every read via `getUserAuthState()` in `auth-state.ts`
(30 s per-instance cache); any route that changes a user's role, plan or ban must call
`invalidateUserAuthState(userId)`. A banned or deleted account gets no session at all
(the session callback returns null). Routes that read the raw JWT import
`getVerifiedToken as getToken` from `auth-guards.ts` — never `getToken` from
`next-auth/jwt` directly. Admin/moderator checks (`src/lib/admin.ts`) always read fresh
from the database; the JWT is identity proof only. Reusable request guards
(`requireAuthenticatedUser`, `requireActiveUser`, `requireAdmin`, `requireModerator`,
message/conversation membership and block checks) live in `auth-guards.ts`.

The JWT/session callbacks compute and cache a `FeatureStatus` object (see Plans below) on
the token so pages don't need a DB round trip to check plan features.

`src/middleware.ts` runs on nearly every route (see `config.matcher`) and: exempts NextAuth
internal routes and public auth pages; rate-limits login/register attempts; force-redirects
banned users to `/login?error=banned` (and clears their session cookies); force-redirects
users with `onboardingCompleted === false` to `/onboarding`; and gates `/settings/team`,
`/api/team`, `/settings/api-keys`, `/api/api-keys` behind plan features.

API routes that aren't covered by session auth (external integrations) use bearer-token
auth instead — see `src/lib/api-auth.ts` (`validateApiKey`, SHA-256-hashed keys; keys
always expire, 365 days by default and at most; a banned owner's keys are rejected) and
the `src/app/api/external/*` routes.

### Security conventions

- Client IP: always `getRequestIp(req)` / `getClientIpFromHeaders()` from
  `src/lib/rate-limit.ts` (trusted-proxy semantics). Rate limit with `rateLimit(req, …)`;
  the Redis path is atomic (INCR/EXPIRE).
- Media URLs on write (`/api/posts`, `/api/messages`): validate with `src/lib/media-url.ts`
  (UploadThing + GIPHY, https only). Only ZRP's own upload storage may be labelled `video`.
- Quotas that gate paid work (e.g. `/api/ai/chat`): reserve atomically before doing the
  work (`src/lib/ai-quota.ts` pattern: conditional `updateMany` with `< limit`), refund on
  provider failure. Never check-then-increment.
- Security headers live in `next.config.js`; the full CSP is Report-Only until its origin
  inventory has been validated against every flow. Don't promote it blindly.
- CI: Android release signing steps run only on `push` to main / `workflow_dispatch`,
  never on `pull_request`. Never regenerate the signing key.

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
`(auth)/login/page.tsx` is where login UI lives. `src/app/api/*` holds ~220 route handlers,
organized by resource, generally following: read the session (`getServerSession(authOptions)`
or `getVerifiedToken as getToken` from `@/lib/auth-guards`), load/mutate via `prisma`,
apply plan/feature checks from `lib/limits.ts` / `lib/permissions.ts` where relevant. `src/app/admin/*` is the moderation/ops UI (analytics, payments, posts, reports,
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
