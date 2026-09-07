# ZRP Social — Native iOS Functional Parity Matrix

Living audit of what ZRP actually does today across the **backend**, the
**web app**, the **native Android app** (read-only reference), and this
**native iOS app**.

> **Scope note.** Everything in this document was verified by reading the
> real source in this repository — `src/app/api/**/route.ts`,
> `prisma/schema.prisma`, `src/app/**/page.tsx`, and
> `android-native/app/src/main/java/one/zrp/social/mobile/**`. Nothing here
> is carried over from documentation, prior conversations, or assumption. A
> feature that only appears in a README is not recorded as existing.

## Isolation

`android-native/` is a separate, actively developed project owned by a
different engineering agent. It is **read-only** for iOS work: it was read
and audited to understand real API usage, and nothing in it — sources,
Gradle files, resources, signing, Firebase config, or its workflow
(`.github/workflows/android-native-build.yml`) — is modified by the iOS
project. `ios-native/` is a self-contained sibling module, exactly as
`android-native/` is a sibling of the Capacitor `android/` shell.

## Legend

| Status | Meaning |
| --- | --- |
| `IMPLEMENTED` | Wired to the real backend and works end to end on that platform. |
| `PARTIAL` | Real backend calls, but a meaningful part of the feature is absent. |
| `MISSING` | Not built on that platform yet, though the backend supports it. |
| `WEB-ONLY` | Deliberately web-only; no mobile surface exists on any platform. |
| `STAFF/ADMIN` | Gated to admin/staff roles server-side; out of scope for the consumer app. |
| `BLOCKED` | Cannot be completed natively without a backend capability that does not exist yet. See [Blocked](#blocked-items). |

**A screen existing is not implementation.** Nothing below is marked
`IMPLEMENTED` for iOS on the strength of a view compiling, a button being
present, or a test passing in isolation — only on the real route being
called and the real response being handled.

---

## Matrix

### Authentication & session

| Feature | Backend route(s) | Web | Android | iOS | Status (iOS) |
| --- | --- | --- | --- | --- | --- |
| Email/username + password login | `POST /api/mobile/auth/login` | via NextAuth Credentials | ✅ | ✅ | IMPLEMENTED |
| Session restore on launch | `GET /api/auth/session` | ✅ | ✅ | ✅ | IMPLEMENTED |
| Secure session storage | — | httpOnly cookie | EncryptedSharedPreferences | Keychain (`kSecAttrAccessibleAfterFirstUnlock`) | IMPLEMENTED |
| Logout / session teardown | — (local + `DELETE /api/push/fcm`) | ✅ | ✅ | ✅ (local; push teardown pending Phase 11) | PARTIAL |
| Session expiry handling (401) | any authed route | ✅ | ✅ | ✅ (401 → clear + return to login) | IMPLEMENTED |
| Registration | `POST /api/auth/register` | ✅ | ✅ | ⬜ | MISSING (Phase 3b) |
| Live username availability | `GET /api/auth/check-username` | ✅ | ✅ | ⬜ | MISSING (Phase 3b) |
| Email verification | `POST /api/auth/resend-verification`, `GET /api/auth/verify` | ✅ | ✅ | ⬜ | MISSING (Phase 3b) |
| Forgot / reset password | `POST /api/auth/forgot-password`, `/api/auth/reset-password` | ✅ | ✅ | ⬜ | MISSING (Phase 3b) |
| Onboarding | `POST /api/user/onboarding-complete` | ✅ | ✅ | ⬜ | MISSING (Phase 3b) |
| Google sign-in | NextAuth `google` provider (web OAuth) | ✅ | ❌ | ❌ | BLOCKED — [B1](#b1-native-oauth-google--apple) |
| **Sign in with Apple** | NextAuth `apple` provider (web OAuth, Services ID) | ✅ (if env configured) | n/a | ❌ | **BLOCKED — [B2](#b2-sign-in-with-apple-native)** |
| Account deletion | `POST /api/user/delete`, `/api/user/delete/confirm`, `GET /api/user/delete-status` | ✅ | ✅ | ⬜ | MISSING (Phase 16) |

### Feed & posts

| Feature | Backend route(s) | Web | Android | iOS | Status (iOS) |
| --- | --- | --- | --- | --- | --- |
| For You feed | `GET /api/posts/explore` (`{posts,nextCursor}`, numeric-offset cursor) | ✅ | ✅ | ✅ | IMPLEMENTED |
| Following feed | `GET /api/posts?tab=following` (post-id cursor) | ✅ | ✅ | ✅ | IMPLEMENTED |
| Cursor pagination | both above | ✅ | ✅ | ✅ | IMPLEMENTED |
| Pull to refresh | — | ✅ | ✅ | ✅ | IMPLEMENTED |
| Single post detail | `GET /api/posts/{id}` (raw post, no envelope) | ✅ | ✅ | ✅ | IMPLEMENTED |
| Like | `POST /api/posts/{id}/like` → `{liked}` | ✅ | ✅ | ✅ | IMPLEMENTED |
| Repost | `POST /api/posts/{id}/repost` → `{reposted}` | ✅ | ✅ | ✅ | IMPLEMENTED |
| Bookmark | `POST /api/posts/{id}/bookmark` → `{bookmarked}` | ✅ | ✅ | ✅ | IMPLEMENTED |
| Emoji reactions | `GET/POST /api/posts/{id}/reaction` | ✅ | ✅ | ⬜ | MISSING (Phase 8) |
| Delete own post | `DELETE /api/posts/{id}` (403 non-author, server-side) | ✅ | ✅ | ✅ | IMPLEMENTED |
| Edit own post | `PUT /api/posts/{id}` (text only, matches web) | ✅ | ✅ | ⬜ | MISSING (Phase 8) |
| Pin post (single slot) | `POST /api/posts/{id}/pin` | ✅ | ✅ | ⬜ | MISSING (Phase 6b) |
| Create post (text) | `POST /api/posts` | ✅ | ✅ | ✅ | IMPLEMENTED |
| Scheduled posts | `POST /api/posts` + `scheduledAt` naive wall-clock | ✅ | ✅ | ⬜ | MISSING (Phase 7b) |
| Quote post | `POST /api/posts` + `quotePostId`; `GET /api/posts/{id}/quotes` | ✅ | ✅ | 🔶 renders nested quote; composer sends the field but has no quote entry point yet | PARTIAL |
| Reposts list | `GET /api/posts/{id}/reposts` → `{items,nextCursor}` | ✅ | ✅ | ⬜ | MISSING (Phase 8) |
| Share sheet | — (client-side, `zrp.one/post/{id}`) | ✅ | ✅ | ✅ | IMPLEMENTED |
| Post views | `POST /api/posts/{id}/view` | ✅ | ⬜ | ⬜ | MISSING |
| Polls | `POST /api/polls/{id}/vote` | ✅ | ⬜ | ⬜ | MISSING |
| Inline translation | `POST /api/translate` | ✅ | ✅ | ⬜ | MISSING (Phase 8) |
| Link previews | `GET /api/link-preview` | ✅ | ⬜ | ⬜ | MISSING |

### Media

| Feature | Backend | Web | Android | iOS | Status (iOS) |
| --- | --- | --- | --- | --- | --- |
| Image rendering (single) | — | ✅ | ✅ | ✅ | IMPLEMENTED |
| Multi-image gallery (`imageUrls`) | — | ✅ | ✅ | ✅ (paged, page dots) | IMPLEMENTED |
| GIF rendering | — | ✅ | ✅ | 🔶 static first frame (no animation yet) | PARTIAL |
| Inline video playback | — | ✅ | ✅ (ExoPlayer) | 🔶 full-screen AVKit player; no in-feed inline playback | PARTIAL |
| Full-screen media viewer | — | ✅ | ✅ | ✅ (paged, pinch zoom, AVKit video) | IMPLEMENTED |
| Image/video/GIF upload | UploadThing `postMedia` router (`/api/uploadthing`) | ✅ | ✅ | ✅ (streamed from disk, real progress, cancel, resume-aware retry) | IMPLEMENTED |
| GIF picker (Giphy, proxied) | `GET /api/gifs/search`, `/api/gifs/trending` | ✅ | ✅ | ✅ | IMPLEMENTED |
| Avatar / cover upload | `/api/user/update-avatar`, `/api/user/update-cover` | ✅ | ✅ | ⬜ | MISSING (Phase 6b) — upload client already supports the `avatar`/`banner` slugs |

### Profiles & social graph

| Feature | Backend route(s) | Web | Android | iOS | Status (iOS) |
| --- | --- | --- | --- | --- | --- |
| Profile header + stats | `GET /api/users/{username}` | ✅ | ✅ | ✅ | IMPLEMENTED |
| User posts tab | `GET /api/users/{username}/posts` (**`{items,nextCursor}`**) | ✅ | ✅ | ✅ | IMPLEMENTED |
| Replies / media / likes / reposts tabs | `/replies`, `/media`, `/likes`, `/reposts` | ✅ | 🔶 | ⬜ | MISSING (Phase 6b) |
| Follow / unfollow (+ request for private) | `POST /api/users/{username}/follow` | ✅ | ✅ | ✅ (all three outcomes: followed, unfollowed, request pending) | IMPLEMENTED |
| Followers / Following lists | `/followers`, `/following` → `{items,nextCursor}` | ✅ | ✅ | ✅ | IMPLEMENTED |
| Edit profile | `PUT /api/user/profile` | ✅ | ✅ | ⬜ | MISSING (Phase 6b) |
| Suggested users | `GET /api/users/suggested` | ✅ | ✅ | ⬜ | MISSING (Phase 12) |
| Private-account gating | every content route returns `{items: []}`, not 403 | ✅ | 🔶 | ✅ (explains the account is private instead of showing "no posts") | IMPLEMENTED |
| Trust profile | `GET /api/users/{username}/trust` | ✅ | ⬜ | ⬜ | MISSING |

### Discovery

| Feature | Backend route(s) | Web | Android | iOS | Status (iOS) |
| --- | --- | --- | --- | --- | --- |
| Search (users + posts) | `GET /api/search?q=&type=all` (min 2 chars) | ✅ | ✅ | ⬜ | MISSING (Phase 12) |
| Trending hashtags | `GET /api/hashtags/trending` | ✅ | ✅ | ⬜ | MISSING (Phase 12) |
| Hashtag timeline | `GET /api/posts/hashtag/{tag}` (bare array, 50, no pagination) | ✅ | ✅ | ✅ | IMPLEMENTED |
| Hashtag / mention tap-through in post text | — | ✅ | ✅ | ✅ | IMPLEMENTED |
| Explore / trending pages | `GET /api/posts/explore` | ✅ | 🔶 (For You tab) | 🔶 (For You tab) | PARTIAL |

### Comments & replies

| Feature | Backend route(s) | Web | Android | iOS | Status (iOS) |
| --- | --- | --- | --- | --- | --- |
| Comment list on a post | `GET /api/posts/{id}/comments` | ✅ | ✅ | ⬜ | MISSING (Phase 8) |
| Create comment | `POST /api/posts/{id}/comments` | ✅ | ✅ | ⬜ | MISSING (Phase 8) |
| Threaded replies | same, `parentId` | ✅ | ✅ | ⬜ | MISSING (Phase 8) |
| Like a comment | `POST /api/comments/{id}/like` | ✅ | ✅ | ⬜ | MISSING (Phase 8) |
| Repost / bookmark a comment | `/api/comments/{id}/repost`, `/bookmark` | ✅ | ✅ | ⬜ | MISSING (Phase 8) |
| Delete comment | `DELETE /api/comments/{id}` | ✅ | ✅ | ⬜ | MISSING (Phase 8) |

### Stories

| Feature | Backend route(s) | Web | Android | iOS | Status (iOS) |
| --- | --- | --- | --- | --- | --- |
| Story rail | `GET /api/stories` | ✅ | ✅ | ⬜ | MISSING (Phase 9) |
| Viewer + auto-progression + pause | — | ✅ | ✅ | ⬜ | MISSING (Phase 9) |
| Mark viewed | `POST /api/stories/{id}/view` | ✅ | ✅ | ⬜ | MISSING (Phase 9) |
| Like a story | `POST /api/stories/{id}/like` | ✅ | ✅ | ⬜ | MISSING (Phase 9) |
| Create story (image/video) | `POST /api/stories` + UploadThing | ✅ | ✅ | ⬜ | MISSING (Phase 9) |

### Messages

| Feature | Backend route(s) | Web | Android | iOS | Status (iOS) |
| --- | --- | --- | --- | --- | --- |
| Conversation list | `GET /api/messages` | ✅ | ✅ | ⬜ | MISSING (Phase 10) |
| Thread + pagination | `GET /api/messages/{userId}` | ✅ | ✅ | ⬜ | MISSING (Phase 10) |
| Send message | `POST /api/messages` | ✅ | ✅ | ⬜ | MISSING (Phase 10) |
| Edit / delete message | `/api/messages/edit/{id}`, `/delete/{id}` | ✅ | ✅ | ⬜ | MISSING (Phase 10) |
| Reactions | `POST /api/messages/reaction/{id}` | ✅ | ✅ | ⬜ | MISSING (Phase 10) |
| Unread badge | `GET /api/messages/unread` | ✅ | ✅ | ⬜ | MISSING (Phase 10) |
| Realtime | Socket.io (`server.js`) | ✅ | ❌ polling | ❌ polling planned | PARTIAL (by design) |

### Notifications

| Feature | Backend route(s) | Web | Android | iOS | Status (iOS) |
| --- | --- | --- | --- | --- | --- |
| Notification list | `GET /api/notifications` (50 most recent) | ✅ | ✅ | ⬜ | MISSING (Phase 11) |
| Mark all read | `PUT /api/notifications` | ✅ | ✅ | ⬜ | MISSING (Phase 11) |
| Unread badge | `GET /api/notifications/unread` | ✅ | ✅ | ⬜ | MISSING (Phase 11) |
| Web Push (VAPID) | `POST /api/push/subscribe` | ✅ | n/a | n/a | WEB-ONLY |
| **Device push** | `POST/DELETE /api/push/fcm` | n/a | ✅ FCM | ❌ | **BLOCKED — [B3](#b3-ios-device-push)** |

### Music

| Feature | Backend route(s) | Web | Android | iOS | Status (iOS) |
| --- | --- | --- | --- | --- | --- |
| Music home | `GET /api/music/home` | ✅ | ✅ | ⬜ | MISSING (Phase 13) |
| Discover / genres | `GET /api/music/genres` | ✅ | ✅ | ⬜ | MISSING (Phase 13) |
| Artists / artist detail / follow | `/api/music/artists`, `/{id}`, `/{id}/follow` | ✅ | ✅ | ⬜ | MISSING (Phase 13) |
| Albums / album detail | `/api/music/albums`, `/{id}` | ✅ | ✅ | ⬜ | MISSING (Phase 13) |
| Playlists (+ reorder) | `/api/music/playlists`, `/{id}`, `/{id}/reorder` | ✅ | ✅ | ⬜ | MISSING (Phase 13) |
| Liked / library / history | `GET /api/music/library`, `POST /api/music/tracks/like`, `/tracks/play` | ✅ | ✅ | ⬜ | MISSING (Phase 13) |
| Queue | client-side | ✅ | ✅ | ⬜ | MISSING (Phase 13) |
| Mini + expanded player, seek, shuffle, repeat | client-side | ✅ | ✅ | ⬜ | MISSING (Phase 13) |
| Background audio, lock-screen/Now Playing, interruptions, AirPlay | client-side (`AVAudioSession` + `MPNowPlayingInfoCenter` on iOS) | n/a | ✅ | ⬜ | MISSING (Phase 13) |

### Music Studio

| Feature | Backend route(s) | Web | Android | iOS | Status (iOS) |
| --- | --- | --- | --- | --- | --- |
| Publish authorization gate | `GET /api/music/access` | ✅ | ✅ | ⬜ | MISSING (Phase 14) |
| Artist profile create/edit | `POST /api/music/artists` | ✅ | ✅ | ⬜ | MISSING (Phase 14) |
| Track upload + metadata | `POST /api/music/tracks` + UploadThing | ✅ | ✅ | ⬜ | MISSING (Phase 14) |
| Album management | `POST /api/music/albums`, `/{id}/reorder` | ✅ | ✅ | ⬜ | MISSING (Phase 14) |
| Artist verification | `POST /api/admin/music/artists/{id}/verify` | ✅ | ❌ | ❌ | STAFF/ADMIN |

### Marketplace

| Feature | Backend route(s) | Web | Android | iOS | Status (iOS) |
| --- | --- | --- | --- | --- | --- |
| Browse / category / search | `GET /api/listings` | ✅ | ✅ | ⬜ | MISSING (Phase 15) |
| Listing detail | `GET /api/listings/{id}` | ✅ | ✅ | ⬜ | MISSING (Phase 15) |
| Favorites | `POST /api/listings/{id}/favorite`, `GET /api/listings/favorites` | ✅ | ✅ | ⬜ | MISSING (Phase 15) |
| Create / edit listing | `POST /api/listings`, `PUT /api/listings/{id}` | ✅ | ⬜ | ⬜ | MISSING (Phase 15) |
| My listings | `GET /api/listings/mine` | ✅ | ⬜ | ⬜ | MISSING (Phase 15) |
| Purchase flow | — **none exists** (price informational, deals close off-platform) | n/a | n/a | n/a | n/a — must never be invented |

### Moderation & safety

| Feature | Backend route(s) | Web | Android | iOS | Status (iOS) |
| --- | --- | --- | --- | --- | --- |
| Report post/user/comment | `POST /api/reports` | ✅ | ✅ | ⬜ | MISSING (Phase 16) |
| Block / unblock | `POST /api/users/{username}/block` | ✅ | ✅ | ⬜ | MISSING (Phase 16) |
| Blocked list | `GET /api/users/blocked` (bare array) | ✅ | ✅ | ⬜ | MISSING (Phase 16) |
| Mute / unmute | `GET/POST /api/users/mute` | ✅ | ✅ | ⬜ | MISSING (Phase 16) |
| Muted list | `GET /api/users/muted` (bare array) | ✅ | ✅ | ⬜ | MISSING (Phase 16) |
| Appeals | `POST /api/appeals` | ✅ | ⬜ | ⬜ | MISSING |
| Feed-level block/mute filtering | server-side in `/api/posts/explore` | ✅ | ✅ | ✅ (inherited from server) | IMPLEMENTED |

### Settings

| Feature | Backend route(s) | Web | Android | iOS | Status (iOS) |
| --- | --- | --- | --- | --- | --- |
| Account (email, username, custom URL) | `/api/user/email`, `/username`, `/custom-url` | ✅ | ✅ | ⬜ | MISSING (Phase 16) |
| Security (password) | `PUT /api/user/password` | ✅ | ✅ | ⬜ | MISSING (Phase 16) |
| Privacy (private account, public likes/following) | `PUT /api/user/privacy` | ✅ | ✅ | ⬜ | MISSING (Phase 16) |
| Email preferences | `/api/user/email-preferences` | ✅ | ⬜ | ⬜ | MISSING (Phase 16) |
| Language (11 languages, `ar` RTL) | client-side preference | ✅ | ✅ | ⬜ | MISSING (Phase 17) |
| Data export | `GET /api/settings/export-data` | ✅ | ⬜ | ⬜ | MISSING |
| Plan / limits | `GET /api/user/plan`, `src/lib/limits.ts` | ✅ | ✅ | 🔶 composer pre-checks post length, image count and video size; settings surface pending | PARTIAL |

### Deliberately out of scope for the consumer iOS app

| Area | Reason |
| --- | --- |
| Admin console (`/api/admin/**`, 40+ routes) | STAFF/ADMIN — server-role gated. |
| Tips, plan upgrade, premium-post purchase, help/charity contribution | Blocked in native apps by `rejectNativePayment()` (Apple 3.1.1). iOS **must** send `x-zrp-native-app: 1` and must not surface this UI. See [Store policy](#store-policy-constraint). |
| Play, Opportunity, Aid/Help, News, Journalist, Ads, Careers, Investors, Press, Transparency, Shorts, AI chat, API keys, Team, Support tickets | WEB-ONLY today — Android has no surface for any of them either. Not iOS regressions. |

---

## Store policy constraint

`src/lib/native-payment-policy.ts` + `.server.ts` reject requests carrying
`x-zrp-native-app: 1` on `/api/creator/tip`, `/api/creator/premium-purchase`,
`/api/payment/crypto`, and `/api/help/{id}/contribute` with HTTP 403 and code
`NATIVE_PAYMENT_DISABLED`. The iOS `ApiClient` sends that header on **every**
request, and the iOS app surfaces none of those four flows. Server-side
enforcement remains the real boundary; the header is defense in depth.

> **Android observation (reported, not fixed):** `android-native`'s
> `ApiClient` does not send `x-zrp-native-app`. It is not currently a defect
> — the Android app surfaces none of the four restricted flows, so it never
> reaches those routes — but it means the server-side guard would not fire if
> one were ever added. Raising it here for the Android owner; **no Android
> file was changed.**

---

## Blocked items

### B1. Native OAuth (Google / Apple)

`src/lib/auth.ts` registers Google and Apple as **NextAuth web OAuth
providers**. The only native-friendly credential exchange that exists is
`POST /api/mobile/auth/login`, which takes an identifier + password and
mints a NextAuth-format JWT. There is no route that accepts an OAuth
credential from a native client and returns that same token.

The Capacitor shell works around this (`src/lib/nativeAuth.ts`) by opening
the web OAuth URL in a system browser — but that leaves the session as an
httpOnly cookie inside the browser/WebView, which a real native app cannot
read. **A native Swift client has no way to obtain a session token from
either provider today.**

### B2. Sign in with Apple (native)

Apple requires Sign in with Apple in any app that offers third-party
sign-in. This is therefore an **App Store submission blocker**, not a
nice-to-have.

Two concrete gaps:

1. **No native token-exchange route.** `ASAuthorizationAppleIDCredential`
   yields an `identityToken` (a JWT signed by Apple). Nothing server-side
   verifies one. Required: a route mirroring `mobile/auth/login`'s design —
   verify the token against Apple's JWKS (`https://appleid.apple.com/auth/keys`),
   check `iss`, `aud`, `exp`, and the SHA-256 `nonce` claim, link or create
   the `User` + `Account` rows, then `encode()` the same NextAuth JWT payload
   and return the same `{sessionToken, cookieName, expiresInSeconds, user}`
   envelope.
2. **Audience mismatch.** `APPLE_CLIENT_ID` is a **Services ID** (web flow).
   Native Sign in with Apple presents the **bundle ID** (`one.zrp.social`)
   as `aud`. The verifier must accept both.

Also unresolved server-side: Apple's name/email are returned **only on the
very first authorization**, and private-relay addresses mean email is not a
reliable identity key — `sub` is. Username generation for a first-time Apple
user needs a rule (web's `register` route requires a caller-supplied
username; Apple gives none).

**Until that route exists, no Apple button ships.** A button that cannot
complete a sign-in is a dead button. The entitlement and capability are
prepared in `Supporting/ZRPSocial.entitlements` so the flow is one route
away, and the audit above is the specification for it.

### B3. iOS device push

`POST /api/push/fcm` stores tokens with `platform` hardcoded to `"android"`
(`prisma/schema.prisma:649` also defaults it there), and `sendFcmPush()`
fans out to **all** of a user's tokens with a generic `notification` payload.

Delivery to iOS via FCM is technically possible, but needs:

1. An **APNs key uploaded to the Firebase project** — a console action, not
   a code change, and unverifiable from this environment.
2. A **`GoogleService-Info.plist`** for the iOS app. Only
   `android-native/app/google-services.json` exists in this repo; the iOS
   counterpart has never been generated.
3. A **one-line backwards-compatible backend change**: accept an optional
   `platform` in the `POST /api/push/fcm` body (defaulting to `"android"`,
   so Android and every existing row are unaffected) so iOS tokens are
   labelled correctly.

Item 3 is small and safe; items 1 and 2 are external and cannot be done from
here. **No fake local notifications will stand in for this.**

---

## Phase plan

| Phase | Scope | State |
| --- | --- | --- |
| 1 | Repository + backend + Android audit, this matrix | ✅ done |
| 2 | iOS project foundation, theme, CI | ✅ done |
| 3 | Auth + session (login/restore/logout) | ✅ done — 3b (signup, verify, reset, onboarding) pending |
| 4 | Navigation shell + deep links | 🔶 in-app routing done (profile / hashtag / follow lists); OS deep links pending |
| 5 | Home feed (For You / Following) + interactions | ✅ done |
| 6 | Profiles + social graph | ✅ done — 6b (edit profile, pin, extra profile tabs) pending |
| 7 | Post composer + media upload + viewer | ✅ done — 7b (scheduling, quote entry point, camera capture) pending |
| 8 | Comments, replies, quotes, reactions, edit | ⬜ |
| 9 | Stories | ⬜ |
| 10 | Messages | ⬜ |
| 11 | Notifications (+ push, pending B3) | ⬜ |
| 12 | Search + hashtags | 🔶 hashtag timeline done; search pending |
| 13 | Music + background player | ⬜ |
| 14 | Music Studio | ⬜ |
| 15 | Marketplace | ⬜ |
| 16 | Settings, moderation, account deletion | ⬜ |
| 17 | Localization (11 languages) + accessibility | ⬜ |
| 18 | Performance + security pass | ⬜ |
| 19 | App Store preparation | ⬜ |
| 20 | Final parity audit | ⬜ |
