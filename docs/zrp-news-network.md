# ZRP News Network

An automated **editorial** system for ZRP: openly-labelled ZRP news desks
that publish concise original summaries of real reporting, every summary
attributed and linked back to its sources.

It is not a bot farm. There are no invented people, no fabricated
engagement, and no copied articles anywhere in it.

---

## What it is, in one pass

```
NewsSource ──poll──▶ NewsStorySource ──dedupe──▶ NewsStory
                                                    │
                                          summarise │ (validated)
                                                    ▼
                                              NewsRendition  (one per language)
                                                    │
                                          schedule  │
                                                    ▼
                                             NewsPublication ──▶ Post
```

A `Post` is the output on purpose. It means following, liking,
commenting, reposting, bookmarking, reporting, muting, blocking, search,
hashtags and moderation all work on news exactly as they do on anything
else, with no parallel social system and no exemptions.

---

## The rules it enforces in code

| Rule | Where it lives |
| --- | --- |
| Never invent a fact, figure, quote or link | `grounding.ts` — every rendition is validated before it can publish; a failure is `FAILED`, never a fallback summary |
| One event, one post — not fifteen | `dedupe.ts` (exact fingerprint + fuzzy match) and the unique `idempotencyKey` on `NewsPublication` |
| Never publish the same story twice | `idempotencyKeyFor(storyId, language)` under a UNIQUE constraint — a database guarantee, not a planner promise |
| Never reproduce an article | Only the headline and the publisher's own syndicated abstract are ever stored, capped at 600 characters; the article page is never fetched |
| Respect robots.txt, rate limits, ETags | `robots.ts`, `ingest.ts` (conditional GET, one request per source per cycle, exponential backoff) |
| Never reuse an image without permission | `NewsSource.allowImages` defaults false; the post publishes as text plus source link |
| Say when a story is not settled | `NewsConfidence` (CONFIRMED / DEVELOPING / UNCONFIRMED), rendered in the post in all four languages |
| Sensitive stories wait for a person | `classify.ts` flags them; `requireHumanReviewForSensitive` (default on) keeps them out of automation |
| No feed floods anyone | Per-feed minimum gap and daily cap, per-region and per-topic caps of a third of a cycle, quiet hours in the feed's own timezone |
| Publish nothing rather than filler | Every stage returns empty on failure; a quiet cycle produces no posts |
| No artificial engagement | The system only ever creates posts. It never likes, follows, reposts, comments or inflates a count |

---

## Editorial identities

Provisioned from the roster in `src/lib/news/feeds.ts`: global desks,
regional desks, travel desks and one desk per country in
`src/lib/news/config.ts` — 100+ in total.

Every one of them:

- is named `ZRP <desk>`, never a human name
- says in its bio that it is an official automated ZRP editorial feed
- carries `User.isEditorialFeed` and the `editorial` badge (`Rss` glyph,
  distinct from the human `journalist` badge)
- has **no password**, and an email in the RFC 2606 `.invalid` TLD, so no
  sign-in flow can ever authenticate as one
- uses the **existing** official ZRP assets (`/icon-512.png`,
  `/og-image.png`) unmodified — no ZRP logo is created, recoloured or
  regenerated anywhere in this system
- is created **disabled**

## Travel News in four languages

Travel is a first-class category. `ZRP Travel`, `ZRP Travel Français`,
`ZRP Travel Deutsch` and `ZRP Travel Italiano` are separate identities
because ZRP posts carry no per-post language, so one multilingual account
would show every reader all four languages interleaved.

Each language is **written from the source material**, not translated
from another translation, and each is validated independently. English is
generated first and gates the rest: if the English summary cannot be
grounded, no localisation is attempted at all.

---

## Operating it

### Admin console

`/admin/news-network` (staff can read; full admins can act). Every number
on it is a live database count.

- pause/resume the whole system, run a cycle now
- enable/disable feeds, tune per-feed cadence and daily caps
- add, verify, enable/disable, clear backoff on sources
- inspect the editorial queue: source material, every attribution, every
  rendition including failures and their validation reports
