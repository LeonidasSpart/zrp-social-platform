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
visible but **not open source** — see [Licence and intellectual property](#licence-and-intellectual-property).

---

## Contents

- [Why ZRP](#why-zrp)
- [Platforms](#platforms)
- [Core features](#core-features)
- [Messaging](#messaging)
- [ZRP Music](#zrp-music)
- [Creator Studio](#creator-studio)
- [ZRP AI](#zrp-ai)
- [ZRP News Network](#zrp-news-network)
- [ZRP Help](#zrp-help)
- [Opportunities](#opportunities)
- [Marketplace](#marketplace)
- [Trust & Safety](#trust--safety)
- [Privacy](#privacy)
- [Authentication](#authentication)
- [Internationalization](#internationalization)
- [Technology stack](#technology-stack)
- [Architecture](#architecture)
- [Development setup](#development-setup)
- [Project structure](#project-structure)
- [Testing](#testing)
- [Native applications](#native-applications)
- [Security principles](#security-principles)
- [Roadmap](#roadmap)
- [Repository status](#repository-status)
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

- **Web application** — Next.js, the primary and most complete client.
- **Native Android application** — Kotlin / Jetpack Compose
  (`android-native/`), in active development.
- **Native iOS application** — Swift / SwiftUI (`ios-native/`), in active
  development.
- **Capacitor shells** — `android/` and `ios/`, which wrap the web
  application and are being superseded by the native clients.
- **Shared REST API** — `src/app/api/**`, consumed by every client.
- **Realtime service** — Socket.IO, hosted by the custom server in
  `server.js`.
- **PostgreSQL database** — accessed through Prisma.
- **Cloud media storage** — UploadThing.

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
real platform data; there is no seeded or placeholder catalogue.

### Play

A challenge and duel experience with challenges, attempts, leaderboards,
achievements and player profiles.

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
There is no seeded or mock catalogue — the catalogue is whatever artists
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
apps — see [Payments in the native apps](#payments-in-the-native-apps).

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
summaries through openly-labelled ZRP news desks — ZRP News World, ZRP
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
writes an original summary — never a copy of an article — and publishes
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
career-related listings — opportunity discovery, applications, saved
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
- Trust Passport — a per-profile trust signal, separate from identity
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
account owns — post images, comment images, message media, stories, music
tracks, albums, artist artwork, playlist covers, marketplace listing media
and campaign media — deletes those files from cloud storage, and then
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

The interface ships human translations for **11 languages**:

English, French, German, Italian, Albanian, Spanish, Russian, Arabic,
Chinese, Turkish and Bahasa Indonesia.

Arabic is rendered right-to-left. The web dictionary in
`src/lib/translations.ts` is the single source of truth: the iOS
`.strings` bundles and localization key enum are generated from it, so a
native string cannot drift from the web copy. Where a native-only string
has no web counterpart (mostly accessibility labels), it falls back to
English rather than being machine-translated.

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

### Media

UploadThing · Sharp · file-type

### AI

DeepSeek, accessed through the OpenAI-compatible SDK

### Blockchain

Solana (`@solana/web3.js`, `@solana/spl-token`) with USDC support, used for
tips, premium-post purchases, Help contributions, plan upgrade requests and
creator/campaign withdrawal approvals. On-chain transactions are verified
independently server-side. This functionality is
maintained separately from the core social experience and can evolve
independently.

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

### Configuration

All configuration is supplied through environment variables at runtime;
no secret is committed to this repository. The variables the code reads
include:

- **Database and cache** — `DATABASE_URL`, `REDIS_URL`,
  `REDIS_PUBLIC_URL`
- **Auth** — `NEXTAUTH_URL`, `NEXTAUTH_SECRET`, `GOOGLE_CLIENT_ID`,
  `GOOGLE_CLIENT_SECRET`, `APPLE_CLIENT_ID`, `APPLE_TEAM_ID`,
  `APPLE_KEY_ID`, `APPLE_PRIVATE_KEY`, `APPLE_NATIVE_CLIENT_ID`
- **Email** — `RESEND_API_KEY`, `EMAIL_FROM`
- **Push** — `FIREBASE_SERVICE_ACCOUNT_JSON`, `VAPID_PUBLIC_KEY`,
  `VAPID_PRIVATE_KEY`, `NEXT_PUBLIC_VAPID_PUBLIC_KEY`
- **AI** — `DEEPSEEK_API_KEY`
- **Realtime and calling** — `SOCKET_ALLOWED_ORIGINS`, `METERED_API_KEY`,
  `METERED_APP_NAME`
- **Blockchain** — `SOLANA_RPC_URL`, `NEXT_PUBLIC_SOLANA_RPC_URL`,
  `SOLANA_WALLET_ADDRESS`, `SOLANA_PRIVATE_KEY`, `NEXT_PUBLIC_USDC_MINT`
- **Observability and misc** — `SENTRY_DSN`, `NEXT_PUBLIC_SENTRY_DSN`,
  `CRON_SECRET`, `GIPHY_API_KEY`
- **Security tuning (optional)** — `TRUSTED_PROXY_HOPS` (number of
  trusted reverse proxies in front of the app for client-IP resolution;
  defaults to `1`, Railway's edge — only change it if another trusted
  proxy/CDN is placed in front), `ALLOWED_MEDIA_HOSTS` (comma-separated
  extra hosts, exact or `.suffix`, accepted as post media in addition to
  UploadThing and GIPHY), `LEGACY_PASSWORD_MIGRATION=off` (skips the
  automatic boot-time plaintext-to-bcrypt password migration `server.js`
  runs after listening; leave unset in production)

Behaviour that depends on an unset variable degrades rather than crashing
where the code allows it — for example, the Apple provider is registered
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

---

## Native applications

Both native applications are **in active development**. They are not
described here as released products, and nothing in this repository
represents an approved App Store or Google Play listing.

### Android

`android-native/` is a Kotlin / Jetpack Compose application
(`one.zrp.social`, minSdk 24, targetSdk 36) that is replacing the
Capacitor WebView shell in `android/`. It uses AndroidX and Material 3,
Navigation Compose, Media3, Coil, WebRTC, Firebase Cloud Messaging,
Google Credential Manager, and EncryptedSharedPreferences for session
storage.

Its CI workflow builds a debug APK on every change and a release App
Bundle on demand. The native module has no Play Store listing of its own
yet and is for internal testing until feature parity is reached. The
Capacitor shell continues to build through its own separate workflow, and
produces a signed `.aab` only when the real upload keystore is present as
repository secrets.

### iOS

`ios-native/` is a Swift / SwiftUI application targeting iOS 17, built in
Xcode 16 with no third-party dependencies. Its architecture is
one-directional — `View → ViewModel → Repository → ApiClient → backend` —
sessions are stored in the Keychain, and Sign in with Apple is native and
verified server-side.

Feature-by-feature status against the backend, the web app and the Android
app is tracked in [`ios-native/PARITY.md`](ios-native/PARITY.md), which
records what is implemented, what is partial, what is missing and what is
blocked on a backend capability that does not exist yet. A screen existing
is not counted there as implementation.

### Payments in the native apps

Certain crypto-payment surfaces — tips, the crypto plan-upgrade flow,
premium-post purchase and Help contributions — are disabled inside the
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
  `X-Content-Type-Options`, `Referrer-Policy` and
  `Strict-Transport-Security` are set globally.
  Content-Security-Policy and Permissions-Policy are deliberately not set
  yet — getting either wrong would silently break WebRTC calling, uploads
  or realtime, and both need a domain-by-domain audit first.
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
- Add Content-Security-Policy and Permissions-Policy after a
  domain-by-domain audit.
- Expand localization coverage beyond the current 11 languages.

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
  accept unsolicited external contributions — see
  [CONTRIBUTING.md](CONTRIBUTING.md).

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

- [LICENSE](LICENSE) — proprietary licence terms
- [SECURITY.md](SECURITY.md) — vulnerability reporting
- [CONTRIBUTING.md](CONTRIBUTING.md) — development workflow
- [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md) — participation standards
- [`ios-native/README.md`](ios-native/README.md) — native iOS module
- [`ios-native/PARITY.md`](ios-native/PARITY.md) — cross-platform parity
  matrix
