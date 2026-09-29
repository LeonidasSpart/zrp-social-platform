# ZRP Advanced Search — Architecture

Status: backend contract fully implemented (`GET /api/search`, `src/lib/search/`),
Postgres trigram indexes in place, Web/Android/iOS UIs all rebuilt against the
new contract — see §8 for exact per-platform status.

## 1. What existed before this

Before this work, `GET /api/search` (`src/app/api/search/route.ts`) supported
exactly two categories (`users`, `posts`), no filters beyond the query string,
no sort options, and no pagination — `users` was hard-capped at 10 rows,
`posts` at 20, with no `cursor`/`nextCursor` in the response at all. Every
platform (Web's `/search` page, Android's `SearchViewModel` and three other
independent call sites, iOS's `SearchViewModel` plus two other independent
call sites) spoke this same minimal contract. iOS additionally had a
cursor-paginated hashtag-search-as-you-type mode
(`GET /api/hashtags/search`) bolted onto its `SearchView`, already shipped
in an earlier pass — that mode is untouched by this work and is folded into
the new `hashtags` category's own precedent instead of being duplicated.

## 2. Categories

Eight categories, each backed by a real, already-existing Prisma model (no
fabricated entities):

| Category | Backing model(s) | Query module |
| --- | --- | --- |
| `users` (People) | `User` | `src/lib/search/categories/users.ts` |
| `posts` | `Post` | `src/lib/search/categories/posts.ts` |
| `hashtags` | `Post.hashtags` (no dedicated table) | `src/lib/search/categories/hashtags.ts` |
| `communities` | `Community` | `src/lib/search/categories/communities.ts` |
| `news` | `NewsArticle` | `src/lib/search/categories/news.ts` |
| `music` | `MusicArtist`/`MusicAlbum`/`MusicTrack`/`MusicPlaylist` | `src/lib/search/categories/music.ts` |
| `opportunities` | `OpportunityListing` | `src/lib/search/categories/opportunities.ts` |
| `marketplace` | `Listing` | `src/lib/search/categories/marketplace.ts` |

**News** deliberately does not touch `NewsStory`/`NewsRendition`/
`NewsPublication` (the AI news-ingestion pipeline) — that pipeline publishes
its output as ordinary `Post` rows via editorial-feed accounts
(`User.isEditorialFeed`), which the `posts` category already covers.
Searching `NewsStory` too would surface the same content twice under two
different categories. `NewsArticle` (journalist-authored, admin-reviewed) is
the actual distinct, publicly browsable "News" entity, and this category
matches `GET /api/news`'s own visibility rule exactly
(`status: PUBLISHED`, `publishedAt` not null).

**Music** is the one category spanning four heterogeneous models with no
shared table — a search for an artist's name should surface the artist and
their albums/tracks together, so results are merged into one ranked list
tagged with a `kind` discriminator (`artist`/`album`/`track`/`playlist`)
rather than exposed as four sub-categories.

## 3. API contract

```
GET /api/search
  ?q=<query>                          required, min 2 chars
  &type=all|users|posts|hashtags|communities|news|music|opportunities|marketplace
  &sort=relevance|recent|engagement|trending
  &dateRange=any|24h|7d|30d|custom    (&dateFrom=, &dateTo= for custom, ISO dates)
  &language=<ISO 639-1>               (People/Posts: matched against the AUTHOR's languageCode)
  &country=<ISO 3166-1 alpha-2>       (matched against the normalized countryCode column)
  &media=image|video|gif|poll|none    (Posts only)
  &verified=true                      (has any badge)
  &professional=true                  (headline/company/position set)
  &creator=true                       (has a CreatorProfile)
  &community=<slug>                   (scopes Posts/Hashtags to one Community's hashtag)
  &cursor=<opaque>  &limit=<n, max 50>
```

`type=all` (the default) returns **the pre-existing `{users, posts}` shape
unchanged**, plus the same `{items[]}` shape for every other category as
additive top-level keys (`hashtags`, `communities`, `news`, `music`,
`opportunities`, `marketplace`), a `nextCursors` map, and `sort`. This is a
fixed-size teaser per category — `cursor` is ignored in this mode. A client
wanting more of one category switches to `type=<category>`, which honors
`cursor`/`limit` and returns `{results, nextCursor, category, sort}`.

This additive design is what keeps every pre-existing caller working
unchanged: Web's mention-autocomplete call, Android's `SearchViewModel`,
`OpponentSearchView`, `UserMultiSelectField`, `CreatePostViewModel` (all
`type=users` or `type=all`, reading only `.users`), and iOS's
`SearchViewModel`, `PlayChallengeView`'s opponent search,
`PeoplePickerView` — none of them read the new keys, so none of them break.

Filters that don't apply to a given category are silently ignored by that
category's query module rather than erroring (e.g. `media` has no effect
outside `posts`) — this lets a client send one consistent filter set
regardless of which category is active.

## 4. Ranking (`sort`)

Four modes, defined once and applied consistently:

