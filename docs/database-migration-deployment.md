# Database migration & deployment safety (P0-B audit)

Audit of how the Prisma schema reaches production and what happens when a
migration is added, fails, or runs against a database in an unknown state.
Every conclusion below is tagged with how it was established:

- **PROVEN FROM CODE** — read directly from files in this repository.
- **PROVEN FROM MIGRATION TEST** — reproduced against a disposable local
  PostgreSQL 16 instance (`prisma/schema.prisma` + `prisma/migrations/`
  unmodified).
- **PROVEN FROM CI CONFIGURATION** — read directly from `.github/workflows/`.
- **REQUIRES RAILWAY VERIFICATION** — cannot be determined from the
  repository; must be checked in the Railway dashboard / against the live
  production database.

## 1. Current deployment flow, as it exists today

- **No file in this repository runs `prisma migrate deploy` automatically.**
  PROVEN FROM CODE: `package.json` only wires `postinstall` → `prisma
  generate` (schema.prisma:1, package.json:11); `npm start` runs
  `NODE_ENV=production node server.js` and nothing in `server.js` touches
  the schema engine — its only Prisma calls are ordinary query-layer calls
  plus the legacy plaintext→bcrypt password migration
  (`legacy-passwords.js`, unrelated to schema). Confirmed by `grep -n
  "prisma\|migrate" server.js`: only `prisma.<model>.*` queries and
  `runLegacyPasswordMigrationAtStartup`.
- **No GitHub Actions workflow runs a migration.** PROVEN FROM CI
  CONFIGURATION: none of the five workflows under `.github/workflows/`
  (`android-native-build`, `android-release`, `ios-native-build`,
  `cron-delete-scheduled-accounts`, `cron-news-pipeline`) reference
  `prisma`, `migrate`, or `railway`.
- **No `railway.json`/`railway.toml`/`Dockerfile`/`Procfile`/`nixpacks.toml`
  existed in the repo before this change.** PROVEN FROM CODE (directory
  listing). That means Railway has been building this service purely by
  Nixpacks auto-detection from `package.json` (`npm install` → `npm start`)
  with whatever build/start/pre-deploy commands are set in the Railway
  **dashboard** — none of that is visible from GitHub.
- **The only documented migration step is a manual, human-run command** in
  `README.md:438` (`npx prisma migrate deploy`, part of the *local dev
  setup* instructions, not a production runbook) and
  `README-ZRP-MUSIC.md:26`. `docs/zrp-news-network.md:128` documents a
  production requirement as **"`prisma migrate deploy` (or `db push`)"** —
  i.e. the two are treated as interchangeable in existing project
  documentation. Section 3 below shows why that is dangerous.

**Conclusion:** today, shipping a schema change to production is an
entirely manual, undocumented, unenforced step performed by whoever has
`DATABASE_URL` and remembers to run it, at a point in the deploy relative
to the app boot that isn't fixed by any config. There is currently no
mechanism by which two Railway instances could run a migration
concurrently, because *nothing* runs a migration automatically — but that
also means there is no gate preventing a new application version from
starting against an old/partial schema.

## 2. `migration_lock.toml` was missing

