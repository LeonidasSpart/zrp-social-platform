# User geography, acquisition and professional profile

This document is the source of truth referenced by code comments across the
geo/acquisition/discovery system (`src/app/api/auth/register/route.ts`,
`src/app/api/admin/analytics/geography/route.ts`, `src/lib/feed/geo-boost.ts`,
`prisma/schema.prisma`, and others). It exists to answer, honestly and
without fabrication: **where do ZRP users come from, and what do we do with
that fact?**

It does not duplicate `CLAUDE.md`'s architecture overview; it only covers the
system built for this mission.

## 1. What data is collected, and why

| Field (`User` model) | Mutable? | Source | Purpose |
| --- | --- | --- | --- |
| `country` (pre-existing, free text) | Yes, user-edited | Profile form | Legacy display string. Never used for matching/analytics - see below. |
| `countryCode` | Yes, user-edited (normalized) | Profile form, normalized via `src/lib/geo/country.ts` | Canonical current country. Used by ad targeting, feed geo-boost, "people near you". |
| `signupCountryCode` | **No, immutable** | IP-derived at registration (`src/lib/geo/ip-lookup.ts`) | Historical "where did this signup come from" fact for acquisition analytics. Never rewritten by a later profile edit. |
| `signupSource` | **No, immutable** | Computed once at registration from `ref`/`utm_source`/`utm_campaign` | Honest acquisition bucket: `DIRECT`, `REFERRAL`, `CAMPAIGN`, or `UNKNOWN` (pre-migration rows only - see below). |
| `signupCampaign` | **No, immutable** | Raw `utm_campaign`/`utm_source`/ambassador invitation code | Drill-down detail behind `signupSource`. |
| `signupPlatform` | **No, immutable** | `X-Zrp-Platform` request header (`web`/`android`/`ios`), defaults to `web` when absent | Which client the account was created from. |
| `languageCode` | Yes, current preference | `zrp-lang` cookie at signup, then profile updates | Current language preference, for analytics and (future) language-aware ranking. |
| `headline`, `company`, `position`, `skills` | Yes, user-edited | Profile form | Professional-profile fields (see Section 6). `category` (pre-existing) remains the industry taxonomy; these are not a duplicate of it. |

**No raw IP address is ever stored.** `resolveCountryFromIp()` performs a
local, in-process lookup against the bundled `geoip-lite` database (no
external API call, no third-party network dependency) and returns only a
two-letter country code or `null`. The IP string itself, as resolved by
`getRequestIp()` (`src/lib/rate-limit.ts`, trusted-proxy-aware), is used for
that one lookup and discarded - it is never written to any table.

## 2. Why current country and signup country are tracked separately

This is Phase 6 of the mission ("historical integrity"): a user who moves,
or simply corrects a typo in their profile, must not silently rewrite the
history of where signups originally came from.

- `countryCode` answers "where do our users say they are **today**" - used
  for ad targeting, the feed's same-country boost, and "people near you".
  It is deliberately excluded from range-filtered acquisition analytics.
- `signupCountryCode` answers "where did **new signups in this period**
  come from" - set once, at registration, from IP geolocation, and never
  touched again. The admin geography endpoint's `newUsersByCountry`
  breakdown is range-filtered on `createdAt` and grouped on this field, not
  on `countryCode`, for exactly this reason.

## 3. Acquisition: never fabricating "organic"

`classifySignupAttribution()` in `src/app/api/auth/register/route.ts`
computes exactly one of three buckets, all measurable facts about the
registration request itself:

- **`REFERRAL`**: the `ref` query param matches a real
  `AmbassadorProfile.invitationCode` in the database at signup time.
- **`CAMPAIGN`**: a `utm_campaign`/`utm_source` param was present, *or* a
  `ref` value was present but didn't match any real ambassador code (a
  failed/expired/typo'd referral attempt - this must not silently fall
  through to `DIRECT`, which would misrepresent "something drove this
  signup" as "nothing did").
- **`DIRECT`**: no `ref`, `utm_source`, or `utm_campaign` was present at
  all.

There is no fourth bucket for "organic search" or "typed the URL directly" -
ZRP has no referrer-tracking infrastructure that could honestly distinguish
those, so both collapse into `DIRECT` rather than inventing a distinction
the data doesn't support.

`UNKNOWN` is reserved **exclusively** for rows that existed before this
migration. The `@default("UNKNOWN")` on `signupSource`/`signupPlatform` in
`prisma/schema.prisma` only ever applies to pre-migration history; every
registration since this feature shipped sets a real, computed value
explicitly. No user is ever silently classified as organic/direct by
default.

## 4. Country normalization

`src/lib/geo/country.ts`'s `normalizeCountryInput()` is the single place
free-text country input (a raw code, an official name in any of ZRP's 11
registered languages, or a common alias like "USA"/"UK") is resolved to a
canonical ISO 3166-1 alpha-2 code. It reuses the exact dataset and locale
registrations the ZRP Global Ambassadors feature already established
(`src/lib/ambassadors/countries.ts`) rather than maintaining a second
country list.

"Switzerland" / "Suisse" / "Schweiz" / "CH" all resolve to `CH`. Matching is
case- and diacritic-insensitive but always **exact** against a known
name/alias - never fuzzy or partial. An input that cannot be resolved with
confidence returns `null` rather than a best-effort guess, because a wrong
normalization (e.g. conflating two differently-named "Guinea" countries)
would silently corrupt analytics, ad targeting and feed ranking - worse
than leaving the country unclassified.