- reject a story, publish a correction, publish a held story manually
- publication history, and take any post down with a recorded reason

Every mutating action is recorded through the existing `AuditLog`.

### API surface

| Route | Access |
| --- | --- |
| `GET /api/cron/news-pipeline` | `CRON_SECRET` (fails closed) |
| `GET /api/admin/news-network/status` | staff |
| `GET/PATCH /api/admin/news-network/settings` | admin |
| `GET /api/admin/news-network/feeds`, `PATCH .../feeds/[id]` | staff / admin |
| `POST /api/admin/news-network/feeds/provision` | admin |
| `GET/POST /api/admin/news-network/sources`, `PATCH/DELETE .../sources/[id]` | staff / admin |
| `POST /api/admin/news-network/sources/[id]/verify` | admin |
| `POST /api/admin/news-network/sources/seed` | admin |
| `GET /api/admin/news-network/stories`, `GET/PATCH .../stories/[id]` | staff / admin |
| `GET /api/admin/news-network/publications`, `DELETE .../publications/[id]` | staff / admin |
| `POST /api/admin/news-network/run` | admin, rate limited |

### Schedule

`.github/workflows/cron-news-pipeline.yml` calls the cron route every two
hours. That is the *cycle* cadence, not a per-feed one: each cycle spreads
its publications across the following ~150 minutes, and every feed still
has its own gap and cap.

### Deployment requirements

| Requirement | Why |
| --- | --- |
| `prisma migrate deploy` (or `db push`) for `20260908220000_zrp_news_network` | new tables and the `User.isEditorialFeed` column |
| `CRON_SECRET` set on the app **and** as a repository secret | the cron route fails closed without it |
| `DEEPSEEK_API_KEY` | summarisation and localisation |
| `REDIS_URL` | the pipeline lock. **Without Redis the pipeline refuses to run** — see `lock.ts` for why this fails closed |
| Nothing else | no new npm dependency was added |

---

## Pilot activation

Do this in order. Do not skip to step 7.

1. **Deploy** the migration and confirm the app starts.
2. **Seed sources** — Sources tab → *Install the starter source list*.
3. **Verify every source** — press *Verify* on each one. It performs a
   single live fetch and reports the item count and whether robots.txt
   permits it, **without publishing anything**. Disable or correct
   whatever fails. ⚠️ The seeded feed URLs were never reachable from the
   build environment, so treat all of them as unverified until this step
   passes.
4. **Provision pilot feeds** — Feeds tab → *Provision pilot feeds*. This
   creates ZRP News World, ZRP News Switzerland / France / Germany /
   Italy and ZRP Travel, all **disabled**.
5. **Enable one feed only** — ZRP News World. Leave the rest off.
6. **Run one cycle manually** and read the results: the editorial queue
   (does the summary match the sources?), the publication (is attribution
   present and correct?), the post itself in the real feed.
7. Only once that looks right, enable the remaining pilot feeds and let
   the schedule run.
8. Watch source health, failed summaries and duplicates prevented for
   several days before provisioning any more of the roster.
9. Expand a **few feeds at a time**, never the whole roster at once.

Un-pausing the automation (`paused` ships `true`) is the last switch, not
the first.

---

## Tests

`src/lib/news/__tests__/` and
`src/app/api/cron/news-pipeline/__tests__/`.

Unit coverage: RSS/Atom parsing, robots.txt precedence and wildcards,
duplicate detection, classification, confidence, ranking, groundedness
validation, four-language post composition, scheduling and distribution,
backoff, the roster's safety properties, and cron authorization.

Integration coverage (real Postgres): idempotency under a retried cycle,
publication into a real `Post`, refusal to publish through a disabled feed
or a banned account, takedown, visible corrections, provisioning
idempotency and username protection — plus an end-to-end cycle proving
that three outlets reporting one event produce **one** post with three
attributions, and that a failed source, a failed summary or a quiet hour
produces nothing at all.