PROVEN FROM CODE / git history: `git log --all -- prisma/migrations/migration_lock.toml`
returns nothing — the file has never existed in this repository, and it is
not in `.gitignore`. This is the file Prisma uses to pin the migration
history to one provider (`postgresql`) and refuse to apply migrations
generated for a different one. Its absence didn't break `prisma migrate
deploy` in testing (Prisma tolerates a missing lock file at deploy time),
but it removes a real safety net and is non-standard — every project
created or maintained with `prisma migrate dev` has one. **Fixed** in this
change (see Section 6).

## 3. The migration history does not reproduce the schema — the core finding

PROVEN FROM MIGRATION TEST. `prisma/schema.prisma` defines **82 models**.
`prisma/migrations/` contains **11 migrations** as of this update (2 added
since this section was first written - `add_consumed_payment_transaction`
and `add_conversation_clearance`, both audited in Section 4 below; the
finding this section documents is unaffected by either, since neither
creates `User` or `Post`):
`zrp_music`, `music_album_track_order`, `add_fcm_token`,
`zrp_news_network`, `add_group_chat_conversations`, `news_gaming_category`,
`add_ambassador_program`, `play_reaction_sequence_types`,
`add_consumed_payment_transaction`, `ambassador_code_of_conduct_acceptance`,
`add_conversation_clearance`. None of them contains `CREATE
TABLE "User"` or `CREATE TABLE "Post"` (checked directly — `grep -rl
'CREATE TABLE "User"' prisma/migrations/` matches nothing), and the first
migration's own SQL (`ALTER TABLE "MusicArtist" ADD CONSTRAINT ...
REFERENCES "User"("id")`) assumes `User` already exists.

**Reproduced against a disposable PostgreSQL 16 database:**

```
$ npx prisma migrate deploy   # against an empty database
Applying migration `20260902190000_zrp_music`
Error: P3018
Database error: ERROR: relation "User" does not exist
```

**This means the migration history, on its own, cannot build the current
schema on a truly fresh database.** It only ever "worked" on top of a
database that already had the ~73 tables the migrations don't create —
which is only possible if those tables were created some other way (most
likely `prisma db push`, which `docs/zrp-news-network.md` itself lists as
an accepted alternative to `migrate deploy`).

That fact produces two mutually exclusive possibilities for what
production actually looks like right now, and the repository gives no way
to tell which one is true:

- **Production's `_prisma_migrations` table was manually baselined** (an
  operator ran `prisma migrate resolve --applied <name>` for each migration
  at some point, without that action being recorded anywhere in
  git). In this case `prisma migrate deploy` works correctly going forward
  — reproduced below.
- **Production has never had `_prisma_migrations` baselined**, and its
  ~73 pre-existing tables were synced purely with `db push`. In this case
  the *very first* `prisma migrate deploy` run against it will fail
  immediately:

  ```
  $ npx prisma db push                 # simulates a db-push-managed prod DB
  🚀  Your database is now in sync with your Prisma schema.
  $ npx prisma migrate deploy
  Error: P3005
  The database schema is not empty. Read more about how to baseline an
  existing production database: https://pris.ly/d/migrate-baseline
  ```

  This fails *closed* (no partial/corrupting writes — Prisma refuses to
  touch a non-empty, untracked schema) but it does mean a production
  release could be blocked the first time anyone tries to run migrations
  through the normal path.

Baselining, once done correctly, does produce a healthy ongoing state —
reproduced by resolving all migrations as applied against the db-push-synced
database above:

```
$ for m in <each migration name>; do
    npx prisma migrate resolve --applied "$m"
  done
