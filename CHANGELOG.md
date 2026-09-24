# Changelog

All notable changes to ZRP Social are documented in this file.

This is the **first** version of this changelog. It starts from this
commit forward; it does not retroactively transcribe every commit in
this repository's prior history. That history is real, complete, and
already available via `git log`; this file summarizes the meaningful
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

Changes merged to `main` since `v1.0.0` (2026-09-13), not yet tagged in a
Web release. Web deploys continuously from `main`, so these are live in
production; Android is versioned independently (see
[README.md](README.md#android-and-ios-versioning-independent-of-web)) and
iOS has no build shipped yet.

### Localization

- **Localization expanded from 15 to 25 languages** ("EU Wave 1"): Dutch,
  Polish, Romanian, Czech, Hungarian, Swedish, Danish, Croatian, Bulgarian
  and Greek added with full key parity across Web, Android and iOS
  (#361). iOS's `.strings`/`L10nKey` generation and Android's
  `LocalizationCompletenessTest.kt` gate were both re-verified clean
  against all 25 languages as part of this change.
- Fixed a systemic pattern of hardcoded, untranslated English strings in
  API error/status responses (Web) and in Android's Repository layer,
  found during an adversarial audit of the EU Wave 1 change before merge
  (#361).
- Fixed `hashtag.postCount` reusing a verb translation as a noun at
  count = 1 ("1 post" rendering incorrectly in languages where the two
  differ) (#361).
- Bumped the Android release to versionCode 31 / versionName 4.0.25 to
  ship the EU Wave 1 languages on Android's Internal Testing track (#367).

### Bug Fixes

- **Voice and video calling**: fixed voice calls getting stuck on
  "Connecting..." with total silence, even though the call had actually
  connected - the element that attaches the remote audio/video stream
  was only ever mounted for video calls. Also fixed "ghost calls" (a
  call that appeared to still be ringing after it had actually ended),
  a timing bug that could end the wrong call, and added a 20-second
  connection timeout and a 45-second no-answer timeout so a call now
  fails with a clear message instead of hanging forever. A
  backgrounded/minimized recipient now also gets a real push
  notification for an incoming call, not just the in-app ring (#392).
  Android's calling flow already had the connection itself right, but
  didn't have these same two timeouts or a way to tell "the other
  person is unavailable" apart from "they declined" - both ported over
  to match (#394).
- **Broken link previews when sharing ZRP on social media**: sharing
  `/ambassadors` (and, it turned out, about 30 other pages) on
  X/Twitter, Facebook, WhatsApp, etc. showed a title but no image,
  because a page that customized its own preview text accidentally lost
  the image entirely rather than inheriting the site's default. Fixed
  platform-wide with a shared helper that can no longer make that
  mistake, plus a new branded image generator so every page - including
  posts, profiles, articles and hashtags with no photo of their own -
  gets a real, on-brand preview image instead of a blank one (#394).
- **Quoted posts on iOS opened the wrong thing**: tapping a quoted post
  (e.g. someone quote-posting an official ZRP announcement) didn't open
  the original post at all - only its author's name/photo (which opened
  their profile) and its own image (which opened a full-screen photo
  viewer) did anything. Web and Android already opened the right post
  when you tapped anywhere on a quote; iOS now does too (#396).
- Fixed the language selector menu overflowing the viewport with no way
  to scroll to it once the list reached 25 entries, on the desktop
  header dropdown, the mobile drawer, and the sidebar flyout (Web) (#363).
- Fixed like-count rollback math and stale-derived-state gaps that could
  leave a post's displayed like count wrong after a failed or raced
  like/unlike (#362).
- Fixed notification deduplication and blocked-user-check gaps, and added
  a repost quota and `@mention` support to social interactions (#356).
- Enforced blocked-user checks on likes, comments and reposts (previously
  only enforced for follows and messages), and fully hardened the
  comment-repost route with the same protections every sibling toggle
  route already had (#359).
- Added `Notification.commentId` to fix an ambiguity where a
  `comment_like`/`comment_repost` notification could not be reliably
  retracted (#360).
- Fixed the admin Subscriptions & Billing dashboard silently returning
  wrong or empty data for its KPIs, search and filters (#355), and fixed
  the same page's table being unreadable/squeezed and showing broken
  avatars on mobile (#357).
- Fixed the Ads campaign-creation crash caused by
  `/users/[username]/posts` returning `{items}` while the caller expected
  `{posts}` (#346).
- Fixed a Discover 500 error when `getDiscoverReason` ran against a
  cache-hit post (#353).
- Fixed the Android build failing over a bogus `matchParentSize` import,
  and fixed iOS's localization generator drifting on the `action.copy`
  key (#350).

### Security

- **Content-Security-Policy is now fully enforced**, not just
  logged-and-observed: promoted after checking the real allowlist every
  upload, embed, analytics, error-reporting, payment and calling flow
  actually needs against what the policy allows, and fixing two real
  gaps that check found (calling's TURN/STUN connections, and a missing
  UploadThing host in the media policy) so enforcing it didn't break
  anything live (#394).

### Features

- **Manage your own Stories**: you can now delete a Story you posted,
  or edit its caption, from the Story viewer - previously there was no
  way to fix or remove one once it was up (Web) (#396).
- **ZRP Discover**: a new vertical, swipeable, ranked video feed
  (`/discover`, Web), reusing Shorts' existing video posts with
  server-side ranking, a creator-diversity pass, viewer-state gating and
  its own watch-signal analytics (#347, #351). Followed by a sound-
  preference unification with Shorts and new transparency controls
  ("Why am I seeing this") (#353). Web-only; not yet on Android or iOS.
- **Subscription lifecycle**: a real, time-bounded `Subscription` model
  with payment-to-entitlement, expiration and renewal-reminder engines,
  replacing a plan flag that never expired on its own, plus an admin
  Subscriptions & Billing dashboard (#354).
- Made URLs inside messages and comments real, tappable links, with link
  previews and a copy-text action for message bubbles (#348, #350).
- Surfaced the existing repost quota to users in the UI instead of only
  enforcing it silently server-side (#358).

### Improvements

- Removed a client-side session wait that delayed the home feed's first
  load, and fixed comment composers to support multi-line text (#364).
- Comment composers now auto-grow with content instead of a fixed height
  (`useAutoGrowTextarea`, #364).

### Performance

- Lazy-loaded `simple-peer` (WebRTC signalling) so it is no longer
  shipped on every page load, only when a call is actually placed or
  received (#365).
- Lazy-loaded per-item images in scrollable lists: avatars, story
  previews, gallery tiles (#366).

### Accessibility

- Added `role="menu"`/`role="menuitem"` and matching `aria-haspopup` to
  all three language-selector implementations so they're identifiable as
  menus to assistive technology, as part of the scroll-overflow fix
  above (#363).

### Documentation

- Linked the Child Safety Standards page from the site footer (#345).

---

## [1.0.0] (2026-09-13)

First tagged, released version of the ZRP Web application. This marks
the point where ZRP adopted SemVer + GitHub Releases going forward; it
is not a claim that the platform went live on this date; the web
application has been in continuous production deployment from `main`
before this changelog or any release process existed (see
[README.md](README.md#versioning-and-releases) for that history and the
gap it documents). Everything below was verified against the actual
merged GitHub history at the time of this release.

### Added

- **Communities and Lists** across Web, Android and iOS: hashtag-driven
  topic communities with roles, and X-style curated user lists, public or
  private (#299).
- **Report-on-profile** across Web, Android and iOS: a bare-account
  report (harassment, impersonation, fake account) with no post/comment
  attached, using a new `reportedUserId` target on `Report` distinct from
  the action-only `targetUserId` (#318). See
  [docs/zrp-front-agent-mission-audit.md](docs/zrp-front-agent-mission-audit.md)
  for the full audit behind this change.
- **Localization expanded from 11 to 15 languages**: Portuguese,
  Japanese, Korean and Hindi added with full key parity across Web,
  Android and iOS, plus a permanent CI completeness gate on both Web
  (`translations-completeness.test.ts`) and Android
  (`LocalizationCompletenessTest.kt`) (#308, #310).
- **ZRP Global Ambassadors**: a complete world-map program feature
  (#267).
- Native (Android and/or iOS) feature build-out reaching parity with
  several web surfaces this period, including: group chat (schema,
  backend, Socket.IO, Web UI, Android UI) (#197, #200, #201); Trust
  Passport, Journalist tools, Creator Studio and an AI chat assistant on
  native (#104, #105, #102, #106); native Admin parity: dashboard, reports,
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
  rail from `md` (768px), full labeled rail from `lg` (1024px), closing
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
  not reach other replicas once the app scaled beyond one instance; a
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

Everything before the [1.0.0](#100-2026-09-13) entry above is fully
preserved in this repository's Git history (`git log`) and in the merged
pull requests on GitHub, including the initial build-out of every native
(Android and iOS) product module, the original ZRP News Network
architecture, the initial 11-language localization pass, and the core
web platform itself. It is not reproduced here.
