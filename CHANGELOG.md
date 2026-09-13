# Changelog

All notable changes to ZRP Social are documented in this file.

This is the **first** version of this changelog. It starts from this
commit forward; it does not retroactively transcribe every commit in
this repository's prior history. That history is real, complete, and
already available via `git log` — this file summarizes the meaningful
changes rather than duplicating it.

The format loosely follows [Keep a Changelog](https://keepachangelog.com/),
grouped by area where that is clearer than the standard
Added/Changed/Fixed/Security buckets. Entries reference the pull request
that introduced them (`#NNN`) so any claim here can be checked against
the actual diff and discussion on GitHub.

**On versioning:** as documented in [README.md](README.md#versioning-and-releases),
the Web application now follows [SemVer](https://semver.org/) and is
tracked with Git tags and GitHub Releases, starting with **v1.0.0**
below. Android and iOS version their own native builds independently
(see the same README section) and are called out explicitly where a
change shipped there; neither is implied to be released just because
Web is.

---

## [Unreleased]

Nothing yet.

---

## [1.0.0] — 2026-09-13

First tagged, released version of the ZRP Web application. This marks
the point where ZRP adopted SemVer + GitHub Releases going forward — it
is not a claim that the platform went live on this date; the web
application has been in continuous production deployment from `main`
before this changelog or any release process existed (see
[README.md](README.md#versioning-and-releases) for that history and the
gap it documents). Everything below was verified against the actual
merged GitHub history at the time of this release.

### Added

- **Communities and Lists** across Web, Android and iOS — hashtag-driven
  topic communities with roles, and X-style curated user lists, public or
  private (#299).
- **Report-on-profile** across Web, Android and iOS — a bare-account
  report (harassment, impersonation, fake account) with no post/comment
  attached, using a new `reportedUserId` target on `Report` distinct from
  the action-only `targetUserId` (#318). See
  [docs/zrp-front-agent-mission-audit.md](docs/zrp-front-agent-mission-audit.md)
  for the full audit behind this change.
- **Localization expanded from 11 to 15 languages** — Portuguese,
  Japanese, Korean and Hindi added with full key parity across Web,
  Android and iOS, plus a permanent CI completeness gate on both Web
  (`translations-completeness.test.ts`) and Android
  (`LocalizationCompletenessTest.kt`) (#308, #310).
- **ZRP Global Ambassadors** — a complete world-map program feature
  (#267).
- Native (Android and/or iOS) feature build-out reaching parity with
  several web surfaces this period, including: group chat (schema,
  backend, Socket.IO, Web UI, Android UI) (#197, #200, #201); Trust
  Passport, Journalist tools, Creator Studio and an AI chat assistant on
  native (#104, #105, #102, #106); native Admin parity — dashboard, reports,
  users, posts, and later seven additional moderation/verification
  queues (Appeals, Ads, Marketplace, Opportunity, HELP, Journalists,
  Music Artists) plus a Support Tickets admin (#116, #211, #210); native
  Team Management and API Keys settings (#149, #151); native Data Export,
  email notification preferences, and Moderation Appeals (#139, #140,
  #147); native polls, link previews, post view counts and unread-message
  navigation badges (#133, #134, #135, #136); a native Pricing screen and
  a HELP-campaign-withdrawal admin screen (#290, #291); Google Sign-In on
  native via Credential Manager, verified server-side (#115); real
  presence indicators on Web and Android, consuming `server.js`'s
  existing socket events (#195, #196); a "Delete conversation" action for
  1:1 DMs (#280).
- A live crypto market data section on ZRP News's Crypto tab, and a
  GAMING news category (#276, #221).
- A quiet, X-style footer on Web/PWA (#254, later trimmed to
  About/Help/Contact/Charity/Transparency/Legal in #259).

### Changed

- **Web responsive shell**: `Sidebar` now renders a compact icon-only
  rail from `md` (768px), full labeled rail from `lg` (1024px) — closing
  a gap where every viewport between phone and 1024px fell back to full
  phone UI. `RightPanel` now renders from `lg` (narrower) instead of only
  from `xl`, closing a second gap where the 1024–1280px range had a
  right-hand column of dead whitespace next to the feed (#315, #318).
- Native Android and iOS shell redesigns: a 5-item bottom nav + left
  drawer on Android matching the ZRP reference design (#283), and an iOS
  navigation menu with a five-item bar and iPad sidebar (#298).
- A broad frontend "surgical polish" pass across Web/Android/iOS: RTL and
  SSR-safe internationalization, consistent error states, accessibility
  fixes and motion polish (#306).
- ZRP News now runs primarily from an in-process hourly timer inside the
  running application (`src/lib/news/hourly-runner.ts`, started from
  `src/instrumentation.ts`) rather than relying solely on the GitHub
  Actions cron schedule, which this repository's own run history showed
  delivering only ~43% of its scheduled runs. The GitHub Actions workflow
  remains as a backup trigger (now firing twice hourly). See
  [docs/zrp-news-network.md](docs/zrp-news-network.md#schedule) (#239,
  #244).

### Fixed

- Socket.IO had no Redis adapter at all, meaning realtime events would
  not reach other replicas once the app scaled beyond one instance — a
  Redis adapter was wired in (#302), and a follow-up pass fixed
  distributed WebRTC call state and stale socket identity issues that
  the adapter surfaced (#307).
- A WebRTC `start()`/`end()` generation race where a network-delayed
  `end-call` for an already-finished call could delete a brand-new call
  placed afterward between the same two users; a per-call generation id
  now guards against it (#314).
- Withdrawal approval was not crash-safe: a crash between recording an
  on-chain payout and finalizing it in the database could lose track of
  real money movement. Split into a durable checkpoint plus an idempotent
  finalize step, with a periodic reconciliation job for anything left
  stuck after a crash (#314).
- A Solana transfer whose on-chain outcome was genuinely ambiguous
  (e.g. an RPC timeout after broadcast) could previously be refunded
  automatically, double-paying if the transfer had actually landed. It
  is no longer auto-refunded, and an unfinalized transfer is never
  reported as a success (#317).
- The ZRP News pipeline's distributed lock used an unconditional `DEL`
  on release, which could let two cycles run concurrently if a lock
  expired mid-cycle; the release is now atomic and token-scoped (#303).
- `socket-off` listener clobbering, missing disconnect diagnostics, and a
  deprecated UploadThing field read (also separately found and fixed a
  second time in a different component during a later closure pass)
  (#309, #314).
- Push notification subscriptions are now pruned when FCM returns its
  permanent VAPID-key-mismatch error, instead of retrying a subscription
  that can never succeed again (#297).
- UploadThing cleanup on account/content deletion now dedupes keys and
  checks reference-safety before deleting a file, rather than risking a
  delete of a file another record still references (#296).
- A Prisma 7 regression broke `prisma generate` in CI whenever
  `DATABASE_URL` was unset (#295).
- Poll rendering on the web client and a native composer keyboard block
  were both fixed in the same publish-flow pass (#228).
- A forensic re-audit of PRs #302–#309 found and fixed three further real
  defects surfaced by that work (#312).
- Hardcoded English strings in `PostCard`, and Team Management/API Keys
  being unreachable from the Settings page's own index, were fixed
  together (#313).
- Hardcoded English date/time formatting and an inverted "Show
  more/less" control were fixed across the app (#311).

### Security

- Patched `firebase-admin` and `nodemailer` vulnerabilities, and stopped
  running CI against end-of-life Node 20 (#300).
- Fixed admin approval-flow race conditions, N+1 query patterns, and
  added graceful shutdown handling (#304).
- See **Fixed** above for the Solana ambiguous-refund fix (#317) and the
  withdrawal crash-safety work (#314), both of which are financial
  correctness/security fixes as much as bug fixes.

### Infrastructure

- A standalone `ios-parity-audit.yml` CI workflow now runs the same
  parity-checking script the iOS build already ran, triggered by any
  `src/app/api/**` change, closing a gap where changing or removing any
  of ~119 backend routes referenced in `ios-native/PARITY.md` was
  previously invisible to CI unless it also touched `ios-native/**`
  (#314).
- A Redis distributed-lock module and a withdrawal-reconciliation runner
  were added to support the fixes above (#314).

---

## Earlier history

Everything before the [1.0.0](#100--2026-09-13) entry above is fully
preserved in this repository's Git history (`git log`) and in the merged
pull requests on GitHub, including the initial build-out of every native
(Android and iOS) product module, the original ZRP News Network
architecture, the initial 11-language localization pass, and the core
web platform itself. It is not reproduced here.