$ npx prisma migrate status
Database schema is up to date!
```

**REQUIRES RAILWAY VERIFICATION (the single most important check in this
audit):** connect to the production database and run:

```sql
SELECT migration_name, finished_at, rolled_back_at
FROM "_prisma_migrations"
ORDER BY started_at;
```

- If the table doesn't exist, or exists but doesn't contain every migration
  names each with a non-null `finished_at` and null `rolled_back_at`,
  production is **not** correctly baselined, and the pre-deploy migration
  step added in this change (Section 6) **will fail on the next deploy**
  until an operator baselines it (see the two `prisma migrate resolve`
  forms above — never `prisma migrate reset`, which is destructive).
- If it does, production is already in a healthy, resolvable state and no
  further action is needed before the next deploy.

I do not have production database credentials from this sandbox, so this
could not be checked directly, and it is not safe to guess.

## 4. Auditing the recent migrations individually

None of the migrations audited here contains `DROP TABLE`, `DROP COLUMN`, a type
narrowing, or a nullable→non-nullable transition on a column without a
default. Specifically:

| Migration | Risk review |
| --- | --- |
| `zrp_music` | New tables only, all FKs reference pre-existing tables. Safe. |
| `music_album_track_order` | Two nullable `ADD COLUMN`s (`coverKey`, `trackNumber`). Additive, safe on any table size (Postgres 11+ adds a nullable/constant-default column as a metadata-only operation, no table rewrite). |
| `add_fcm_token` | New table + FK to `User`. Safe. |
| `zrp_news_network` | `ALTER TABLE "User" ADD COLUMN "isEditorialFeed" BOOLEAN NOT NULL DEFAULT false` — safe under Postgres 11+ (constant default, no rewrite/lock beyond the metadata change) plus 8 new tables. Safe. |
| `add_group_chat_conversations` | `ALTER TABLE "Message" ... ALTER COLUMN "receiverId" DROP NOT NULL` — this *widens* a constraint (nullable), which is always safe and reversible; existing rows are untouched. New `conversationId` column added nullable, no backfill — existing DM rows correctly have no conversation, matching the feature being new. Safe. |
| `news_gaming_category` | `ALTER TYPE ... ADD VALUE IF NOT EXISTS` on two enums, no use of the new value in the same migration (which Postgres would reject inside one transaction). `IF NOT EXISTS` makes it idempotent/safe to re-run. Safe. |
| `add_ambassador_program` | New table + two FKs to `User`. Safe. |
| `play_reaction_sequence_types` | Same `ADD VALUE IF NOT EXISTS` pattern as above. Safe. |
| `add_consumed_payment_transaction` | New table only (`ConsumedPaymentTransaction`, no FKs). Safe. |
| `ambassador_code_of_conduct_acceptance` | Two nullable `ADD COLUMN`s. Safe. |
| `add_conversation_clearance` | New table + two FKs to `User`, plus one unique and one non-unique index. Safe. |

**Conclusion: no destructive or unsafe operation exists in the tracked
migrations themselves.** The entire P0 risk is in Section 3 — the
migration *history* is incomplete relative to the schema, not that any
individual migration is badly written.

## 5. What happens when a migration fails partway

PROVEN FROM MIGRATION TEST. Reproducing the Section 3 fresh-database
failure and inspecting `_prisma_migrations` directly:

```
migration_name           | finished_at | rolled_back_at | applied_steps_count
20260902190000_zrp_music |    (null)   |     (null)     |         0
```

Two things follow from this:

1. Postgres rolled back the failed transaction itself (Prisma wraps each
   migration file in one transaction by default), so a failure never
   leaves a half-applied migration's DDL in place.
2. But the **migration history itself is left "dirty"**: the row is
   neither `finished_at` (succeeded) nor `rolled_back_at` (acknowledged
   as rolled back). Every subsequent `prisma migrate deploy` — including
   an identical retry — fails immediately with the same `P3018` without
   attempting anything, until an operator explicitly runs `prisma migrate
   resolve --rolled-back <name>` (safe, since Postgres already rolled the
   DDL back) or fixes the root cause and runs `--applied` if it actually
   did apply outside a transaction. **This is a manual, human recovery
   step — there is no automatic self-heal.**

With the pre-deploy command added in Section 6, this failure mode blocks
the deploy (Railway does not cut traffic to the new release if its
pre-deploy command exits non-zero) rather than starting a new app instance
against a half-migrated schema — but an operator must still intervene to
unstick the migration history before the *next* deploy attempt can even
try again.

## 6. What was changed, and why

Per the brief, the fix is **not** "add `prisma migrate deploy` to `npm
start`" — that would run the schema engine on every instance on every
boot, with no concurrency protection if Railway ever scales this service
beyond one instance, and no way to stop a broken app version from starting
merely because its migration attempt failed after the fact. Instead:

1. **`prisma/migrations/migration_lock.toml`** (new file) — restores the
   provider lock (`provider = "postgresql"`) that should exist per Prisma's
   own convention and was missing (Section 2). Verified it doesn't change
   `prisma validate` / `prisma migrate status` output.

2. **`railway.json`** (new file) — declares a Railway **pre-deploy
   command**: `npx prisma migrate deploy`. This is Railway's dedicated
   release-phase mechanism, distinct from the app's start command: it runs
   once, in a single ephemeral container, *before* the new deployment's
   instances are given traffic; the previous deployment keeps serving
   traffic if it fails. That satisfies the requirements in the brief that
   don't fit a startup hook: one execution per deploy (not per instance,
   so no concurrent-migration race even if this service is scaled to N
   replicas), and a hard gate — a failed migration blocks the rollout
   instead of shipping a new app version against an incomplete schema.

   **REQUIRES RAILWAY VERIFICATION**, and this is important enough to
   repeat: I could not reach `docs.railway.com` from this sandbox (network
   egress to that host is blocked) to re-confirm this feature's exact
   current behavior against Railway's live documentation, so this is based
   on the documented `deploy.preDeployCommand` key in Railway's
   config-as-code schema rather than a freshly re-verified source. Before
   relying on this, confirm directly in the Railway dashboard:
   - That this service is actually configured to read `railway.json`
     (config-as-code) rather than having every relevant setting overridden
     by dashboard values, which take precedence over the file.
   - That the pre-deploy command shows up under the service's Settings →
     Deploy tab after this merges, and that a deliberate failing run (e.g.
     temporarily pointing at a bad `DATABASE_URL` in a preview
     environment) actually blocks traffic cutover as described.
   - The `_prisma_migrations` baseline state from Section 3 — do this
     **before** merging/deploying this change, since an unbaselined
     production database will make the very next deploy's pre-deploy step
     fail (safely — the old release keeps serving — but the deploy won't
     go out until it's fixed).

3. **This document.**

Nothing else was touched: `server.js`, `package.json` scripts, the
existing migration files, and `prisma/schema.prisma` are all unmodified.
`docs/zrp-news-network.md`'s "`prisma migrate deploy` (or `db push`)" line
is News Network documentation (out of this task's scope) but is flagged
here because Section 3 shows those two are not interchangeable — that
line should be corrected by whoever owns that surface.

## 7. Commands run and results

```
$ npx prisma validate
The schema at prisma/schema.prisma is valid 🚀

$ npx prisma migrate deploy         # fresh database
Error: P3018 — relation "User" does not exist   (Section 3)

