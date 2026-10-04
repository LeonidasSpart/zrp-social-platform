# ZRP Social

> A safer, more private and human-centered social platform.

[![Website](https://img.shields.io/badge/Website-zrp.one-red?style=flat-square)](https://zrp.one)
[![Platform](https://img.shields.io/badge/Platform-Web%20%7C%20Android%20%7C%20iOS-black?style=flat-square)](https://zrp.one)
[![License](https://img.shields.io/badge/License-Proprietary-red?style=flat-square)](LICENSE)

**ZRP Social** is an independent Swiss/European social platform designed
around privacy, safety, freedom of expression, meaningful connections and a
more human digital experience.

ZRP brings social networking, messaging, short-form video, music, creator
tools, discovery, AI-assisted features and community support into one
connected platform, served to a web client and to native Android and iOS
clients from a single backend.

This repository contains the source of that platform. It is publicly
visible but **not open source**: see [Licence and intellectual property](#licence-and-intellectual-property).

---

## Contents

- [Why ZRP](#why-zrp)
- [Platforms](#platforms)
- [Core features](#core-features)
- [Messaging](#messaging)
- [ZRP Live](#zrp-live)
- [ZRP Launchpad](#zrp-launchpad)
- [ZRP Music](#zrp-music)
- [Creator Studio](#creator-studio)
- [ZRP AI](#zrp-ai)
- [ZRP News Network](#zrp-news-network)
- [ZRP Help](#zrp-help)
- [Opportunities](#opportunities)
- [Marketplace](#marketplace)
- [Geography, discovery and analytics](#geography-discovery-and-analytics)
- [Trust & Safety](#trust--safety)
- [Privacy](#privacy)
- [Authentication](#authentication)
- [Internationalization](#internationalization)
- [Technology stack](#technology-stack)
- [Architecture](#architecture)
- [Reliability & performance](#reliability--performance)
- [Development setup](#development-setup)
- [Project structure](#project-structure)
- [Testing](#testing)
- [Native applications](#native-applications)
- [Security principles](#security-principles)
- [Roadmap](#roadmap)
- [Repository status](#repository-status)
- [Versioning and releases](#versioning-and-releases)
- [Licence and intellectual property](#licence-and-intellectual-property)

---

## Why ZRP

Social media has become increasingly complex, invasive and fragmented.

ZRP is built around a different philosophy:

- Privacy is treated as a core product principle, not a settings page.
- Communities need meaningful safety tools, not just a report button.
- Users should have control over their content and their interactions.
- Creators should have professional tools without degrading the experience
  for everyone else.
- Social networking should feel human, not algorithmically overwhelming.
- One platform should bring people, creators, communities and content
  together.

ZRP is designed as a connected social ecosystem rather than another
single-purpose social application.

---

## Platforms

ZRP is developed as a multi-platform ecosystem sharing one backend:

- **Web application**: Next.js, the primary and most complete client.
- **Native Android application**: Kotlin / Jetpack Compose
  (`android-native/`), in active development.
- **Native iOS application**: Swift / SwiftUI (`ios-native/`), in active
  development.
- **Capacitor shells**: `android/` and `ios/`, which wrap the web
  application and are being superseded by the native clients.
- **Shared REST API**: `src/app/api/**`, consumed by every client.
- **Realtime service**: Socket.IO, hosted by the custom server in
  `server.js`.
- **PostgreSQL database**: accessed through Prisma.
- **Cloud media storage**: UploadThing.

The native clients call the same REST API the website calls. There is no
separate mobile backend and no parallel API contract.

---

## Core features

### Social networking

- Personalized home feed
- Following, followers and follow requests
- User profiles and private accounts
- Posts, comments, reposts and reactions
- Likes, bookmarks and post sharing
- Post view counts
- Polls
- Scheduled posts
- Hashtags and trending content
- People discovery and user search
- Notifications, including push notifications

### Stories

Temporary content with text, image and video stories, story views and
story likes, backed by real cloud uploads.

### Shorts

A dedicated short-form vertical video experience for discovering and
watching video content.

### Explore and discovery

Dedicated discovery surfaces for trending hashtags, suggested people,
trending content, search, explore feeds and hashtag feeds. Discovery reads
real platform data; there is no seeded or placeholder catalogue. The "For
You" feed and Trending also carry an opt-in country signal: see
[Geography, discovery and analytics](#geography-discovery-and-analytics).

**Advanced Search** (`GET /api/search`, `src/lib/search/`) covers eight
categories in one contract: people, posts, hashtags, communities, news,
music, opportunities and marketplace listings, each backed by a real
Prisma model (no fabricated entity), with filters, sort options and
cursor pagination. Web, Android and iOS were all rebuilt against this
same contract. See
[`docs/advanced-search-architecture.md`](docs/advanced-search-architecture.md)
for the category list, trigram-index approach and exact per-platform
status.

**ZRP Discover** (`/discover`, Web) is a separate, vertical swipeable
video feed in the style of a ranked short-form feed. It reuses the same
video `Post` rows Shorts already serves rather than a parallel content
type, and ranks them server-side (`GET /api/discover`,
`src/lib/discover/`) by a freshness-weighted engagement score with a
creator-repeat-limiting diversity pass, viewer-state gating (liked /
saved / reposted / followed, premium gating) and its own watch-signal
analytics (`DiscoverEvent`: impression/start/25/50/75/complete/skip).
See [docs/discover-backend.md](docs/discover-backend.md) for the full
architecture. This is currently Web-only; it has not shipped on Android
or iOS.

### Play

A challenge and duel experience with challenges, attempts, leaderboards,
achievements and player profiles.

### Communities and Lists

**Communities** are hashtag-driven topic feeds (Travel, Photography,
Nature, Technology, Health & Fitness, Art & Design, General) with
OWNER/ADMIN/MEMBER roles; a community's feed is the existing post feed
filtered to its own hashtag, not a parallel content system. **Lists**
are X-style curated lists of people, public or private, whose "feed" is
likewise the existing post feed filtered to the list's member accounts.
Both are available on Web, Android and iOS.

---

## Messaging

ZRP includes real-time communication built around privacy and user control:

- Direct messaging with persistent server-side history
- Real-time delivery over Socket.IO, with online and unread state
- Message reactions and media attachments (images, files, audio, video)
- Message notifications
- Peer-to-peer audio/video calling infrastructure (WebRTC, with TURN
  credentials issued server-side)
- Blocking, muting and conversation controls

Socket connections are authenticated against the user's session; the
socket server validates identity on the handshake rather than trusting a
client-supplied user id.

---

## ZRP Live

Real-time audio and video rooms, gated to an active paid plan
(pro/business/enterprise), implemented end-to-end on **Web, Android and
iOS**. Audio and video transport runs over [LiveKit](https://livekit.io)
(a self-hostable SFU): access tokens are minted server-side with
role-scoped grants (a listener's token never carries publish rights),
and every state transition: join, leave, promotion, moderation, room
end: is authorized and re-derived from Postgres on every request, never
trusted from the client. Every Live route fails closed with a `503` when
LiveKit's credentials are not configured, rather than issuing a fake
token.

### Live Audio and Live Video

Scheduled and instant rooms (Host / Moderator / Speaker-or-camera /
Listener-or-viewer roles), with speak/join requests, promote/demote/
mute/remove moderation actions, and room discovery filtered to public
rooms plus the caller's own community-visibility rooms. Live Video is a
parallel, separate room type (its own nav entry, discovery page and room
page) reusing Live Audio's authorization, LiveKit token-minting and
moderation code unchanged, adding one genuinely new axis: an
independently moderated camera (`isCameraOff`) alongside the mic. A room
ends through an explicit host/moderator action, a LiveKit webhook
reporting the room emptied, or a cron sweep that reclaims an abandoned
room after its participants disconnect or after a 24-hour hard cap. Live
Audio room reports integrate with the existing polymorphic `Report`/
`Appeal` system (one of its eight target types); Live Video does not yet
have its own report target (a host can still be reported via the
existing bare-profile report flow).

**Platform status**: implemented on **Web/PWA** (`/live-audio`,
`/live-video`), **Android** and **iOS**, each with the full
create/join/moderate flow. See
[`docs/live-audio-architecture.md`](docs/live-audio-architecture.md) and
[`docs/live-video-architecture.md`](docs/live-video-architecture.md) for
the full design, authorization matrix and known limitations (no numeric
speaker cap, no scheduled-cleanup cron wired up yet).

### Gifts, chat, reactions, reminders and replay

A shared engagement layer behind both Live Audio and Live Video rooms,
implemented on Web, Android and iOS:

- **Gifts**: an admin-defined `GiftDefinition` catalogue, a per-user
  coin wallet (`CoinWallet`), and server-authoritative, idempotent gift
  sends (`LiveGiftTransaction`) that debit the sender and credit the
  recipient's `CreatorProfile` through the same platform-fee/charity-
  split rail `Tip` already uses. Coins are purchased with real on-chain
  USDC (verified the same way a `Tip` is) at a fixed peg; **there is no
  in-app coin-purchase flow on Android or iOS** (real-money top-up is
  refused server-side for native clients, per store payment policy - see
  [Payments in the native apps](#payments-in-the-native-apps)), so coins
  can only be bought today through the existing Web Solana flow. Gift
  display names are derived client-side from an admin-set `key` slug
  (e.g. `fire_heart` → "Fire heart"); there is no admin-seeded
  name/translation table yet, so a gift's name is not localized.
- **Chat**: persisted, moderated room chat with delete, mute and
  slow-mode, broadcast over the room's existing Socket.IO channel.
- **Reactions**: rate-limited, batched tap reactions broadcast to every
  viewer.
- **Scheduled-room reminders**: "Remind me" on a scheduled room, pushed
  as a notification when the room goes live.
- **Replay/recording**: real [LiveKit Egress](https://docs.livekit.io/home/egress/overview/)
  integration (`src/lib/live-replay/`) - not a mock - that fails closed
  with `503 replay_not_configured` because this deployment has no S3,
  GCS or Azure bucket configured for Egress to upload to. The
  start/stop-recording controls and replay-list UI are fully built on
  every client; recordings will work as soon as
  `LIVEKIT_EGRESS_S3_BUCKET`/`_REGION`/`_ACCESS_KEY`/`_SECRET` (and
  optionally `_ENDPOINT`) are configured, with no further code changes.

---

## ZRP Launchpad

**ZRP Launchpad** (`/launchpad`, `src/lib/launchpad/`,
`src/app/api/launchpad/**`) is ZRP's own token-creation and DeFi
surface on Solana. It is **ZRP-native**: the protocol ZRP uses to create
and trade its own tokens is the **ZRP Launch Program**, a program ZRP
wrote and controls - not Pump.fun, and not Raydium. Pump.fun and
Raydium are separate, third-party protocols ZRP's client code also
integrates with for specific, narrower purposes described below.

### ZRP Launch Program (the ZRP-native bonding curve)

`programs/zrp-launchpad/` is an [Anchor](https://www.anchor-lang.com/)
(Rust) program with six instructions: `initialize`/`update_config`
(admin `GlobalConfig`: fee rates, migration authority, graduation
target), `create_and_buy` (creates a new mint plus its `BondingCurve`
account and an initial buy, one signature), `buy`/`sell` (virtual-
reserve bonding-curve trades with a caller-supplied minimum-out
slippage bound), and `graduate` (once the curve's real SOL reserves
cross its configured graduation target, sweeps the curve's reserves to
the migration authority). Program ID (devnet):
`3vr1SHa9LvEvELb23NBG1J6oFRCSDs8cj8wS55zuoRxK` (from
[`Anchor.toml`](Anchor.toml); never treat any other ID as real). There
is **no mainnet deployment yet** - see **Deployment status** below.

The server never trusts a client-reported trade or balance: every price,
curve-progress and graduation figure is read live from the program's own
on-chain `GlobalConfig`/`BondingCurve` accounts or decoded from a
confirmed transaction's own Anchor events
(`src/lib/launchpad/zrp-launch-service.ts`), the same "client interfaces
are never the authority for financial state" rule applied everywhere
else money moves in this codebase. An acceptance test
(`tests/zrp-launchpad.ts`, `scripts/verify-zrp-launchpad.ts`) asserts
that no transaction this program produces ever invokes Pump.fun's real
mainnet program ID - this program is not, and does not depend on,
Pump.fun.

**Known limitation**: post-graduation Raydium liquidity is **not yet
automatic**. `graduate()` sweeps real SOL/tokens to the migration
authority, but ZRP does not yet auto-seed a Raydium pool from them;
creating that pool today requires the existing manual pool-creation
routes below. See
[`docs/zrp-launchpad-deployment.md`](docs/zrp-launchpad-deployment.md#known-limitation-post-graduation-raydium-liquidity-is-not-yet-automatic).

### Token creation

Two paths exist. **`/launchpad/create/zrp`** creates a token through the
ZRP Launch Program above (bonding-curve pricing from the first buy).
**`/launchpad/create`** mints a plain SPL token (fixed supply, Metaplex
metadata, no bonding curve) for a flat USDC fee, charged and minted in
one atomic, wallet-signed transaction; a token-template selector
(`src/lib/launchpad/token-templates.ts`) pre-fills common configurations.
A token created either way can then get real, immediately tradable
liquidity via the Raydium integration below without waiting on
bonding-curve graduation.

### Liquidity: Raydium CPMM

ZRP integrates with [Raydium's](https://raydium.io) existing, audited
CPMM program as the **liquidity venue** - not as ZRP's launch protocol.
`src/lib/launchpad/raydium-pool-service.ts`/`cpmm-keys.ts`/
`client-liquidity.ts`/`pool-liquidity-reader.ts` cover real, wallet-
signed pool creation, add/remove liquidity and LP-token burn, each
independently verified on-chain after signing rather than trusted from
the client's own report.

### Trading existing Pump.fun tokens (read/trade integration, not ZRP's creation protocol)

Separately, ZRP can **discover and trade tokens that already exist on
Pump.fun** - a third-party protocol ZRP does not create tokens on and
does not depend on for its own launch flow. Built on Pump.fun's own
official, actively-maintained `@pump-fun/pump-sdk` /
`@pump-fun/pump-swap-sdk` packages (`src/lib/launchpad/pump-curve-*.ts`,
`pumpswap-pool-service.ts`), this covers live bonding-curve reads,
independent buy/sell/graduation verification, and post-graduation
PumpSwap pool detection for **existing** classic SOL-quoted Pump.fun
curves only (mayhem-mode, holder-reward and other curve variants are
detected and reported as unsupported rather than mis-read). A
wallet-signed flow to **create** a new token directly on Pump.fun was
built at one point, then **deliberately deleted** once the ZRP Launch
Program above existed, so that ZRP's UI could not mint a Pump.fun token
through any path - see
[`docs/launchpad-bonding-curve-research.md`](docs/launchpad-bonding-curve-research.md)
for the trading integration's scope and reasoning. ZRP's own
token-creation path is the ZRP Launch Program above, never Pump.fun.

### Broader Launchpad modules

Also implemented, server-authoritative and independently chain-verified
where they touch real funds: a DAO governance module (proposals and
voting), NFT creation and NFT staking, token staking pools, vesting
schedules, liquidity farming pools, a non-custodial Jupiter DEX-
aggregator swap, wallet-native on-chain-verified token airdrops, a
token scanner, and discovery/analytics surfaces (price, volume,
holders, liquidity, trending) backed by a periodic `AnalyticsSnapshot`
indexer. An admin dashboard (`/admin/launchpad`) surfaces the same data
for operators.

### Platform capability matrix

`src/lib/launchpad/capability-matrix.ts` is the single source of truth
for what is implemented, technically feasible and store-distributable
per platform, grounded in Apple/Google's actual current policy text
(cited inline in that file):

- **Web/PWA**: full implementation - every feature above.
- **Android**: a non-custodial Solana **foundation** is implemented and
  unit-tested (`android-native/.../solana/`, `.../launchpad/`): Base58,
  Ed25519/PDA derivation, ZRP Launch Program PDA derivation, curve math,
  a transaction compiler and a wallet connector, cross-checked against
  this repository's own web (`@solana/web3.js`) implementation's output.
  **No Launchpad screens are wired up to it yet** - trading would also
  require a non-custodial Solana Mobile Wallet Adapter flow and a Play
  Console financial-features declaration before shipping, independent
  of code.
- **iOS/iPadOS**: **not started** - no Solana or Launchpad code exists
  in `ios-native/` today. Native bonding-curve trading is additionally
  blocked outright by Apple's crypto-unlock (3.1.1) and exchange-
  licensing (3.1.5(iii)) guidelines; a native build would deep-link
  trading/creation out to Web/PWA rather than build in-app signing for
  it.

### Deployment status

Devnet deploys automatically on every push to `main` that touches
`programs/**`, with a real on-chain smoke test after
(create → buy → sell → graduation). **Mainnet deployment is manual-only**
(`workflow_dispatch` with a typed confirmation phrase) and **has not
been run** - there is no mainnet program ID anywhere in this repository,
and the application fails closed in production (refuses to start)
rather than silently falling back to the devnet program ID or devnet
RPC if `ZRP_LAUNCH_PROGRAM_ID`/`NEXT_PUBLIC_SOLANA_RPC_URL` are left
unset. Full procedure, required secrets and the exact mainnet checklist:
[`docs/zrp-launchpad-deployment.md`](docs/zrp-launchpad-deployment.md).

---

## ZRP Music

**ZRP Music** is a music experience integrated directly into ZRP Social,
backed by the same database and media infrastructure as the rest of the
platform.

It covers:

- Artist profiles, albums and tracks
- Playlists, likes, artist follows and listening history
- Playback with queue, shuffle and repeat
- Music discovery and library surfaces
- A Music Studio for publishing and managing tracks and albums
- Cloud audio and artwork storage through a dedicated UploadThing route

Music data is stored through the ZRP backend using Prisma/PostgreSQL.
There is no seeded or mock catalogue; the catalogue is whatever artists
have actually published.

---

## Creator Studio

Creator tooling is served from the same backend as the rest of the
platform:

- Creator profiles and a creator dashboard
- Analytics and audience insights
- Content management and creator content controls
- Music artist capabilities
- Tips, premium posts and withdrawal requests

Some monetization surfaces are deliberately restricted inside the native
apps: see [Payments in the native apps](#payments-in-the-native-apps).

---

## ZRP AI

ZRP includes an in-platform AI assistant with persistent conversations and
message history stored in the ZRP database.

The assistant is served through an OpenAI-compatible client pointed at the
DeepSeek API, configured at runtime. Usage is metered per account: daily
message counts and per-response token limits vary by plan, and are enforced
server-side.

---

## ZRP News Network

An automated editorial system that publishes concise original news
summaries through openly-labelled ZRP news desks: ZRP News World, ZRP
News Switzerland, ZRP Travel and so on.

Each desk is a normal ZRP account flagged as an editorial feed, so news
posts can be followed, liked, commented on, reposted, reported and
moderated exactly like any other post. None of them impersonates a
person: they are named as ZRP desks, they say in their own bios that they
are automated, they carry a distinct editorial badge, and they have no
password, so no sign-in flow can authenticate as one.

The pipeline polls publishers' own syndication feeds (obeying robots.txt,
using conditional GETs, backing off on failure), collapses the same event
reported by several outlets into one story with several attributions,
writes an original summary (never a copy of an article) and publishes
it with the source named and linked. Travel news is produced natively in
English, French, German and Italian.

Nothing is ever invented: every generated summary is validated against
the source material for unsupported figures, fabricated quotations and
model-written links, and a summary that fails is discarded rather than
published. A cycle with no qualifying news publishes nothing.

Administrators control the system from `/admin/news-network`: pause and
resume, enable feeds and sources one at a time, inspect the source
material behind every summary, publish corrections, and take posts down.

Full documentation, including pilot activation steps, is in
[`docs/zrp-news-network.md`](docs/zrp-news-network.md).

---

## ZRP Help

ZRP Help is a community support layer inside the platform. It allows users
and communities to discover assistance campaigns, contribute to them, offer
help, report inappropriate campaign content, and request withdrawals for a
campaign.

---

## Opportunities

An opportunity ecosystem connecting users with professional and
career-related listings: opportunity discovery, applications, saved
listings, professional profiles, and the employer-side workflows behind
them.

---

## Marketplace

A marketplace for discovering listings and connecting users directly:
listings and listing details, discovery, favourites, seller listing
management, and direct messaging between buyer and seller.

**ZRP does not process marketplace payments.** Prices on a listing are
informational; transactions are completed directly between users,
off-platform.

---

## Geography, discovery and analytics

- **Country normalization.** A user's free-text country is normalized to
  a canonical ISO 3166-1 alpha-2 `countryCode` (exact, case/diacritic-
  insensitive matching only: never a fuzzy guess), used consistently for
  ad targeting, feed ranking and "people near you".
- **Signup geography and acquisition, tracked immutably.** At
  registration, `signupCountryCode` (from a local, in-process IP lookup:
  no raw IP is ever stored) and `signupSource` (`DIRECT` / `REFERRAL` /
  `CAMPAIGN`, computed from `ref`/`utm_*` parameters, never guessed as
  "organic") are set once and never rewritten by a later profile edit, so
  acquisition history stays accurate even if a user later changes their
  declared country.
- **Feed geo-boost.** `GET /api/posts/explore` ("For You") applies a
  small multiplicative boost when the viewer and a post's author share a
  known country: additive only, never a filter, and never applied to
  global Trending.
- **Opt-in national trending.** `GET /api/posts/explore?scope=national`
  filters Trending to the viewer's own country, falling back to the
  global pool (with an honest `scopeFallback` flag) when too few national
  candidates exist, rather than presenting a thin result as complete.
  This is a real, tested API parameter with **no UI switch on any
  platform yet**: the same honest scope boundary as the people/business
  discovery endpoint below.
- **People and businesses near you** (`GET /api/discover/people`,
  authenticated only): a working, tested backend endpoint filtered to the
  viewer's own country. **It has no frontend UI yet on any platform**:
  a deliberate scope boundary, not an oversight.
- **Professional profile fields**: `headline`, `company`, `position` and
  `skills`, editable from Settings on Web, Android and iOS, alongside the
  platform's existing industry-category taxonomy.
- **Admin analytics** (`/admin/analytics` on Web, with equivalent screens
  on Android and iOS, all admin-gated): aggregate, range-filtered
  breakdowns by country, acquisition source, signup platform and language
  preference. Any bucket with fewer than 3 users is folded into "Other"
  rather than shown individually, and no per-user row (email, name, IP)
  is ever included.

No raw IP address is ever persisted, and no individual's geography is
ever shown to another ordinary user beyond "we share the same declared
country". Full detail, including exactly which analytics are and are not
range-filtered and why: [`docs/user-geography-and-acquisition.md`](docs/user-geography-and-acquisition.md).

---

## Trust & Safety

Safety is part of the platform architecture rather than a layer on top of
it:

- User blocking and muting
- Content reporting across posts, comments, profiles, campaigns and
  listings
- Moderation workflows, moderator and admin roles, and an admin reports
  surface
- An appeals process for moderation decisions
- An audit log for administrative actions
- Trust Passport: a per-profile trust signal, separate from identity
  verification and from follower count
- A public transparency surface reporting moderation volumes and outcomes
- Rate limiting and abuse prevention on sensitive endpoints

---

## Privacy

- User-controlled privacy settings and private accounts
- Blocking and muting
- Server-side authorization on every protected route
- Session and authentication controls
- Content sanitization of user-authored HTML at write time
- SSRF-guarded link previews

### Account deletion

Requesting deletion schedules the account for removal **30 days** later,
and the request can be cancelled during that window by requesting deletion
again. On confirmed deletion the platform collects every media file the
account owns (post images, comment images, message media, stories, music
tracks, albums, artist artwork, playlist covers, marketplace listing media
and campaign media), deletes those files from cloud storage, and then
removes the user record, which cascades the associated database rows.

---

## Authentication

- Email/username and password authentication (bcrypt-hashed credentials)
- Email verification and resend
- Password reset by emailed link
- Google Sign-In
- Sign in with Apple, including native Apple authentication on iOS with
  server-side token verification
- JWT sessions issued by NextAuth
- A dedicated mobile login endpoint that returns the same session cookie
  the browser uses, so every existing route serves a native client
  unmodified
- Rate limiting on credential authentication

Authorization is enforced server-side on every protected route.
Middleware additionally handles the global banned-account check,
onboarding gating and plan-gated routes.

---

## Internationalization

The interface ships human translations for **39 languages**, verified in
source (`src/lib/translations.ts`) and present with full key parity
across Web, `android-native/` (`values-*/strings.xml`) and `ios-native/`
(`*.lproj`):

English, French, German, Italian, Albanian, Spanish, Russian, Arabic,
Chinese, Turkish, Bahasa Indonesia, Portuguese (European Portuguese
usage), Japanese, Korean, Hindi, Dutch, Polish, Romanian, Czech,
Hungarian, Swedish, Danish, Croatian, Bulgarian, Greek, Norwegian,
Serbian (Latin script), Bosnian, Macedonian, Ukrainian, Finnish, Slovak,
Slovenian, Lithuanian, Estonian, Irish, Latvian, Maltese and Romansh
(Rumantsch Grischun).

The most recent expansion (Romansh, `rm`) shipped on Web and Android
with full key parity, and on iOS with full parity on every key sourced
from the shared web dictionary (1,201 keys, verified by
`ios-native/Tools/generate-localizations.py --check`). iOS also has a
small set of iOS-only strings with no web counterpart (mostly
VoiceOver/accessibility labels, 166 keys,
`ios-native/Tools/ios-extra-strings.json`); these are translated into
all 38 non-English languages, with completeness enforced by the same
`--check` step; see
[`ios-native/PARITY.md`](ios-native/PARITY.md#ios-localization-roadmap-39-language-parity)
for the verification detail. Romansh is the one exception in the
otherwise-unrelated `i18n-iso-countries` package used for ZRP Global
Ambassadors' country-name localization (`src/lib/ambassadors/countries.ts`):
that third-party package has no Romansh locale data at all, so country
names fall back to English there rather than being silently blank - see
that file's `resolvableLocale()` for the detail.

Arabic is rendered right-to-left. The web dictionary in
`src/lib/translations.ts` is the single source of truth: the iOS
`.strings` bundles and localization key enum are generated from it
(`ios-native/Tools/generate-localizations.py`, checked in CI with
`--check`), so a native string cannot drift from the web copy. Android's
`values*/strings.xml` are maintained directly, checked for key parity,
empty values and untranslated English leftovers by a dedicated JVM test
(`LocalizationCompletenessTest.kt`) and an equivalent web test
(`translations-completeness.test.ts`), both run in CI. Where a
native-only string has no web counterpart (mostly accessibility labels),
it falls back to English rather than being machine-translated.

---

## Technology stack

### Web

Next.js 15 · React 18 · TypeScript · Tailwind CSS · Framer Motion ·
Lucide · Recharts

### Backend

Node.js · Next.js API routes · custom Socket.IO server (`server.js`) ·
Prisma · PostgreSQL · Redis · Firebase Admin (FCM) · web-push · Resend ·
Nodemailer

### Authentication and security

NextAuth · Google · Sign in with Apple · bcrypt · sanitize-html ·
Redis-backed rate limiting · SSRF guard · Sentry

### Realtime audio/video

LiveKit (`livekit-server-sdk`, `livekit-client`, plus LiveKit's native
Android and iOS SDKs): the SFU media transport and recording (Egress)
backend behind ZRP Live (see [ZRP Live](#zrp-live)).

### Media

UploadThing · Sharp · file-type

### AI

DeepSeek, accessed through the OpenAI-compatible SDK

### Blockchain

Solana (`@solana/web3.js`, `@solana/spl-token`) with USDC support, used for
tips, premium-post purchases, Help contributions, plan upgrade requests,
creator/campaign withdrawal approvals, and ZRP Live coin purchases. On-chain
transactions are verified independently server-side. This functionality is
maintained separately from the core social experience and can evolve
independently.

**ZRP Launchpad** (see [ZRP Launchpad](#zrp-launchpad)) adds: an
[Anchor](https://www.anchor-lang.com/)/Rust program
(`programs/zrp-launchpad/`, the ZRP Launch Program) for ZRP-native token
creation and bonding-curve trading; the official `@pump-fun/pump-sdk` /
`@pump-fun/pump-swap-sdk` for reading and trading **existing** third-party
Pump.fun tokens; `@raydium-io/raydium-sdk-v2` for CPMM liquidity pools; and
Jupiter's aggregator API for non-custodial DEX swaps.

### Native

Kotlin · Jetpack Compose · Android SDK · Media3 · Swift · SwiftUI ·
WebRTC · Capacitor

---

## Architecture

At a high level, ZRP is one backend serving several clients:

```text
                         ┌─────────────────────┐
                         │      ZRP Social     │
                         │       Clients       │
                         └──────────┬──────────┘
                                    │
              ┌─────────────────────┼─────────────────────┐
              │                     │                     │
              ▼                     ▼                     ▼
       ┌─────────────┐       ┌─────────────┐       ┌─────────────┐
       │     Web     │       │   Android   │       │     iOS     │
       │   Next.js   │       │   Native    │       │   Native    │
       └──────┬──────┘       └──────┬──────┘       └──────┬──────┘
              │                     │                     │
              └─────────────────────┼─────────────────────┘
                                    │
                                    ▼
                         ┌─────────────────────┐
                         │     ZRP Backend     │
                         │  REST API + Socket  │
                         └──────────┬──────────┘
                                    │
              ┌─────────────────────┼─────────────────────┐
              │                     │                     │
              ▼                     ▼                     ▼
       ┌─────────────┐       ┌─────────────┐       ┌─────────────┐
       │ PostgreSQL  │       │    Redis    │       │ UploadThing │
       │   Prisma    │       │ Rate limits │       │    Media    │
       └─────────────┘       └─────────────┘       └─────────────┘
```

The process entrypoint is `server.js`, a custom Node server that hosts the
Next.js request handler and the Socket.IO server on one port, so realtime
and HTTP share a single deployment.

---

## Reliability & performance

Backend reliability work, driven by a real, reproduced production
symptom (intermittent "timeout" errors when navigating between pages):

- **Node HTTP keep-alive tuning.** `server.js` raises the raw HTTP
  server's `keepAliveTimeout`/`headersTimeout` (65s/66s) above Node's
  5-second default. Behind a reverse proxy whose own idle timeout is
  longer than that: Railway's edge included, and a well-documented
  failure class for Node behind any proxy: the origin could otherwise
  silently close a connection the proxy still considers reusable, and
  the next request sent down that stale socket would hang.
- **Bounded PostgreSQL operations.** The Prisma `pg` driver adapter sets
  `connectionTimeoutMillis` (5s, since `pg` has no default connection
  timeout at all) and `statement_timeout`/`query_timeout` (10s each), so
  a stuck query fails fast and releases its pool slot instead of holding
  it indefinitely under lock contention or an expensive plan.
- **Bounded Redis operations.** `src/lib/redis.ts` wraps every cache
  command in a 300ms timeout, so a "ready but slow" Redis falls back to
  Postgres within the request's budget instead of hanging. A connection
  error no longer permanently disables Redis for the process's lifetime
  (a real prior bug): the client is kept and allowed to self-heal via
  node-redis's own reconnect strategy, with only the very first,
  never-yet-connected attempt bounded (8s) so a Redis that is unreachable
  from boot cannot hang every caller application-wide.
- **Explore request-path optimization.** `GET /api/posts/explore` now
  only performs its (real) country lookup when the request actually needs
  it: national-scope Trending: skipping it entirely on a cache hit or
  on global Trending, and runs the independent like/poll-vote lookups
  concurrently instead of sequentially.

These are bounded timeouts and targeted request-path fixes for a
diagnosed failure class, not a claim that every possible backend hang has
been eliminated or exhaustively verified under production load.

---

## Development setup

### Requirements

- Node.js 20 or newer (CI builds on Node 22)
- A PostgreSQL database
- A Redis instance (rate limiting degrades to a per-instance in-process
  limiter when Redis is unavailable, which is a fallback, not a
  substitute)

### Install and run

```bash
npm install          # runs `prisma generate` via postinstall
npx prisma migrate deploy
npm run dev          # starts server.js (Next.js + Socket.IO)
```

### Scripts

| Script | Purpose |
| --- | --- |
| `npm run dev` | Development server (`server.js`) |
| `npm run build` | Next.js production build |
| `npm start` | Production server |
| `npm run lint` | ESLint via `next lint` |
| `npm test` | Vitest suite |
| `npm run anchor:test` | ZRP Launch Program's Anchor test suite (`tests/zrp-launchpad.ts`), against a local validator |
| `npm run launchpad:verify` | Real on-chain verification of a deployed ZRP Launch Program (`scripts/verify-zrp-launchpad.ts`) |

### Configuration

All configuration is supplied through environment variables at runtime;
no secret is committed to this repository. The variables the code reads
include:

- **Database and cache**: `DATABASE_URL`, `REDIS_URL`,
  `REDIS_PUBLIC_URL`
- **Auth**: `NEXTAUTH_URL`, `NEXTAUTH_SECRET`, `GOOGLE_CLIENT_ID`,
  `GOOGLE_CLIENT_SECRET`, `GOOGLE_MOBILE_CLIENT_ID` (required for native
  Android Google Sign-In specifically; see
  `src/app/api/mobile/auth/google/route.ts`; a separate Web-type OAuth
  client from `GOOGLE_CLIENT_ID`, created in the same Google Cloud
  project as the Android app's registered OAuth clients, because
  Android's Credential Manager `serverClientId` must live in that same
  project. Without it, every native Google Sign-In attempt fails
  server-side ID token verification with an audience mismatch, even
  though `GOOGLE_CLIENT_ID`/web Google login work fine), `APPLE_CLIENT_ID`,
  `APPLE_TEAM_ID`, `APPLE_KEY_ID`, `APPLE_PRIVATE_KEY`,
  `APPLE_NATIVE_CLIENT_ID`
- **Email**: `RESEND_API_KEY`, `EMAIL_FROM`
- **Push**: `FIREBASE_SERVICE_ACCOUNT_JSON`, `VAPID_PUBLIC_KEY`,
  `VAPID_PRIVATE_KEY`, `NEXT_PUBLIC_VAPID_PUBLIC_KEY`
- **iOS push (APNs)**: `APNS_KEY_ID`, `APNS_TEAM_ID`, `APNS_BUNDLE_ID`,
  `APNS_PRIVATE_KEY` (a `.p8` provider auth key's contents; `\n` in the
  env var is unescaped to real newlines), `APNS_ENVIRONMENT` (`development`
  or `production`, defaults to `development`) - all optional and used
  together by `src/lib/apns.ts` to deliver both ordinary alert pushes and
  PushKit VoIP pushes directly to Apple, bypassing Firebase entirely (see
  that file's doc comment for why). Unset means iOS push is skipped;
  Android (FCM) and Web Push are unaffected either way.
- **AI**: `DEEPSEEK_API_KEY`
- **Realtime and calling**: `SOCKET_ALLOWED_ORIGINS`, `METERED_API_KEY`,
  `METERED_APP_NAME`, `INTERNAL_PUSH_SECRET` (optional; a shared secret
  `server.js` uses to authenticate its own loopback call to
  `/api/internal/call-push` so a backgrounded/minimized recipient still
  gets a real push notification for an incoming voice/video call, not
  just the in-page Socket.IO event; unset means that push is skipped,
  the call itself is unaffected)
- **Blockchain**: `SOLANA_RPC_URL`, `NEXT_PUBLIC_SOLANA_RPC_URL`,
  `SOLANA_WALLET_ADDRESS`, `SOLANA_PRIVATE_KEY`, `NEXT_PUBLIC_USDC_MINT`
- **ZRP Launchpad (ZRP-native bonding-curve program)**: `ZRP_LAUNCH_PROGRAM_ID` /
  `NEXT_PUBLIC_ZRP_LAUNCH_PROGRAM_ID` - the deployed program ID for
  `programs/zrp-launchpad/`. **Required in production** once a non-devnet
  deploy exists: both `src/lib/launchpad/zrp-launch-keys.ts` and
  `src/lib/solana-client.ts`'s RPC resolution fail closed (throw rather than
  silently defaulting to the devnet program ID / devnet RPC) when
  `NODE_ENV=production` and the corresponding var is unset. See
  `docs/zrp-launchpad-deployment.md` for the full devnet→mainnet cutover
  procedure.
- **Live Audio (SFU)**: `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET` (paired
  credential for `livekit-server-sdk`; mints room access tokens and
  verifies webhooks locally, no network call required; never sent to any
  client), `LIVEKIT_URL` (the LiveKit server's WebSocket URL, given to
  clients so they know where to connect; not secret), `LIVEKIT_WEBHOOK_API_KEY`
  / `LIVEKIT_WEBHOOK_API_SECRET` (optional; only needed if the LiveKit
  webhook is signed with a different key/secret pair than the main one:
  defaults to `LIVEKIT_API_KEY`/`LIVEKIT_API_SECRET` when unset). Every
  Live Audio/Live Video route fails closed with a `503` when these are
  unset rather than faking a token; see `docs/live-audio-architecture.md`.
- **Live replay/recording (LiveKit Egress)**: `LIVEKIT_EGRESS_S3_BUCKET`,
  `LIVEKIT_EGRESS_S3_REGION`, `LIVEKIT_EGRESS_S3_ACCESS_KEY`,
  `LIVEKIT_EGRESS_S3_SECRET` (optionally `LIVEKIT_EGRESS_S3_ENDPOINT` for
  an S3-compatible provider other than AWS): the cloud bucket LiveKit's
  Egress service uploads a room recording to. **Unset in this
  deployment today**, so every replay/recording route answers `503
  replay_not_configured`; the start/stop-recording and replay-list UI on
  every client is fully built and needs no code change once these are
  set. See [Gifts, chat, reactions, reminders and replay](#gifts-chat-reactions-reminders-and-replay).
- **Observability and misc**: `SENTRY_DSN`, `NEXT_PUBLIC_SENTRY_DSN`,
  `CRON_SECRET`, `GIPHY_API_KEY`
- **Security tuning (optional)**: `TRUSTED_PROXY_HOPS` (number of
  trusted reverse proxies in front of the app for client-IP resolution;
  defaults to `1`, Railway's edge; only change it if another trusted
  proxy/CDN is placed in front), `ALLOWED_MEDIA_HOSTS` (comma-separated
  extra hosts, exact or `.suffix`, accepted as post media in addition to
  UploadThing and GIPHY), `LEGACY_PASSWORD_MIGRATION=off` (skips the
  automatic boot-time plaintext-to-bcrypt password migration `server.js`
  runs after listening; leave unset in production)

Behaviour that depends on an unset variable degrades rather than crashing
where the code allows it: for example, the Apple provider is registered
only when its credentials are present.

---

## Project structure

```text
zrp-social-platform/
├── src/
│   ├── app/               Next.js App Router
│   │   ├── api/           Shared REST API consumed by every client
│   │   └── ...            Web pages (feed, messages, music, shorts, …)
│   ├── components/        React components
│   ├── contexts/          Theme, language and session context
│   ├── hooks/             Shared React hooks
│   ├── lib/               Server and shared logic (auth, db, rate limit,
│   │                      sanitize, ssrf-guard, translations, music, …)
│   ├── types/             Shared TypeScript types
│   └── middleware.ts      Auth, banned-user and plan-gate middleware
├── prisma/
│   ├── schema.prisma      PostgreSQL schema
│   └── migrations/        Applied migrations
├── android-native/        Native Kotlin / Jetpack Compose Android app
├── ios-native/            Native Swift / SwiftUI iOS app
├── android/, ios/         Capacitor WebView shells
├── public/                Static assets, PWA manifest, service worker
├── server.js              Node entrypoint: Next.js + Socket.IO
└── .github/workflows/     Android and iOS build pipelines
```

---

## Testing

Tests run under [Vitest](https://vitest.dev) in a Node environment:

```bash
npm test
```

The suite covers pure logic in `src/lib/` (rate limiting, SSRF guarding,
HTML sanitization, money maths, scheduled-post time handling, Apple client
secret and identity-token handling, wallet linking, FCM, link-preview
parsing) and API route behaviour under `src/app/api/**/__tests__/`.

Files marked `*.integration.test.ts` talk to a live PostgreSQL instance
through `DATABASE_URL`. Test files run sequentially
(`fileParallelism: false`) because the integration suites share one
database and one Prisma client.

The native modules have their own checks, run in CI: the iOS module
validates generated localizations and source conventions before
`xcodebuild` compiles Debug and Release on macOS, and the Android modules
build through Gradle on GitHub-hosted runners.

The ZRP Launch Program (`programs/zrp-launchpad/`) has its own pipeline,
`.github/workflows/solana-program-ci.yml`: `anchor build` plus the full
`npm run anchor:test` suite (`tests/zrp-launchpad.ts`) against a fresh
local validator on every PR and push to `main`, then an automatic devnet
deploy and a real on-chain smoke test (create → buy → sell → graduation).
Mainnet deploy is a separate, manual-only job - see
[ZRP Launchpad](#zrp-launchpad).

---

## Native applications

Both native applications are **in active development**. They are not
described here as released products, and nothing in this repository
represents an approved App Store or Google Play listing.

### Android

`android-native/` is a Kotlin / Jetpack Compose application
(`one.zrp.social`, minSdk 24, targetSdk 36) that is replacing the
Capacitor WebView shell in `android/`. It uses AndroidX and Material 3,
Navigation Compose, Media3, Coil, WebRTC, LiveKit's Android SDK (Live
Audio and Live Video), Firebase Cloud Messaging, Google Credential
Manager, and EncryptedSharedPreferences for session storage.

It ships full Live Audio and Live Video client screens (rooms, roles,
moderation, and the gifts/chat/reactions/reminders/replay engagement
layer) against the backend contract described in
[ZRP Live](#zrp-live). It also has a non-custodial Solana **foundation**
(`.../solana/`, `.../launchpad/`: Base58, Ed25519/PDA derivation, the ZRP
Launch Program's own PDA derivation, curve math, a transaction compiler
and a wallet connector) with its own unit tests, but **no ZRP Launchpad
screens built on top of it yet** - see
[Platform capability matrix](#platform-capability-matrix).

Its CI workflow builds a debug APK on every change and a release App
Bundle on demand. The native module has no Play Store listing of its own
yet and is for internal testing until feature parity is reached. The
Capacitor shell continues to build through its own separate workflow, and
produces a signed `.aab` only when the real upload keystore is present as
repository secrets.

### iOS

`ios-native/` is a Swift / SwiftUI application targeting iOS 17, built in
Xcode 16. Its architecture is one-directional
(`View → ViewModel → Repository → ApiClient → backend`); sessions are
stored in the Keychain, and Sign in with Apple is native and verified
server-side. It has exactly two third-party dependencies, both added for
real-time media: LiveKit's Swift SDK (Live Audio and Live Video) and
`stasel/WebRTC` (1:1 voice/video calling); everything else is Apple
frameworks.

It ships full Live Audio and Live Video client screens, including the
gifts/chat/reactions/reminders/replay engagement layer - see
[ZRP Live](#zrp-live). It has **no ZRP Launchpad implementation at
all**: no Solana code exists in `ios-native/` today, and native
bonding-curve trading is additionally blocked by Apple's crypto/exchange
policy regardless - see
[Platform capability matrix](#platform-capability-matrix).

Feature-by-feature status against the backend, the web app and the Android
app is tracked in [`ios-native/PARITY.md`](ios-native/PARITY.md), which
records what is implemented, what is partial, what is missing and what is
blocked on a backend capability that does not exist yet. A screen existing
is not counted there as implementation.

### Payments in the native apps

Certain crypto-payment surfaces (tips, the crypto plan-upgrade flow,
premium-post purchase and Help contributions) are disabled inside the
native apps, conservatively, to stay within Apple and Google store payment
policy. The restriction is applied both by hiding the triggering UI and by
rejecting the request server-side. Marketplace and creator withdrawals are
not restricted, because Marketplace never processes a payment and a
withdrawal is a payout rather than a purchase.

---

## Security principles

- **Server-side authorization.** Every protected route checks the session
  server-side. Client-supplied signals are never the security boundary.
- **Sanitize at write time.** User- and journalist-authored HTML is
  sanitized against a strict allowlist before it is stored, so every
  consumer receives safe content.
- **Rate limit sensitive endpoints.** Redis-backed limiting with a
  best-effort in-process fallback, so a degraded cache never removes
  limiting entirely.
- **Guard outbound fetches.** Link previews go through an SSRF guard
  rather than fetching arbitrary user-supplied URLs.
- **Authenticate the socket.** Socket.IO handshakes are authenticated and
  origins are restricted; identity is not taken from the client.
- **Baseline security headers.** `X-Frame-Options`,
  `X-Content-Type-Options`, `Referrer-Policy`, `Strict-Transport-Security`
  and `Permissions-Policy` are set globally, and Content-Security-Policy
  is fully enforced after a domain-by-domain audit of every real flow
  (uploads, embeds, analytics, error reporting, Solana RPC, Socket.IO,
  OAuth, and WebRTC's TURN/STUN ICE schemes).
- **No secrets in the repository.** Configuration is injected at runtime;
  environment files and signing material are excluded by `.gitignore`.
- **Defence in depth.** Store payment restrictions, for example, are
  enforced in the UI *and* on the route.

To report a vulnerability, see [SECURITY.md](SECURITY.md). Do not open a
public issue containing vulnerability details.

---

## Roadmap

Direction, not a delivery commitment. Dates are not promised.

- Bring the native Android and iOS applications to feature parity with the
  web platform, tracked item by item in
  [`ios-native/PARITY.md`](ios-native/PARITY.md).
- Retire the Capacitor WebView shells once the native clients supersede
  them.
- Complete the blocked backend capabilities the native clients need.
- Extend Trust & Safety tooling and the public transparency reporting.
- Broaden ZRP Music, Creator Studio and Opportunities.
- Continue expanding localization coverage beyond the current 39
  languages as new markets are prioritized.
- Wire the Android Launchpad Solana foundation up to real Launchpad
  screens (a non-custodial Mobile Wallet Adapter signing flow, plus the
  Play Console financial-features declaration that requires), and start
  the iOS Launchpad implementation from scratch where store policy
  allows it.
- Configure a LiveKit Egress storage bucket (S3/GCS/Azure) so ZRP Live
  replay/recording can complete instead of answering `503`.
- Automatically seed a Raydium pool from a bonding curve's swept
  reserves on graduation, closing the one manual step in that flow.
- Deploy the ZRP Launch Program to Solana mainnet, through the existing
  manual, confirmation-gated workflow, once that decision is made.
- Keep tagging Web releases and publishing GitHub Releases going
  forward: see [Versioning and releases](#versioning-and-releases).

---

## Repository status

- The web application is the most complete client and is deployed.
- The native Android and iOS applications are under active development and
  are not released.
- The API in `src/app/api/**` is the shared contract for every client. It
  is internal to ZRP and is not offered as a public API.
- `main` is the source of truth. Development happens on branches and is
  merged through pull requests after review.
- This repository is publicly readable for transparency. It does not
  accept unsolicited external contributions: see
  [CONTRIBUTING.md](CONTRIBUTING.md).

---

## Versioning and releases

### Current Web release

**ZRP Web v1.0.0**, released **2026-09-13**.

- Git tag: [`v1.0.0`](https://github.com/LeonidasSpart/zrp-social-platform/releases/tag/v1.0.0)
- GitHub Release: see the tag above for the published release notes
- `package.json`'s `"version"` field matches: `1.0.0`
- Full contents: [CHANGELOG.md](CHANGELOG.md#100-2026-09-13)

This is the **first** tagged, released version of the Web application;
it marks the point ZRP adopted SemVer + GitHub Releases, not a claim
that the platform went live on this date. The web application was
already in continuous production deployment from `main` before this
release existed; see **Prior state**, below, for that history.

The Web application follows [SemVer](https://semver.org/)
(`vMAJOR.MINOR.PATCH`) from this release forward. Each meaningful
deployment going forward should be tagged the same way and backed by a
GitHub Release whose body is the corresponding
[CHANGELOG.md](CHANGELOG.md) section, with `package.json`'s `"version"`
kept in sync with the tag so the two can never silently disagree.

### Android and iOS versioning (independent of Web)

**Android and iOS are not implied to be released just because Web is.**
Each platform keeps its own, independent version number, on its own
release cadence:

- `android-native/` increments `versionCode`/`versionName` in
  `app/build.gradle` on every change destined for a real upload,
  documented inline at each bump; currently versionCode 32,
  versionName 4.0.26. It has an **Internal Testing** listing on Google
  Play, not a public release.
- `android/` (the Capacitor shell being superseded) is still at its
  original placeholder `versionCode 1` / `versionName "1.0"`.
- `ios-native/` is at its Xcode project's default
  `MARKETING_VERSION 1.0.0` / `CURRENT_PROJECT_VERSION 1`, never bumped,
  because it has **no App Store listing** yet: see
  [Native applications](#native-applications).

A future release's notes should cross-reference the Android/iOS version
that shipped alongside it where relevant, so "what shipped together"
stays answerable, without pretending the three platforms share one
version number.

### Prior state (before this release)

Before `v1.0.0`, the repository had **no GitHub Releases** and
effectively **no release tags** (the only tag that existed,
`before-nextjs-upgrade`, was a one-off pre-migration checkpoint, not a
version marker), and `package.json`'s `"version"` field was still
`0.1.0`, the default Next.js scaffold value, never bumped. That gap is
what this release closes for the Web application specifically; it does
not retroactively make any past commit "version 1.0.0"; only the
commit this tag actually points to.

---

## Licence and intellectual property

**ZRP is not open source.**

The source in this repository is proprietary and © 2026 ZRP, all rights
reserved. Public visibility does not grant any licence to copy, modify,
redistribute, sublicense, sell, deploy, rebrand or build derivative works
from it. The ZRP name, logo, product names, brand assets and visual
identity are protected.

Third-party dependencies remain subject to their own licences, which this
licence does not modify or override.

Full terms: [LICENSE](LICENSE).

---

## Project documents

- [LICENSE](LICENSE): proprietary licence terms
- [SECURITY.md](SECURITY.md): vulnerability reporting
- [CONTRIBUTING.md](CONTRIBUTING.md): development workflow
- [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md): participation standards
- [CHANGELOG.md](CHANGELOG.md): notable changes over time
- [`docs/zrp-news-network.md`](docs/zrp-news-network.md): ZRP News
  Network architecture and operations
- [`docs/database-migration-deployment.md`](docs/database-migration-deployment.md):
  database migration/deployment procedure
- [`docs/user-geography-and-acquisition.md`](docs/user-geography-and-acquisition.md):
  geography, acquisition and professional-profile data model
- [`docs/live-audio-architecture.md`](docs/live-audio-architecture.md):
  ZRP Live Audio architecture and platform status
- [`docs/live-video-architecture.md`](docs/live-video-architecture.md):
  ZRP Live Video architecture and platform status
- [`docs/discover-backend.md`](docs/discover-backend.md): ZRP Discover
  ranking backend
- [`docs/advanced-search-architecture.md`](docs/advanced-search-architecture.md):
  Advanced Search categories and per-platform status
- [`docs/zrp-launchpad-deployment.md`](docs/zrp-launchpad-deployment.md):
  ZRP Launch Program build/test/devnet/mainnet deployment procedure
- [`docs/launchpad-bonding-curve-research.md`](docs/launchpad-bonding-curve-research.md):
  the Pump.fun trading/discovery integration's scope and research
- [`ios-native/README.md`](ios-native/README.md): native iOS module
- [`ios-native/PARITY.md`](ios-native/PARITY.md): cross-platform parity
  matrix
