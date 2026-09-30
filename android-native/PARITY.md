# ZRP Social: Native Android Full Parity Matrix (Task #4)

Evidence-based audit of what the native Android app (Kotlin/Jetpack Compose,
`android-native/app/src/main/java/one/zrp/social/mobile/`) actually does
today, against the real backend contract (`src/app/api/**/route.ts`,
`prisma/schema.prisma`) and the web app (`src/**`). Produced by a ten-cluster
parallel audit (Task #4, "Android: Full Production Parity Audit &
Completion"), each cluster required to cite exact file:line evidence rather
than assume completeness or incompleteness.

> **Scope note.** Nothing below is marked COMPLETE on the strength of a
> screen existing, a button being present, or a network call compiling.
> COMPLETE means: the Android client, its backend integration, security,
> error handling, and production behavior are all genuinely functional.

## Legend

| Status | Meaning |
| --- | --- |
| `COMPLETE` | Real backend integration, full user-facing behavior, error handling included. |
| `PARTIAL` | Real backend calls, but a meaningful, named part of the feature is absent or degraded. |
| `MISSING` | Not built on Android at all, though the backend (and usually web) support it. |
| `NOT APPLICABLE` | The feature does not exist anywhere in this product (web or backend) either, so there is nothing to be out of parity with. |

---

## How this matrix was produced

Ten parallel research agents each audited one functional cluster read-only
(no edits), citing file:line evidence for every claim:

| Cluster | Scope |
| --- | --- |
| A | Auth, Profile, Session, core security |
| B | Social graph, Trust & Safety |
| C | Posts, Comments |
| D | Stories, Media handling |
| E | Messaging, Realtime/Socket.IO |
| F | Calling (Task #1 regression check), Push notifications/FCM |
| G | Discover/Search (Task #2/#3 regression check), Communities, Lists |
| H | Creator ecosystem, Music |
| I | News, Opportunities, Marketplace |
| J | ZRP PLAY, general UI/UX, offline/network resilience, performance |

Their combined findings are summarized per-cluster below. Where a cluster
found a real, Android-specific, well-scoped gap, this pass (same session)
fixed it: see [Fixes applied this pass](#fixes-applied-this-pass). Findings
that are whole-product gaps (missing on web and backend too, not just
Android), or that are real but too large/architectural to fix safely without
local compile validation (see [Known limitations](#known-limitations)), are
documented rather than fixed, per the task's own "do not fake missing
functionality" rule.

---

## Cluster A: Auth, Profile, Session, core security

| Feature | Status | Notes |
| --- | --- | --- |
| Email/username + password login, registration, logout | COMPLETE | `POST /api/mobile/auth/login`, real NextAuth-compatible JWT minted server-side. |
| Google Sign-In | COMPLETE | Credential Manager → `POST /api/mobile/auth/google`, fixed this session's prior task (WelcomeScreen never rendered the login form state). |
| Apple Sign-In | **MISSING** | Backend route exists (`POST /api/mobile/auth/apple`); Android has no native Sign in with Apple integration. Not fixed this pass: needs Apple Developer entitlements/capability configuration outside this sandbox's reach; see Known limitations. |
| Session restore, secure token storage, 401/session-expiry handling | COMPLETE | `EncryptedSharedPreferences`; central `sessionExpiryInterceptor` (Task #4 cluster A confirms Task #3-era fix still holds). |
| Password reset (request), forgot-password | COMPLETE | |
| "Resend verification email" from a **failed login** screen | **MISSING** | Exists only post-registration; a user who never confirmed and later fails login has no in-context resend action. Documented, not fixed this pass (needs a UX decision on failed-login screen real estate). |
| Onboarding, profile edit, avatar/banner, private account, country/language | COMPLETE | |
| Professional-profile `category`/`showCategory` picker | PARTIAL | Self-documented deferral in existing code; field exists server-side, no picker UI yet. |
| Account deletion (30-day grace + immediate) | COMPLETE | |

## Cluster B: Social graph, Trust & Safety

| Feature | Status | Notes |
| --- | --- | --- |
| Follow/unfollow, followers/following lists, block, mute, suggestions | COMPLETE | |
| Follow-request accept/decline | **MISSING (whole-product)** | No backend endpoint exists for this at all: not an Android gap. Documented only. |
| Reports (post/comment/user/listing/challenge/opportunity/campaign/liveAudioRoom/story) | COMPLETE | All 9 polymorphic `Report` targets wired; comment reports were the one real gap, fixed this pass (see below). |
| Appeals | COMPLETE | |
| Admin/moderator-gated screens | COMPLETE | Server-side role check is authoritative; Android never trusts a client-side role flag. |

## Cluster C: Posts, Comments

Full sub-feature detail in the original cluster report; summary:

| Feature | Status | Notes |
| --- | --- | --- |
| Text/image/multi-image/video posts, hashtags, mentions (post composer), polls, recruitment/article creation | COMPLETE | |
| Reposts, quote posts, reactions, likes, bookmarks, shares, view counting, scheduled posts, pinning | COMPLETE | |
| Article rendering (viewing) | PARTIAL | `PostTypeContent.kt` strips all HTML formatting to plain text (documented, deliberate simplification: no HTML/Markdown renderer in the app yet); creation is at full parity. |
| Premium/PPV posts (main feed/profile/post-detail) | PARTIAL | Matches web's own gap there (no lock UI in the main feed either): not an Android-only shortfall. |
| Premium/PPV posts (Shorts) | **Fixed this pass** | Was a blank playback surface for a locked video (no `premiumPost` field on the `Post` model at all); now shows the same lock+preview+price+CTA treatment web's `VideoFeedViewer.tsx` uses. |
| Comment create/edit/delete/likes/reposts/bookmarks, nested reply pagination | COMPLETE | |
| Comment reports | **Fixed this pass** | `ReportsApi`/`ReportDialog` already supported `commentId`; wired into `CommentsScreen.kt` and `PostDetailScreen.kt`. |
| Comment media attachment (image/GIF) | **MISSING** | Requires adding `imageUrl` to `CreateCommentRequest`/`Comment` plus a picker UI: a genuinely missing feature, not unwired plumbing. Not fixed this pass (larger scope than a wiring fix). |

## Cluster D: Stories, Media handling

| Feature | Status | Notes |
| --- | --- | --- |
| Story create (image/video/text), views, likes, expiry | COMPLETE | |
| Story replies (as DM) | COMPLETE (sending) / **Fixed this pass** (receiving) | The quote-badge on the *recipient's* side of the resulting DM never read `message.story` despite the DTO carrying it; fixed in `ConversationScreen.kt`'s `MessageBubble`. |
| Media upload/compression/playback, camera/gallery permissions | COMPLETE | Camera-permission-denial user feedback was the one real gap; **fixed this pass** (both 1:1 and group chat composers). |

## Cluster E: Messaging, Realtime/Socket.IO

| Feature | Status | Notes |
| --- | --- | --- |
| 1:1 DM send/receive, typing, read receipts, edit, delete, reactions | COMPLETE | |
| Group chat send/receive, typing (with 4s auto-expiry), edit, delete, reactions | COMPLETE | Group message **edit** exists on Android but not on web: a parity *plus*, not a bug. |
| Media/GIF in 1:1 messages (image/video/document/voice) | COMPLETE | |
| Media/GIF in group messages | PARTIAL | Only image + GIF; no video/file/voice attachments in group chat (web has all four). Not fixed this pass: a 3-attachment-type feature, out of scope for a surgical pass. |
| Presence reconnect-restale (1:1) | COMPLETE | Fixed in a prior task (Task #3 era). |
| Presence reconnect-restale (group, conversation list) | **Fixed this pass** | `GroupConversationViewModel`/`MessagesViewModel` didn't re-request `get-status` on every `EVENT_CONNECT` (only once ever, via a dedup set): both now mirror the 1:1 fix. |
| Conversation list live-update on new messages | **Fixed this pass** | `MessagesViewModel` never listened for `receive-message`/`message-sent`/`receive-group-message`; now does, with a full-refresh fallback for a brand-new partner the preview payload can't describe. |
| Nav badges (messages + notifications) live-update | **Fixed this pass** | No socket listener and no poll at all; added the same 30s poll fallback web's `UnreadCountContext.tsx` uses (a full app-wide socket for this is a larger architectural change, out of scope this pass: see Known limitations). |
| `connect_error`/`disconnect` handling, explicit reconnection-retry logic | **MISSING** | Android relies solely on the socket.io-client library's default reconnection; none of web's explicit handshake-refusal-retry or server-disconnect-retry logic. Not fixed this pass (touches `ZrpSocket.kt` globally: real risk without local compile validation). |
| Message notifications while backgrounded | COMPLETE | Real FCM/push, independent of the socket layer. |

## Cluster F: Calling, Push notifications/FCM

| Feature | Status | Notes |
| --- | --- | --- |
| WebRTC voice/video calling (place/answer/accept/reject/end/mute/camera-switch/speakerphone) | COMPLETE | Task #1's work confirmed still functional. |
| Call signaling socket lifecycle | COMPLETE | Deliberately held open for the whole logged-in session (fixes a real prior "can only receive a call while the exact thread is open" bug). |
| Generic FCM deep-link routing when app is backgrounded/killed | **MISSING** | A notification+data payload means `onMessageReceived()` never fires in that state, breaking deep-link navigation for *all* notification types tapped from cold/background, not just calls. Not fixed this pass: a cross-cutting FCM payload-shape change with real regression risk across every notification type; needs its own dedicated pass with real device testing. |
| Full-screen/high-priority incoming-call UI from a backgrounded push | **MISSING** | No real full-screen incoming-call UI triggered from push; the `incoming-call` socket event alone only reaches an already-open app. |
| Foreground service / persistent notification with call controls for an active call | **MISSING** | No persistent notification during an active call. |
| Standard push notifications (likes/comments/follows/mentions/etc.) | COMPLETE | |

## Cluster G: Discover/Search, Communities, Lists

| Feature | Status | Notes |
| --- | --- | --- |
| For You / Trending Discover feed, hashtag discovery, "people near you" | COMPLETE | Verified against Task #3's work; still correct (country-based only, never claims GPS). |
| Advanced Search (categories/filters/sort/pagination) | COMPLETE | Verified against Task #2's work. |
| Communities (create/join/roles/feeds/moderation) | COMPLETE | |
| Lists (create/public-private/feed) | PARTIAL | List-edit UI missing on both platforms (whole-product gap, not Android-specific). |
| "Lists I'm a member of" | **MISSING (whole-product)** | No backend endpoint exists. Documented only. |

## Cluster H: Creator ecosystem, Music

| Feature | Status | Notes |
| --- | --- | --- |
| Creator dashboard, analytics/studio, tips (read-only history, no purchase flow by design), withdrawals | COMPLETE | Withdrawal UI is fully implemented and *correctly* exempt from the "no purchase flow" policy (a payout, not a purchase). |
| Creator/tip-jar indicator on a visited profile | **MISSING** | Android correctly dropped the purchase-triggering Tip button (no wallet integration) but never replaced it with any read-only "this creator accepts tips" indicator. Not fixed this pass (a small but net-new UI element; deferred alongside the related premium-preview polish). |
| Music: browse artists/albums/tracks/genres, playlists (full CRUD + reorder), likes, follows, history | COMPLETE | |
| Music playback | COMPLETE | Real `MediaSessionService`/ExoPlayer with lock-screen/notification controls and true background playback: exceeds a minimal parity bar. |
| Music Studio (creator upload tool: tracks/albums/artist profile) | COMPLETE | Full native port including a real audio-file picker, not merely "not applicable." |
| Premium locked-preview consistency (Discover: missing price/currency text) | PARTIAL | Discover's own locked-slide treatment omits the price/currency text web's `DiscoverSlide.tsx` shows (though the model already carries it). Not fixed this pass: scoped as UI polish alongside Cluster C's Shorts fix, which *was* the user-visible-bug-severity item. |

## Cluster I: News, Opportunities, Marketplace

| Feature | Status | Notes |
| --- | --- | --- |
| News feed, article reading, sources, languages | COMPLETE | `GAMING` category was missing (11 of 12 real values): **fixed this pass**. |
| Opportunities (jobs/internships/scholarships/freelance/etc., CV attach) | COMPLETE | |
| Marketplace browse/search/filter/favorite/seller-profile/messaging/moderation | COMPLETE | Error-vs-empty state conflation on the browse list and the listing-detail screen were the two real gaps: **both fixed this pass** (real network failures now show a distinct message with a Retry action instead of looking identical to "nothing here"). |

## Cluster J: ZRP PLAY, UI/UX, offline/network resilience, performance

| Feature | Status | Notes |
| --- | --- | --- |
| PLAY: TRIVIA/MEMORY/LOGIC (create, play, daily challenge, leaderboard, duels, XP/levels, achievements) | COMPLETE | Duels in particular verified as a full, real lifecycle (create/accept/decline/play/server-determined winner), not a stub. |
| PLAY: REACTION/SEQUENCE player components | **MISSING** | No player UI for 2 of the 5 real game types; the existing fallback (filter from browsing, honest "unsupported" message on a direct/duel/daily link) is a real, deliberate stopgap, not a silent failure: but not full parity. Not fixed this pass (two full new player UIs is out of scope for a surgical pass). |
| Navigation architecture, dark mode, localization (39 languages, CI-enforced completeness), rotation/config-change handling | COMPLETE | |
| Deep links | PARTIAL | Only ~10 of ~86 destinations are deep-linkable (covers the highest-traffic share targets: home/search/notifications/messages/profile/post/hashtag). Documented as a known limitation, not fixed. |
| Tablet/large-screen adaptive layout | PARTIAL | Only the Messages inbox has a real two-pane layout; everything else (including all of PLAY) is phone-only. A deliberate, narrow scope choice, not an oversight: the `WindowSizeClass` infrastructure exists and could be extended later. |
| App-foreground auto-refetch | PARTIAL | No `ProcessLifecycleOwner`-driven refetch on resume anywhere; relies on per-screen pull-to-refresh (4 screens have it) or re-navigation. Architectural, not fixed this pass. |
| Shared network-error pattern, session-expiry interceptor | COMPLETE | |
| Performance (list `key`s, no `runBlocking`, no per-recomposition refetch) | COMPLETE | Spot-checked; no anti-patterns found at scale. |

---

## Fixes applied this pass

All of the following are real, narrowly-scoped, Android-specific fixes
identified by the ten-cluster audit above and implemented in this same
session. Every locale-facing string was added with real, reviewed
translations across all 39 supported languages (verified: no unescaped
apostrophes, no byte-for-byte English copies outside `values/`).

1. **Comment reports**: `CommentsScreen.kt`, `PostDetailScreen.kt`,
   `CommentsViewModel.kt`, `CommentsRepository.kt`: wired the existing
   `ReportsApi`/`ReportDialog` (already supports `commentId`) into the
   comment row's action menu, shown only for someone else's comment
   (mirrors `Comments.tsx`'s own `!isAuthor` guard). New string:
   `comment_report_cd`.
2. **`NEWS_CATEGORIES` missing `GAMING`**: `NewsApi.kt`,
   `NewsFormatting.kt`, plus two stale doc-comment counts in
   `JournalistApi.kt`/`AdminApi.kt`. New string: `news_category_gaming`.
3. **Presence reconnect-restale (group + conversation list)**:
   `GroupConversationViewModel.kt`, `MessagesViewModel.kt`: both now
   re-request `get-status` for every known participant/partner on every
   socket reconnect (`EVENT_CONNECT`), not just once.
4. **Story-reply quote badge missing on the recipient side**:
   `ConversationScreen.kt`'s `MessageBubble`: now renders the same
   thumbnail + "Replied to your/their story" badge `ChatInterface.tsx`
   shows, reading `message.story` (a field that already arrived on every
   response but was never rendered).
5. **Marketplace browse: network error indistinguishable from "no
   listings"**: `MarketplaceScreen.kt`: added a distinct error state with
   a Retry action, reading `state.error` (already tracked by the
   ViewModel but never consumed by the screen).
6. **Listing detail: 404 indistinguishable from a transient load
   failure**: `ListingDetailViewModel.kt`, `ListingDetailScreen.kt`: a
   real 404 (`notFound`) and any other failure (`error`) are now tracked
   separately; only a real 404 shows the dead-end "not found" message,
   everything else offers Retry. Extracted as pure, unit-tested functions
   (`isListingNotFound`, `listingLoadErrorMessage`).
7. **Nav badges (messages + notifications) never live-updated**:
   `UnreadBadgeViewModel.kt`: added the same 30s poll fallback web's
   `UnreadCountContext.tsx` uses (this app has no app-wide socket these
   nav-level ViewModels could listen on instead).
8. **Conversation list never live-updated on a new message**:
   `MessagesViewModel.kt`: now listens for `receive-message`/
   `message-sent`/`receive-group-message` and updates the matching row's
   preview/timestamp/unread count in place, re-sorting the list; falls
   back to a full refresh for a brand-new partner the live preview can't
   fully describe. Pure functions `applyIncomingDirectMessage`/
   `applyOutgoingDirectMessage`/`applyIncomingGroupMessage` added with
   unit tests.
9. **Camera-attachment permission denial gave no feedback**:
   `ConversationScreen.kt`, `GroupConversationScreen.kt`: denying the
   camera permission now shows the same kind of error text the
   equivalent microphone-permission denial already had. New string:
   `chat_err_camera_access`.
10. **Premium/locked posts on Shorts rendered as a blank screen**:
    `PostsApi.kt` (`Post.premiumPost`, reusing `DiscoverPremiumPost`'s
    shape), `ShortsScreen.kt`: a locked video now shows the same lock
    icon + honest preview + real price + "View post" link treatment
    web's `VideoFeedViewer.tsx`/`DiscoverSlide.tsx` use: never a
    purchase button. New strings: `shorts_premium_locked_title`,
    `shorts_premium_locked_body`, `shorts_premium_locked_cta`.

## Known limitations

Real, confirmed gaps this pass did **not** fix, because they are either
whole-product gaps (not Android's fault to fix alone) or too large/risky to
attempt without the ability to compile-verify Android locally in this
sandbox (`dl.google.com` is blocked by the sandbox's proxy policy, so the
Android Gradle Plugin cannot resolve: real compile validation only happens
in CI):

- **Apple Sign-In**: entirely missing on Android; needs Apple Developer
  entitlements/capability configuration this environment cannot set up.
- **Generic FCM background/killed deep-link routing**: a cross-cutting
  payload-shape change affecting every notification type; real risk without
  device testing.
- **Full-screen incoming-call UI + persistent active-call notification from
  a backgrounded push**: two related, non-trivial UI/foreground-service
  features.
- **Comment media (image/GIF) attachment**: needs a new `imageUrl` field on
  the comment DTO plus a picker UI; a genuinely new feature, not a wiring
  fix.
- **Group chat video/file/voice attachments**: three new attachment
  pipelines for group messages specifically (1:1 already has all four).
- **PLAY REACTION/SEQUENCE player components**: two full new game-player
  UIs.
- **`connect_error`/`disconnect` explicit reconnection handling**: touches
  `ZrpSocket.kt`'s shared connection logic app-wide.
- **Article rendering strips HTML formatting**: needs a real
  Markdown/HTML-to-AnnotatedString renderer, not a WebView.
- Whole-product gaps with no backend endpoint at all (documented, not an
  Android defect): follow-request accept/decline, "lists I'm a member of."
- List-edit UI (missing on both web and Android).
