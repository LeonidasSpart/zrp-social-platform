# ZRP Front Agent Mission — Final Audit Report

This document is the durable, reproducible record of the "ZRP FRONT AGENT"
mission: a UX audit of ZRP's web/PWA frontend against reference product
patterns (navigation, responsive shell, moderation), followed by a
surgical implementation pass. It is committed to the repository rather
than only living in a chat transcript, per the mission's own final
requirement.

Every claim below is checked against the actual repository state (git
log, CI runs, file contents) as of this document's own commit, not
recalled from memory. Where something could not be verified locally
(no Postgres, no Android SDK, no Xcode in this sandbox — see
**Known limitations** below), that is stated explicitly rather than
assumed.

## Summary table

| # | Item | Status | Platforms |
|---|------|--------|-----------|
| 1 | Report-on-profile (bare account report) | **DONE** | Web, Android, iOS |
| 2 | RightPanel 1024–1280px gap | **DONE / VERIFIED** | Web |
| 3 | Tablet-tier responsive nav (md–lg rail) | **DONE / VERIFIED** (prior PR #315) | Web |
| 4 | Team Management / API Keys discoverability | **DONE** (prior PR #313) | Web |
| 5 | Android release candidate (versionCode 22 / 4.0.16, signed) | **UNCHANGED, per explicit instruction** | Android |
| 6 | This audit report | **DONE** | — |
| 7 | ZRP Web v1.0.0 release (separate, later directive — see Addendum) | **DONE** | Web |

## 1. Report-on-profile

**Finding (original audit):** a profile page had no way to report an
account itself — only individual posts/comments/listings could be
reported. `Report` had no field for a bare-account target.

**Fix, end to end:**

- **Schema** (`prisma/schema.prisma`): a seventh polymorphic target,
  `reportedUserId` (relation `"ReportedUser"`), distinct from the
  existing `targetUserId` — that field is only ever denormalized once
  an admin *actions* a report (see `PUT /api/admin/reports/[id]`);
  `reportedUserId` is the report's real subject from the moment it's
  filed. `onDelete: SetNull`, matching every other polymorphic target,
  so deleting the reported account never erases the moderation record.
  Migration: `prisma/migrations/20260913140000_add_profile_report_target/`.
- **API** (`src/app/api/reports/route.ts`): `POST` now accepts a
  `userId` field, maps it to `reportedUserId`, refuses reporting your
  own account (400), and folds into the existing pending-duplicate
  check (409) and the existing rate limit (10/10min).
- **Admin** (`src/app/api/admin/reports/route.ts`,
  `.../[id]/route.ts`): list/detail now `include` `reportedUser`; the
  action-denormalization chain in `PUT` now also resolves
  `targetUserId` from `reportedUserId` when every other target is
  null — without this, actioning a profile report would leave
  `targetUserId` null, breaking the appeals flow and the moderation
  transparency dashboard for exactly this report type.
- **Admin UI** (`src/app/admin/reports/page.tsx`): a bare profile
  report now renders a "Profile report" badge and a working
  "View Reported Profile" link — previously the whole
  content-preview block (and therefore the *only* link to the
  reported account) was wrapped in `{content && (...)}`, so a
  contentless profile report would have rendered with no way to reach
  the account at all.
- **Web UI** (`src/app/profile/[username]/page.tsx`): a new "Report"
  item in the profile's existing More-actions menu (alongside
  Mute/Block), reusing the existing generic `ReportModal` component
  and the same fetch/toast pattern `PostCard.tsx` already uses for
  post reports.
- **Android** (`android-native/`): `ReportsApi.kt`'s
  `CreateReportRequest` gained a `userId` field;
  `ProfileRepository.reportUser()` / `ProfileViewModel.reportUser()`
  added, mirroring the existing `reportPost` pair; `ProfileScreen.kt`'s
  not-own-profile dropdown menu gained a "Report" item reusing the
  existing generic `ReportDialog` composable.
- **iOS** (`ios-native/`): `ReportRequest.Target` gained a `.user(String)`
  case with correct `Encodable` wiring to a `userId` JSON key;
  `ProfileView.swift`'s existing options menu gained a "Report" button
  reusing the existing generic `ReportSheet` view; `PARITY.md` updated
  with a new "Report a profile" row.
- **Localization**: `profile.reportUser` (web, 15 languages) and
  `adminReports.viewReportedProfile` / `adminReports.profileReportLabel`
  (web, 15 languages) added to `src/lib/translations.ts`;
  `profile_report_user` added to all 15 Android `values*/strings.xml`.
  iOS needed no new string — it reuses the existing `.reportModalTitle`
  key ("Report") for the menu item, exactly as the modal itself already
  does.
- **Tests**: two new integration test files —
  `src/app/api/reports/__tests__/route.integration.test.ts` (401
  without a session, 400 with no target/self-report, 201 creates a row
  with `reportedUserId` set and every other target null, 409 on a
  duplicate pending report) and
  `src/app/api/admin/reports/[id]/__tests__/action-profile-report.integration.test.ts`
  (actioning a profile report denormalizes `targetUserId`). Both need a
  real Postgres — see **Known limitations**.

**Not done, and correctly so:** nothing was invented for the reported
reason list — the same fixed English `Report.reason` values the site
already stores verbatim are reused everywhere (web/Android/iOS).

## 2. RightPanel 1024–1280px gap

**Finding (original audit):** `Sidebar` became a full `w-64` rail at
`lg` (1024px), but `RightPanel` stayed hidden until `xl` (1280px). In
between, the feed (`max-w-2xl` = 672px, centered) sat inside a `main`
column with nothing to its right, producing large dead whitespace on
both sides of the feed instead of a tablet/small-laptop-appropriate
three-column layout.

**Fix:** `RightPanel.tsx` now renders from `lg` (not `xl`) as a
narrower `w-72` (288px) rail, widening to the existing `w-80` (320px)
at `xl`. Every element inside `RightPanel` was already built with
`truncate`/`min-w-0`/`flex-shrink-0` (no fixed pixel widths beyond a
40px avatar), so narrowing the rail needed zero content changes.

**Verified:** `layout.tsx`'s real container math
(`max-w-[1400px] mx-auto` → `Sidebar` (256px at lg) + `main flex-1
min-w-0` (feed) + `RightPanel` (288px at lg, 320px at xl)) was
reproduced in a byte-for-byte equivalent static HTML/CSS harness (the
exact compiled pixel values of the Tailwind classes actually used, not
a guess) and checked with headless Chromium at 768, 1023, 1024, 1100,
1200, 1279, 1280, 1366 and 1440px:

- No horizontal overflow at any width (`document.documentElement.scrollWidth
  === clientWidth` at every point tested).
- Sidebar's right edge exactly meets main's left edge, and main's right
  edge exactly meets RightPanel's left edge, at every width from 1024
  up — no gap, no overlap.
- At 1024px (the narrowest three-column width), the feed column gets
  roughly 448–464px of usable width after padding — more generous than
  the ~343px this same feed already has to support at a 375px phone
  width, so no clipping/squeezing risk.

**Honesty note:** this is a static reproduction of the real
`layout.tsx`/`Sidebar.tsx`/`RightPanel.tsx` Tailwind classes rendered
in headless Chromium, not the live authenticated app — this sandbox
has no reachable Postgres, so a real signed-in session (which
`RightPanel` requires to render at all) could not be exercised here.
The CSS box-model behavior is identical either way, since Tailwind
utility classes compile to fixed CSS independent of the page's data,
but this has not been checked in a real browser against a live login
session or on a physical device.

## 3–4. Prior work (already merged, unchanged by this pass)

- **Tablet-tier responsive nav** (PR #315): `Sidebar` compact icon-only
  rail from `md` (768px), full labeled rail from `lg`; `BottomNav`/
  `Header`'s phone-only controls now correctly hide at `md` instead of
  `lg`. Fixed a real CSS `overflow-x`/`overflow-y` interaction bug in
  the same change (portal-based popover positioning). Merged into
  `main` at commit `0fb75c5`.
- **Team Management / API Keys discoverability + hardcoded strings**
  (PR #313): merged into `main` at commit `622454f`.

## 5. Android release candidate

**Per explicit instruction: no new AAB was generated during this
pass, and none was needed.** The existing signed release —
**versionCode 22 / versionName 4.0.16** (PR #316, merged at commit
`74fb07d`) — was verified still valid:

- Signed with the real, existing production upload key (confirmed via
  CI's own `keytool` validation log — certificate owner "Ram Dalipi,
  ZRP Social", SHA-256 fingerprint identical to the previously-live
  versionCode 21 build, i.e. the *same* key, never a new one).
- `applicationId=one.zrp.social`, `versionCode=22`, `versionName=4.0.16`
  confirmed by decoding the actual built `.aab`'s manifest in CI (not
  trusted from `build.gradle` source alone).
- SHA-256 of the `.aab` file itself:
  `6202013404c7d832755d0eaa0e8e65c23c4223527890f55b28c52a5ff6d19988`.

**This pass does add real Android code** (the Report-on-profile Kotlin
changes in `android-native/`), which is not yet reflected in that
signed AAB — versionCode 22 predates this change. Per the explicit
instruction not to rebuild "merely to claim completion," this is left
as-is: the next legitimate Android release (whenever the user is ready
to cut one) needs a fresh versionCode/versionName bump to carry the
Report-on-profile UI to Play Store, following the same convention
documented at every prior bump in `android-native/app/build.gradle`.

## Validation performed this pass

- `npx prisma format` / `npx prisma validate` / `npx prisma generate` — clean.
- `npx tsc --noEmit` — clean, zero errors.
- `npm run lint` — zero new warnings/errors (only pre-existing
  `<img>`/hook-dependency warnings, unrelated to this change).
- `npm test` — every pure unit test passes, including all 6
  `translations-completeness` tests (15-language key parity intact)
  and the existing `admin-reports-delete` unit test. The only failing
  test files are `*.integration.test.ts` files that need a real
  Postgres/Redis this sandbox cannot reach — including the two new
  ones added by this pass, which fail identically to every other
  pre-existing integration test for the same reason (`Can't reach
  database server at 127.0.0.1:55432`), not for any defect in the new
  tests themselves.
- Android: no local SDK/Gradle in this sandbox (network-restricted, as
  documented in `CLAUDE.md`), so verified by hand — brace/paren
  balance in every changed `.kt` file, every new symbol
  (`Icons.Filled.Flag`) actually imported, every new
  `R.string.profile_report_user` present and XML-well-formed in all 15
  `values*/strings.xml` files, and cross-checked against the exact
  existing `reportPost`/`ReportDialog` pattern being mirrored. The real
  compile check is this PR's own CI (`Native Android App Build`'s debug
  job).
- iOS: no Xcode on Linux, so verified the same way by hand (brace/paren
  balance, `Equatable` auto-synthesis correctness for the new `.user`
  enum case, reuse of an already-existing `L10nKey` rather than adding
  one). The real compile check is this PR's own CI (`Native iOS App
  Build`).

## Known limitations (sandbox, not product)

- No reachable Postgres or Redis in this environment: all
  `*.integration.test.ts` files (this pass's two new ones included)
  can only be verified by CI, which runs them against real services.
- No Android SDK / Gradle / emulator, and no Xcode: native changes are
  verified by careful manual review here and by each platform's own CI
  build workflow, never by a local compile in this sandbox.
- The RightPanel breakpoint fix was verified via a static, CSS-accurate
  harness (see above), not a live authenticated session or a physical
  device.

## Commits / PRs

- This document, the Report-on-profile implementation across all three
  platforms, and the RightPanel breakpoint fix are committed together
  in the PR that introduced this file — see that PR's own CI status
  for the actual green/red state at merge time, which is the
  authoritative record rather than anything restated here after the
  fact.
- Prior, already-merged work this report references: PR #315 (tablet
  nav), PR #316 (Android versionCode 22), PR #313 (Team/API Keys
  discoverability + hardcoded strings), PR #299 (Communities/Lists,
  which introduced `targetUserId`'s sibling fields on `Report`).

## Addendum: ZRP Web v1.0.0 release — COMPLETE

Out of this mission's original scope (documentation/versioning work
authorized separately, after this report's own items above were
already merged), recorded here because this is the one durable,
committed audit document in the repository.

**Status: DONE.** Verified directly against the GitHub API, not
restated from memory:

| Item | Value |
|---|---|
| Release commit | `cf4f61ca69c8608ec8ea0f5119de997933c35b38` (PR #320, merged to `main`) |
| Git tag | [`v1.0.0`](https://github.com/LeonidasSpart/zrp-social-platform/releases/tag/v1.0.0) — annotated, points at the commit above |
| GitHub Release | [`ZRP Web v1.0.0`](https://github.com/LeonidasSpart/zrp-social-platform/releases/tag/v1.0.0) — `draft: false`, `prerelease: false`, marked **Latest**, published `2026-09-13T17:19:30Z` |
| `package.json` version | `1.0.0` |
| Release notes | the [`CHANGELOG.md` §1.0.0](../CHANGELOG.md#100--2026-09-13) section, pasted verbatim as the release body |

**How it was completed:** the tag could not be pushed from this
sandbox's git credentials (`git push origin v1.0.0` returned a clean
`HTTP 403` directly from `github.com`, and no available GitHub API
tool in this environment's toolset exposes tag or release creation as
an alternative — confirmed by exhausting the tool search rather than
assumed). The repository owner pushed the tag from their own
authenticated environment and published the GitHub Release through the
GitHub web UI using the exact body above; both were then verified
independently via the GitHub API (`get_tag`, `get_release_by_tag`)
before being recorded as complete here.

Android and iOS are **not** implied to be released by this — see
[README.md's Versioning and releases section](../README.md#versioning-and-releases)
for why the three platforms version independently.