The UI is free to translate a country's *display name* into any of ZRP's
languages; the stored `countryCode` is always the stable ISO code
underneath, so a translation choice on the frontend never changes what's
persisted or compared.

## 5. Where each signal is used

| Consumer | Field(s) | Behavior |
| --- | --- | --- |
| `src/app/api/ads/serve/route.ts` | `countryCode` | Ad campaign country targeting, matched against normalized `AdCampaign.targetCountries`. |
| `src/lib/feed/geo-boost.ts` (`applyGeoBoost`) | `countryCode` (viewer + author) | A `1.15x` multiplier on the existing engagement/recency score in `GET /api/posts/explore` ("For You") when viewer and author share a known country. Additive only - never a filter, never applied to "Trending". An unknown country on either side never triggers it. |
| `GET /api/posts/explore?sort=trending&scope=national` | `countryCode` | Explicit, opt-in national trending: filters the candidate pool to the viewer's country. If fewer than 5 national candidates exist, falls back to the global pool and reports `scopeFallback: true` - an honest "insufficient data" signal, never a thin or empty result presented as if it were complete. |
| `GET /api/discover/people` | `countryCode` | Authenticated-only "people/businesses near you" browse endpoint, filtered to the viewer's own `countryCode` plus the same block/mute exclusion pattern as `/api/search`. A viewer with no known country gets `{users: [], reason: "unknown_viewer_country"}`, never a guessed result. |
| `GET /api/admin/analytics/geography` | `countryCode`, `signupCountryCode`, `signupSource`, `signupPlatform`, `languageCode` | Admin-only aggregate breakdowns (Section 7). |

The feed is never replaced by a country-only ranking: the geo-boost is one
small multiplicative signal inside the existing engagement/recency score
(a unit test asserts a boosted local post cannot outrank a meaningfully
more-engaging non-local one), and national trending is an explicit opt-in
on top of the unchanged global leaderboard, not a default.

## 6. Professional profile

Four new free-text fields on `User` - `headline`, `company`, `position`,
`skills` (a string array) - editable from Settings (web) and the
equivalent native screens (Android/iOS), returned by
`GET /api/users/{username}` alongside the existing profile fields. The
pre-existing `category` field (and `professionalCategories.ts`) remains
ZRP's industry taxonomy and is deliberately not duplicated by these four
fields.

This is a profile-data addition only - it does not implement a
LinkedIn-style connections graph, endorsements, or a jobs board (ZRP
already has `Opportunities` for job/recruitment posts, which is unrelated
and untouched by this work).

## 7. Admin analytics

`GET /api/admin/analytics/geography` (admin-only, via `requireAdmin()`) -
companion to the existing `GET /api/admin/analytics`. Accepts the same
`?range=7|30|90|all` parameter (`src/lib/date-range.ts`) as the main
analytics endpoint. Returns:

- `geography.byCountry` / `geography.byRegion`: current snapshot across all
  users, grouped on `countryCode` (not range-filtered - this answers
  "where are our users today", not "who joined recently").
- `geography.newUsersByCountry`: range-filtered, grouped on
  `signupCountryCode` - immutable per-row, per Section 2.
- `geography.unknownCountryCount`: users with no resolvable `countryCode`.
- `acquisition.bySource`: range-filtered `signupSource` breakdown.
- `platform.byPlatform`: range-filtered `signupPlatform` breakdown.
- `language.byLanguage`: current `languageCode` breakdown (not
  range-filtered - a current preference, not a signup-time fact).

**Small-cohort privacy**: any bucket (country or language) with fewer than
3 users is folded into an `OTHER` bucket rather than named individually,
so a single-digit cohort can never be singled out in the UI. No per-user
row (email, name, exact IP) is ever included in this response - only
aggregate counts.

The admin UI (`src/app/admin/analytics/page.tsx`) renders these as a
country bar chart plus labeled bucket lists for region/acquisition/
platform/language, gated the same way every other admin page is
(`session.user.role`/`isAdmin`).

## 8. Privacy summary

- No raw IP address is ever persisted (Section 1).
- No individual geographic information is exposed to ordinary users -
  `countryCode` is used server-side for ranking/matching/targeting
  decisions; the only user-facing surface that reveals *any* geography is
  "people near you", which only ever shows people who share the viewer's
  *own* declared country, never anyone else's exact location.
- Admin analytics aggregates only, with small-cohort bucketing (Section 7).
- An unknown country is always `UNKNOWN`/`null` and treated as "no signal",
  never guessed or defaulted to a specific country.

## 9. Known limitations (not implemented in this pass)

Documented honestly rather than silently left out:

- **GPS-based "near me"**: not implemented. `countryCode`-based matching
  only; no location-permission flow exists on any client
  (`CLLocationManager`/`FusedLocationProviderClient` would be future work).
- **`/api/discover/people` has no UI yet** on web, Android, or iOS - it is
  a real, working, tested backend endpoint with no frontend consumer in
  this pass, a deliberate scope boundary rather than an oversight.
- **No "active/returning users" analytics metric**: would require a
  `lastActiveAt` write on every authenticated request (a meaningful
  performance/scope tradeoff not undertaken here); not fabricated as a
  placeholder number.
- **Admin geography analytics is web-only**, consistent with the existing
  admin backoffice having no native equivalent.
- Historical rows created before this migration carry `signupSource`/
  `signupPlatform` of `UNKNOWN` and `signupCountryCode`/`countryCode` of
  `null` until backfilled (see `scripts/backfill-country-codes.ts` for the
  `countryCode` backfill path); this is factual absence, not an error.
