# Contributing to ZRP Social

ZRP Social is proprietary software. This repository is publicly visible,
but it is **not an open-source contribution project** — see [LICENSE](LICENSE).

This document describes the development workflow expected of people who
are authorised to work on the codebase. It is published so that the
process is transparent and so that authorised contributors have one
reference to work from.

## Repository access

Write access is granted by the repository owner to authorised
contributors only. Unsolicited pull requests from outside that group are
not accepted, and may be closed without review.

If you are not an authorised contributor:

- To report a security vulnerability, follow [SECURITY.md](SECURITY.md).
  Do not file it publicly.
- To report a bug or ask a product question, use the in-product support
  flow (`/support`) or the contact page (`/contact`).
- To discuss licensing or a collaboration, contact ZRP through
  https://zrp.one.

## Branch-based development

- `main` is the integration branch and is the single source of truth.
- Never commit directly to `main`. Create a branch for every change.
- Use a short, descriptive branch name that says what the change does,
  for example `fix/story-upload-timeout` or `docs/security-policy`.
- Rebase or merge `main` into your branch before opening a pull request
  so that the diff reflects the current state of the codebase.

## Keep changes focused

One branch and one pull request should do one thing.

- Do not bundle unrelated fixes, refactors or formatting passes into a
  change. They make review harder and bisecting impossible.
- Do not reformat files you are not otherwise changing.
- Do not upgrade dependencies as a side effect of a feature change.
- If you find a second problem while working, note it and handle it
  separately.

## Respect module boundaries

The repository contains several independent clients that share one
backend. A change to one must not silently alter another:

| Path | What it is |
| --- | --- |
| `src/` | Next.js web application and the shared REST API |
| `server.js` | Custom Node server hosting Next.js and Socket.IO |
| `prisma/` | Database schema and migrations |
| `android-native/` | Native Kotlin / Jetpack Compose Android app |
| `ios-native/` | Native Swift / SwiftUI iOS app |
| `android/`, `ios/` | Capacitor WebView shells |

Database schema changes require a Prisma migration in
`prisma/migrations/`; never edit an applied migration in place. Changes
that alter an API response shape must be checked against the native
clients that consume it — `ios-native/PARITY.md` records which routes
each platform depends on.

## Verification before opening a pull request

Run what applies to the code you touched:

```bash
npm run lint     # ESLint (next lint)
npm run test     # Vitest suite
npm run build    # Next.js production build / type checking
```

The Vitest integration tests (`*.integration.test.ts`) expect a
reachable PostgreSQL instance via `DATABASE_URL`; the unit tests do not.

For the native modules:

```bash
# iOS
python3 ios-native/Tools/generate-localizations.py --check
python3 ios-native/Tools/validate-sources.py
```

Android and iOS builds run in GitHub Actions
(`.github/workflows/`) because the Android SDK and Xcode are not
available in every development environment.

Add or update tests when you change behaviour that can be tested. A new
API route, a new pure helper in `src/lib/`, or a bug fix with a clear
reproduction should generally come with a test.

## Pull requests

A pull request should state:

- What the change does, and why.
- Which platforms and surfaces it affects.
- How it was verified — which checks were run and what the result was.
- Any migration, environment variable or configuration step required to
  deploy it.
- Anything deliberately left out of scope.

Do not describe a check you did not run. If something could not be
verified in your environment, say so.

## Code review

Every change is reviewed before it reaches `main`. Reviewers look for
correctness, security, scope, and consistency with the surrounding code.

- Address review comments or explain why a suggestion does not apply.
- Push fixes as new commits during review rather than force-pushing over
  the history a reviewer is reading, unless the branch is yours alone.
- Do not merge your own change without review where the repository
  workflow requires one.

## Never commit secrets

No API key, database URL, signing key, service-account file, certificate
or access token belongs in this repository — not in source, not in tests,
not in a comment, not in a commit message, and not in a screenshot
attached to a pull request.

`.gitignore` excludes environment files and signing material, but that is
a safety net, not a control. Configuration is supplied at runtime through
environment variables.

If a secret is committed by accident, treat it as a security incident:
rotate it, then follow [SECURITY.md](SECURITY.md).

## Branding and design assets

The ZRP name, logo, colour system and visual identity are proprietary
(see [LICENSE](LICENSE) §5). Do not add, replace, recolour, redraw,
regenerate or reinterpret brand assets, and do not introduce a competing
visual identity. Brand changes are made only by the owner of the design
system.

## Content and data

- Do not introduce mock, seeded or placeholder catalogue data into
  product code. Features read real platform data.
- Do not commit real user data, including in test fixtures.

## Third-party licences

Any dependency you add must be licence-compatible with a proprietary
product, and its licence obligations must be respected. Prefer
permissively licensed packages. Do not copy source code from another
project into this repository without confirming that its licence allows
it and preserving any required notices.

Adding a dependency is a decision, not a detail — justify it in the pull
request.

## Code of conduct

Participation in this repository is subject to
[CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md).