- **relevance** (default): a deterministic text-match score
  (`src/lib/search/text-match.ts`) — exact match (100) > prefix (75) >
  whole-word (50) > substring (25) — as the **primary** key, with each
  category's own popularity counter (see below) only breaking ties among
  equally-good matches (`src/lib/search/ranking.ts`'s `relevanceScore`).
  This is purely a function of the query against the matched text: it
  cannot be gamed by inflating engagement, and a worse text match can never
  outrank a better one just because it's more popular.
- **recent**: `createdAt`/`publishedAt` descending, true DB-keyset
  pagination (see §5) — for every category except `hashtags` and `music`
  (see their own notes).
- **engagement**: each category's own real popularity counter, no time
  decay — Posts reuse `calculatePostEngagement` (`likes + comments*2 +
  reposts*3`, from `src/lib/feed/scoring.ts`, the exact formula
  `GET /api/posts/explore` already ships); People use follower count;
  Communities use `memberCount`; News/Opportunities/Marketplace use
  `views`; Music uses each kind's own counter (see below).
- **trending**: the same counter decayed by age. Posts reuse
  `calculateTrendingScore` + the existing 48h `TRENDING_WINDOW_HOURS`
  window unchanged. Every other category uses `ageDecayedScore`
  (`src/lib/search/ranking.ts`) with a 30-day half-life
  (`TRENDING_WINDOW_DAYS_NON_POST`) — deliberately longer than Posts',
  since jobs/listings/tracks/communities don't churn hour to hour the way
  a social feed does.

**Music's popularity counters are kind-specific, not cross-normalized**:
artist → follower count (`MusicFollow`), track → `playCount`, album/
playlist → track count (the closest real size signal either model has).
`engagement`/`trending` sort on the merged list ranks by each item's own
raw counter — a documented simplification, not an invented fairness
scheme across incompatible units.

## 5. Pagination

Two strategies, matching what already existed in this codebase rather than
inventing a third:

- **True DB keyset** (`src/lib/search/paginate.ts`'s `buildKeysetPage`,
  generalizing the existing `src/lib/pagination.ts` helper already used by
  Listings/Opportunities/Communities' own browse routes): `orderBy:
  [{field: "desc"}, {id: "desc"}]`, `cursor: {id: cursor}, skip: 1`,
  `take: limit + 1`. Used for `sort=recent` on every category except
  `hashtags` and `music`. No duplicates or gaps regardless of concurrent
  writes; an unrecognized/stale cursor resolves to an empty page rather
  than erroring (verified: a nonexistent cursor id returns 0 rows, not a
  Prisma exception).
- **Cached-ranked-list + numeric-offset cursor**
  (`src/lib/search/paginate.ts`'s `paginateRanked`), the same convention
  `GET /api/posts/explore` and `GET /api/hashtags/search` already
  established: a bounded candidate pool (`CANDIDATE_POOL_SIZE = 300`,
  widened slightly from explore's own 200 since a search `WHERE` clause
  naturally matches fewer rows) is fetched, scored, sorted, and cached in
  Redis for 5 minutes (`RANKED_CACHE_TTL_SECONDS`) under a cache key that
  includes the viewer id (see §6), sort, query, and filters. Pages are
  offset slices of that cached list — no duplicates/gaps *within the cache
  window*. Used for `sort=relevance|engagement|trending` on every
  category, and for **every** sort mode on `hashtags` and `music`.

`hashtags` has no per-hashtag timestamp to keyset-paginate "recent" by (no
dedicated table), so `sort=recent` falls back to `relevance` ordering
rather than returning an arbitrary/unstable order. `music` has no single
ordered source to walk a cursor across four heterogeneous tables, so every
sort mode there goes through the offset-cursor path — a documented
exception, matching the same reasoning.

An invalid/malformed offset cursor (`parseOffsetCursor`) resets to page 1
rather than erroring.

## 6. Security — enforced server-side, unconditionally

Every category module enforces its own visibility rules regardless of what
the client's `type`/filters request — a client cannot widen visibility by
omitting a filter:

- **Block/mute exclusion**: `getExcludedAuthorIds(viewerId)`
  (`src/lib/permissions.ts`, new — deduplicates a query that was
  previously copy-pasted inline across `/api/search`, `/api/posts/explore`,
  `/api/posts`, `/api/videos`, `/api/play/duels`) returns the union of
  everyone the viewer has blocked, everyone who has blocked the viewer, and
  everyone the viewer has muted. Applied to `users` and `posts`.
- **Banned accounts**: excluded from `users` (`banned: false`).
- **Private accounts**: `posts` uses the existing
  `viewablePostAuthorFilter(viewerId)` (public accounts, self, or an
  accepted follow relationship) — the same rule every other post-listing
  route already uses.
- **Premium/pay-per-view content**: `posts` runs every page slice through
  `applyPremiumGating` (`src/lib/premium-content.ts`) *after* the ranked
  list is read from cache, never baked into the cached payload — the same
  reasoning `GET /api/posts/explore` already documents (a purchase must
  show up immediately, not wait out a 5-minute cache window).
- **Per-entity status/expiry gating**, matching each entity's own existing
  browse route exactly rather than inventing a second rule:
  - `opportunities`: `status: ACTIVE` and (`expiresAt` null or in the
    future) — matches `GET /api/opportunity`.
  - `marketplace`: `status: ACTIVE` and not expired — matches
    `GET /api/listings`.
  - `news`: `status: PUBLISHED` and `publishedAt` not null — matches
    `GET /api/news`.
  - `music`: tracks require `status: PUBLISHED`; playlists require
    `isPublic: true` (private playlists never surface in anyone else's
    search results). Artists/albums have no publish-workflow status
    column in the schema.
  - `communities`: no privacy model exists on `Community` (every community
    is publicly listable; `CommunityMember` only gates membership/role,
    not read access), so no additional filter is needed or applied.
- **Cache correctness under multi-tenancy**: every `paginateRanked` cache
  key for `users`/`posts` includes `viewerId ?? "anon"` — a cached ranked
  list is never shared across viewers with different block/mute lists or
  different premium-purchase state. (`communities`/`news`/`music`/
  `opportunities`/`marketplace` have no viewer-dependent visibility, so
  their cache keys omit it; `hashtags`' tally already excludes
  banned/unpublished/scheduled content at the source, so it too omits it.)
- **Community scoping** (`&community=<slug>`): an unrecognized slug
  resolves to a filter that matches nothing, never to "no scoping applied"
  — a viewer who believes they're scoped to one community must never see
  everyone's posts because the slug didn't resolve.

## 7. Database

Migration `20260928120000_add_search_trigram_indexes` adds `pg_trgm` and
`GIN(gin_trgm_ops)` indexes on every text field these categories match
against (`User.username/name/headline/company`, `Post.content`,
`Community.name/description`, `MusicArtist.displayName`,
`MusicAlbum.title`, `MusicTrack.title`, `MusicPlaylist.name`,
`OpportunityListing.title/description`, `Listing.title/description`,
`NewsArticle.title/excerpt`), plus plain `GIN` indexes on the existing
`Post.hashtags`/`OpportunityListing.skills` array-containment filters.
`gin_trgm_ops` accelerates both substring matching (`ILIKE '%term%'`,
i.e. Prisma's `contains`) and `similarity()`-based fuzzy matching — a plain
btree index cannot accelerate either.

These are hand-authored raw SQL (`CREATE INDEX CONCURRENTLY IF NOT
EXISTS`, non-transactional so it doesn't lock the table during the build),
not `@@index` in `schema.prisma` — the `gin_trgm_ops` operator class needs
the `postgresqlExtensions`/`extendedIndexes` preview features, which this
schema deliberately doesn't enable (see the Prisma-version-conservatism
note already in `schema.prisma`'s datasource block). `prisma migrate dev`
replays the full migration history before diffing the next migration, so
an index that only exists in raw SQL is never dropped or fought by a
future migration.

## 8. Platform parity

| Platform | Status |
| --- | --- |
| Web | Rebuilt (`src/app/search/page.tsx`): all 8 categories, filters, sort, cursor pagination via "Load more", loading/empty/error states, reuses `PostCard`/`ListingCard`/`opportunity/ListingCard` rather than duplicating result rendering. |
| Android | Rebuilt (`SearchViewModel`/`SearchScreen`): all 8 categories, sort dropdown, filter panel, real cursor pagination via `loadMore()` (following `OpportunityViewModel`'s own pattern), reuses `PostCard`/`OpportunityCardView`/`ListingCardView`. Music uses a new flat, kind-discriminated `SearchMusicResult` since Gson has no polymorphic dispatch and the backend merges 4 models with no shared table. |
| iOS | Rebuilt (`SearchViewModel`/`SearchView`): same 8 categories/sort/filters/pagination, reuses `Community`/`NewsArticle`/`Opportunity`/`Listing`/`PostAuthor` (already `Decodable` with graceful defaults for the fields Advanced Search's leaner `SELECT` omits) and adds the same kind-discriminated `SearchMusicResult` for Music. The pre-existing hashtag search-as-you-type mode (`GET /api/hashtags/search`) is untouched and still takes priority for a "#"-led query. |

## 9. Known limitations (honestly documented, not hidden)

- Score-based sorts (`relevance`/`engagement`/`trending`) are bounded to a
  300-candidate pool per category — the same depth tradeoff
  `GET /api/posts/explore` and `GET /api/hashtags/search` already ship
  with. A query matching more than 300 rows will not surface its
  301st-best match under these sorts; `sort=recent` has no such bound.
- `hashtags` has no `sort=recent` (falls back to `relevance`) and `music`
  has no true keyset pagination for any sort — both documented in §5, not
  silently degraded.
- Music's `engagement`/`trending` ranking mixes follower counts, play
  counts, and track counts on one scale without cross-unit normalization
  (§4) — a pragmatic MVP simplification, not a claimed fairness guarantee.
- `Post` has no `language` column, so the `language` filter on `posts`
  keys off the *author's* `languageCode`, not the post's actual written
  language (which ZRP does not track anywhere).