$ npx prisma db push --skip-generate   # simulate db-push-managed prod
🚀  Your database is now in sync with your Prisma schema.

$ npx prisma migrate deploy         # against the db-push-synced database
Error: P3005 — the database schema is not empty   (Section 3)

$ npx prisma migrate resolve --applied <each migration>
Migration <name> marked as applied.   (one per migration)

$ npx prisma migrate status         # after baselining
Database schema is up to date!

$ npx prisma validate && npx prisma migrate status   # with migration_lock.toml restored
The schema at prisma/schema.prisma is valid 🚀
(status output unchanged — file has no effect on deploy-time behavior)
```

All tests ran against a disposable local PostgreSQL 16 instance created
and dropped for this audit only; the real production database was never
connected to.

## 8. Open items (not resolved by this change)

- **REQUIRES RAILWAY VERIFICATION**: the `_prisma_migrations` baseline
  state in production (Section 3) — this determines whether the next
  deploy's pre-deploy command succeeds or blocks.
- **REQUIRES RAILWAY VERIFICATION**: whether `railway.json` config-as-code
  is actually honored by this service's Railway project, and Railway's
  current, live-documented behavior for `preDeployCommand` (could not be
  re-checked against `docs.railway.com` from this sandbox — see Section 6).
- **NOT VERIFIED**: whether Railway currently runs multiple instances
  (replicas) of this service. If it does today and a migration were ever
  invoked from application startup instead of the pre-deploy step added
  here, concurrent migration attempts would be possible; this change
  avoids that by construction, but the replica count itself was not
  checked (no in-repo signal for it).
- **Not attempted**: fabricating a synthetic "baseline" migration that
  recreates the ~73 untracked tables. Whether that's needed at all depends
  entirely on the unverified production state above; writing one blind,
  from a sandbox with no access to the real schema or its data, risks
  doing the wrong thing to a database I cannot inspect. This should be
  done — if it turns out to be needed at all — by whoever performs the
  Railway verification in Section 3, using `prisma migrate diff` against
  the real production database once its state is known.

## 9. Prisma connection pool footprint (final closure-pass addendum)

PROVEN FROM CODE. Every process this application runs is `node server.js`
(`npm start`/`npm run dev` both boot through it — see CLAUDE.md), and
exactly two `PrismaClient` instances exist per such process, confirmed by
`grep -rn "new PrismaClient" --include=*.js --include=*.ts .` outside
`node_modules`:

1. **`server.js`'s own client** (its `const prisma = new PrismaClient({
   adapter: new PrismaPg({ connectionString: ..., connectionTimeoutMillis:
   5000 }) })`) — used for socket-relay authorization queries and the
   boot-time legacy-password migration. **No `max` is set on its `PrismaPg`
   adapter**, so it takes `pg`'s own `Pool` default, which is **10**.
2. **`src/lib/db.ts`'s singleton** (`globalForPrisma.prisma`) — used by
   every Next.js API route (~220 handlers) via the same process, since
   `server.js` hands API requests to Next's own request handler in-process
   rather than spawning a separate server. Its adapter sets `max: 20`
   explicitly.

**Worst case per process (per Railway replica): 10 + 20 = 30 concurrent
Postgres connections**, if both pools are simultaneously saturated. This
is the number that matters — not "singleton", which is true of each
client individually but says nothing about the combined footprint of the
two that coexist in the same process.

At today's confirmed single-replica deployment, that is the whole
picture: **30 connections, worst case, total** against whatever
`max_connections` the production Postgres instance is configured with
(unmanaged from this repository - **REQUIRES RAILWAY VERIFICATION** to
confirm the actual configured limit and how much of it other consumers,
e.g. a human running `prisma studio` against the same database, already
use). Standard PostgreSQL ships with `max_connections = 100`; 30 is 30%
of that default, leaving real headroom, but this repository cannot
confirm Railway's managed Postgres offering uses that same default rather
than a lower per-plan cap.

**If this service is ever scaled to N replicas**, the worst-case footprint
scales linearly with it: `30 × N`. N=3 (90 connections) already consumes
nearly the entire default 100-connection budget before any other consumer
(an admin running Studio, a one-off script, a second service sharing the
same database) is counted — at that point either the two pools' `max`
values need to shrink, or the database's own `max_connections` needs to
be confirmed to exceed the actual replica count's total. This is a real,
quantifiable constraint on how far this service can scale horizontally
without a database-side change, not merely a theoretical one - it should
be re-checked before Railway's replica count is ever raised above 1, and
is exactly the kind of fact the Socket.IO Redis adapter and the Redis-
backed call registry (see the closure-pass report) were made
multi-instance-safe in anticipation of.
