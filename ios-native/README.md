# ZRP Social — Native iOS

The genuine Swift / SwiftUI ZRP Social app.

Sibling to `android-native/` (the native Android app) and independent of
`ios/` (the Capacitor WebView shell that the web release tooling
generates). This module does not read from, write to, or depend on either
of those; CI asserts that.

## What it talks to

The same REST API the ZRP website itself calls — `src/app/api/**` in this
repository. There is no mobile backend, no gateway, and no parallel
contract, and no endpoint here was invented. Authenticated requests
replay the token from `POST /api/mobile/auth/login` as the exact cookie
NextAuth's browser session uses, which is what lets every existing route
serve a native client unmodified.

Every route the app depends on, and every feature that is still blocked
on one that does not exist, is recorded in **[PARITY.md](PARITY.md)**.

## Layout

```
ios-native/
  ZRPSocial.xcodeproj/       Xcode 16 project (synchronized folder group -
                             new files are picked up without editing it)
  Supporting/                Info.plist, entitlements (build inputs, not bundled)
  Tools/                     Localization generator + static validators
  ZRPSocial/
    App/                     Entry point
    Core/Network/            ApiClient, Endpoint, ApiError, Keychain, SessionStore
    Core/Localization/       L10n + generated L10nKeys.swift
    Core/Util/               Formatting, media heuristics, logging
    Models/                  Decodable models mirroring the real API shapes
    Data/                    Repositories - the only layer that builds Endpoints
    Features/                SwiftUI views + their ViewModels
    Resources/               11 generated .lproj bundles
    Assets.xcassets/         Official ZRP brand assets, copied byte-for-byte
```

Architecture is one direction only:

```
View  ->  ViewModel  ->  Repository  ->  ApiClient  ->  ZRP backend
```

A view never builds a request; a repository never knows about SwiftUI.

## Requirements

- Xcode 16 or newer (the project uses `objectVersion = 77` synchronized
  file-system groups)
- iOS 17.0 deployment target
- No third-party dependencies. Everything is Apple frameworks.

## Working on it

```bash
open ios-native/ZRPSocial.xcodeproj
```

Adding a Swift file anywhere under `ZRPSocial/` is enough — the project
uses a synchronized root group, so there is no project file to edit and
no merge conflict to resolve when two people add files at once.

### User-facing strings

Never write a literal in a view. ZRP already ships human translations for
11 languages in `src/lib/translations.ts`; the iOS `.strings` files and
the `L10nKey` enum are generated from that exact file:

```bash
# 1. add the key to Tools/ios-string-keys.txt (it must exist in the web
#    dictionary's `en` block - the generator fails loudly if it does not)
# 2. regenerate
python3 Tools/generate-localizations.py
```

For the handful of strings with no web counterpart (VoiceOver labels,
mostly), add them to `Tools/ios-extra-strings.json`. Those are emitted
into `en.lproj` only — other languages fall back to English until they
are translated, which is honest fallback rather than invented
translation.

### Before pushing

```bash
python3 Tools/generate-localizations.py --check   # no stale generated output
python3 Tools/validate-sources.py                 # keys, literals, braces, plists
```

Both run in CI (`.github/workflows/ios-native-build.yml`), followed by a
real `xcodebuild` of both Debug and Release on macOS.

## Brand

`Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png` and
`Assets.xcassets/ZrpLogo.imageset/ZrpLogo.png` are byte-for-byte copies of
the project's existing official assets (`ios/App/App/Assets.xcassets/…`
and `assets/logo.png`). The ZRP mark is never redrawn, recoloured,
regenerated, or reinterpreted here.
