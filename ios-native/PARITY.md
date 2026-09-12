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
| Sign in with Apple (native) | `POST /api/mobile/auth/apple` | via NextAuth Apple provider (web redirect) | n/a | ✅ native `ASAuthorizationAppleIDCredential`, server-verified | IMPLEMENTED |
| Session restore on launch | `GET /api/auth/session` | ✅ | ✅ | ✅ | IMPLEMENTED |
| Secure session storage | — | httpOnly cookie | EncryptedSharedPreferences | Keychain (`kSecAttrAccessibleAfterFirstUnlock`) | IMPLEMENTED |
| Logout / session teardown | — (local + `DELETE /api/push/fcm`) | ✅ | ✅ | ✅ (local; push teardown pending Phase 11) | PARTIAL |
| Session expiry handling (401) | any authed route | ✅ | ✅ | ✅ (401 → clear + return to login) | IMPLEMENTED |
| Registration | `POST /api/auth/register` | ✅ | ✅ | ✅ ends on "check your email" — the route returns no session | IMPLEMENTED |
| Live username availability | `GET /api/auth/check-username` | ✅ | ✅ | ✅ debounced, with the route's own pre-checked suggestions | IMPLEMENTED |
| Email verification — resend | `POST /api/auth/resend-verification` | ✅ | ✅ | ✅ | IMPLEMENTED |
| Email verification — confirm | `GET /api/auth/verify-email` | ✅ | ✅ | ⬜ opened from the emailed link in a browser; no in-app route exists | MISSING (by design) |
| Forgot password — request | `POST /api/auth/forgot-password` | ✅ | ✅ | ✅ answers the same way whether or not the address exists, as the route intends | IMPLEMENTED |
| Reset password — complete | `POST /api/auth/reset-password` | ✅ | ✅ | ⬜ completed through the emailed link on the web; no route accepts a code typed into an app | MISSING (by design) |
| Onboarding | `POST /api/user/onboarding-complete`, `PUT /api/user/profile`, `POST /api/user/update-avatar`, `GET /api/users/suggested` | ✅ | ✅ | ✅ profile, avatar, follow suggestions; every step skippable | IMPLEMENTED |
| Google sign-in | `POST /api/mobile/auth/google` (added on `main` by PR #115) verifies a Google ID token and mints the same NextAuth JWT; the website still uses the NextAuth `google` web provider | ✅ | ✅ Credential Manager | ⬜ backend no longer blocks it — obtaining the ID token on iOS is outstanding client-side work, not built here | MISSING (was [B1](#b1-native-oauth--google-now-unblocked-server-side-apple-still-blocked)) |
| **Sign in with Apple** | NextAuth `apple` provider (web OAuth, Services ID) | ✅ (if env configured) | n/a | ❌ | **BLOCKED — [B2](#b2-sign-in-with-apple-native)** |
| Account deletion | `POST /api/user/delete`, `/api/user/delete/confirm`, `GET /api/user/delete-status` | ✅ | ✅ | ✅ both paths — see [Settings](#settings); the web page's own wiring bug that skipped the 30-day path entirely is fixed — see [F5](#f5-account-deletions-30-day-grace-period-never-actually-applied--fixed-server-side--web) | IMPLEMENTED |

### Feed & posts

| Feature | Backend route(s) | Web | Android | iOS | Status (iOS) |
| --- | --- | --- | --- | --- | --- |
| For You feed | `GET /api/posts/explore` (`{posts,nextCursor}`, numeric-offset cursor) | ✅ | ✅ | ✅ | IMPLEMENTED |
| Following feed | `GET /api/posts?tab=following` (post-id cursor) | ✅ | ✅ | ✅ | IMPLEMENTED |
| Cursor pagination | both above | ✅ | ✅ | ✅ | IMPLEMENTED |
| Pull to refresh | — | ✅ | ✅ | ✅ | IMPLEMENTED |
| Single post detail | `GET /api/posts/{id}` (raw post, no envelope) | ✅ | ✅ | ✅ (dedicated screen with threaded comments) | IMPLEMENTED |
| Like | `POST /api/posts/{id}/like` → `{liked}` | ✅ | ✅ | ✅ | IMPLEMENTED |
| Repost | `POST /api/posts/{id}/repost` → `{reposted}` | ✅ | ✅ | ✅ | IMPLEMENTED |
| Bookmark | `POST /api/posts/{id}/bookmark` → `{bookmarked}` | ✅ | ✅ | ✅ | IMPLEMENTED |
| Emoji reactions | `GET /api/posts/{id}/reaction` → bare array of rows; `POST` → `{reaction}` or `{reaction: null}`, a per-(post, user, emoji) toggle | ✅ | ✅ | 🔶 rows are shown and toggled on the post detail screen, not on feed cards (one request per post); the picker is a fixed set of eight, where the website offers a full emoji picker — the route itself accepts any emoji | PARTIAL |
| Delete own post | `DELETE /api/posts/{id}` (403 non-author, server-side) | ✅ | ✅ | ✅ | IMPLEMENTED |
| Edit own post | `PUT /api/posts/{id}` (text only, matches web) | ✅ | ✅ | ✅ | IMPLEMENTED |
| Pin post (single slot) | `POST /api/posts/{id}/pin` → `{pinned}`, author-only | ✅ | ✅ | ✅ offered from the post menu on your own profile; the pinned post is fetched via `GET /api/posts/{id}` (the profile route reports only `pinnedPostId`), labelled above the Posts tab and filtered out of the list below | IMPLEMENTED |
| Create post (text) | `POST /api/posts` | ✅ | ✅ | ✅ | IMPLEMENTED |
| Scheduled posts | `POST /api/posts` + `scheduledAt`, resolved through `resolveScheduledAt` — an ISO-8601 instant is parsed directly, a naive string is read in the server's zone. Stored with `status: "scheduled"`; published by the platform's own cron. Monthly per-plan cap enforced server-side with a 400 | ✅ | 🔶 still sends the naive string | ✅ composer control, sending a real UTC instant so the post publishes at the moment the author chose — see [F2](#f2-scheduled-posts-are-timed-in-the-servers-timezone-not-the-authors--fixed-server-web-and-ios). No management surface, matching the web, which has none either | IMPLEMENTED |
| Quote post | `POST /api/posts` + `quotePostId` | ✅ | ✅ | ✅ (Quote action on every post, with a preview in the composer) | IMPLEMENTED |
| Reposts list | `GET /api/posts/{id}/reposts` → `{items,nextCursor}` of users | ✅ | ✅ | ✅ reached from the post's repost count; shares one screen with followers/following, which answer the same shape | IMPLEMENTED |
| Quotes list | `GET /api/posts/{id}/quotes` → `{items,nextCursor}` of posts | ✅ | ✅ | ✅ reached from the post's quote count, rendered with the standard post card | IMPLEMENTED |
| Share sheet | — (client-side, `zrp.one/post/{id}`) | ✅ | ✅ | ✅ | IMPLEMENTED |
| Post views | `POST /api/posts/{id}/view` → `{views}`; increments unconditionally, no server-side dedupe | ✅ | ⬜ | ✅ counted once per post per app run (the process-lifetime equivalent of the website's `sessionStorage` guard) and shown on the card | IMPLEMENTED |
| Polls — vote | `POST /api/polls/{id}/vote` → `{success}` only; one vote per person, permanent (400 "Already voted"), refused after `expiresAt` (400 "Poll has ended") | ✅ | ⬜ | ✅ results revealed only after voting or after the poll closes, matching the web; the +1 the route just made is applied locally since it reports no tally | IMPLEMENTED |
| Polls — create | `POST /api/posts` + `poll: {question, options, expiresAt?}` and `isPoll`; the route creates one whenever `options.length > 1` and does **no** plan check | ✅ | ⬜ | ✅ 2–6 options, question ≤200 and option ≤60 characters (the website's own defaults — its `canCreatePoll` gate reads feature keys that `getFeatureStatus` never sets, so it is on for everyone); a poll post with no text of its own carries the question as its content, as on the web | IMPLEMENTED |
| Inline translation | `POST /api/translate` (session required, 30/min, 2000-char cap; MyMemory with `autodetect` as the source, and it reports no detected language) | ✅ | ✅ | ✅ posts and comments, target = the app's current language; offered from the post/comment menu rather than as a permanent line under every card as on the web, and not offered at all when signed out since the route answers 401 | IMPLEMENTED |
| Link previews | `GET /api/link-preview?url=…` → a fully-null shape with a **200** for a link it could not read, not an error | ✅ | ⬜ | ✅ shown only when the post carries no image of its own and the route returned a title or an image, matching the web; the URL is `linkUrl` first then the first URL in the text, using a port of the website's own extractor so both platforms unfurl the same link | IMPLEMENTED |

### Media

| Feature | Backend | Web | Android | iOS | Status (iOS) |
| --- | --- | --- | --- | --- | --- |
| Image rendering (single) | — | ✅ | ✅ | ✅ | IMPLEMENTED |
| Multi-image gallery (`imageUrls`) | — | ✅ | ✅ | ✅ (paged, page dots) | IMPLEMENTED |
| GIF rendering | — | ✅ | ✅ | ✅ animated, with the file's own per-frame timing; a single-frame GIF falls back to the still path, which is what it is | IMPLEMENTED |
| Inline video playback | — | ✅ | ✅ (ExoPlayer) | ✅ muted, looping, autoplaying at the website's own 0.6 visibility threshold, through **one** shared player rather than one per card; tapping opens the full-screen viewer, where the controls are | IMPLEMENTED |
| Full-screen media viewer | — | ✅ | ✅ | ✅ (paged, pinch zoom, AVKit video) | IMPLEMENTED |
| ZRP Shorts (vertical video feed) | `GET /api/videos` (`cursor`, `limit`, `startId`) | ✅ `/shorts` | ✅ `ShortsScreen` | ✅ one video per screen, paged vertically, looping and muted until asked; reached from Home's More menu, from a video post's menu (opening on that video via `startId`), and from a `/shorts` link | IMPLEMENTED |
| Image/video/GIF upload | UploadThing `postMedia` router (`/api/uploadthing`) | ✅ | ✅ | ✅ (streamed from disk, real progress, cancel, resume-aware retry) | IMPLEMENTED |
| GIF picker (Giphy, proxied) | `GET /api/gifs/search`, `/api/gifs/trending` | ✅ | ✅ | ✅ | IMPLEMENTED |
| Avatar / cover upload | `POST /api/user/update-avatar`, `POST /api/user/update-cover` — both reject any URL not on UploadThing's hosts, so the file must be uploaded first and its URL handed over | ✅ | ✅ | ✅ from Edit profile and from onboarding | IMPLEMENTED |

### Profiles & social graph

| Feature | Backend route(s) | Web | Android | iOS | Status (iOS) |
| --- | --- | --- | --- | --- | --- |
| Profile header + stats | `GET /api/users/{username}` | ✅ | ✅ | ✅ | IMPLEMENTED |
| Professional category | same route, `category`/`showCategory` (already selected server-side) | ✅ | ✅ (`UsersApi.kt` already decodes it) | ✅ (`UserProfile.swift` already decodes it) | IMPLEMENTED |
| Charity impact | same route, new `charityContributionUsdc` - the real sum of this profile's own completed tips'/purchases' `charityAmount` (`src/lib/charity.ts`), computed the same way `api/transparency/charity` computes it platform-wide. Web's own display of this was previously `Math.floor(Math.random() * 50) + 5` "meals" - fabricated, regenerated every page load, with no established $-to-"meals" conversion anywhere in this codebase to make real. Now a real USD figure on web; not yet consumed by Android or iOS | ✅ (fixed - was fake) | ⬜ | ✅ the real USDC figure, shown only when the route reports one — absent is not zero, since "$0.00 contributed" would be a claim the server never made. The 35% share matches the website's own constant | IMPLEMENTED |
| Milestone badges | same route, new `milestones: [{key, icon, params?}]` (`src/lib/milestones.ts`) - years-on-ZRP / post-count / follower-count tiers, previously computed only in web's own client code so Android/iOS had no way to show the same badges a profile earned. Stable `key` + numeric `params`, same as Trust Passport - each client owns its own localized label | ✅ (now server-computed, was client-only) | ⬜ | ✅ key → this app's own translation, nothing recomputed. An unrecognised key is skipped rather than rendered raw, so a newer backend's badge never puts "posts_500" in front of an Arabic or Chinese reader | IMPLEMENTED |
| User posts tab | `GET /api/users/{username}/posts` (**`{items,nextCursor}`**) | ✅ | ✅ | ✅ | IMPLEMENTED |
| Replies / media / likes / reposts tabs | `GET /api/users/{username}/replies`, `/media`, `/likes`, `/reposts` | ✅ | 🔶 | ✅ all four, each paging on its own cursor (likes and reposts page on the join row, not the post); Likes is hidden unless it is your own profile or the account keeps likes public, matching the web | IMPLEMENTED |
| Profile analytics tab | `GET /api/user/posts/stats` — keyed by the SESSION, so there is no route for anyone else's numbers; returns the 20 newest posts and totals summed over exactly those | ✅ | ⬜ | ✅ own-profile only, for that reason; the scope is stated on screen rather than letting the totals read as lifetime figures | IMPLEMENTED |
| Follow / unfollow (+ request for private) | `POST /api/users/{username}/follow` | ✅ | ✅ | ✅ (all three outcomes: followed, unfollowed, request pending) | IMPLEMENTED |
| Followers / Following lists | `/followers`, `/following` → `{items,nextCursor}` | ✅ | ✅ | ✅ | IMPLEMENTED |
| Edit profile | `PUT /api/user/profile`, `POST /api/user/update-avatar`, `POST /api/user/update-cover` | ✅ | ✅ | ✅ loads the real profile first, so blanks it never read cannot erase a bio | IMPLEMENTED |
| Suggested users | `GET /api/users/suggested` | ✅ | ✅ | ✅ | IMPLEMENTED |
| Private-account gating | every content route returns `{items: []}`, not 403 | ✅ | 🔶 | ✅ (explains the account is private instead of showing "no posts") | IMPLEMENTED |
| Trust Passport | `GET /api/users/{username}/trust` — score, level, per-signal points and the breakdown are all computed server-side; the route's own comment says a client must never calculate them | ✅ | ⬜ | ✅ reached from any profile's menu; nothing is derived beyond the ring's fraction (reported score ÷ reported maximum); signal/category/level titles now also carry a `titleKey`/`descriptionKey` for localization — see L5 (FIXED) | IMPLEMENTED |

### Discovery

| Feature | Backend route(s) | Web | Android | iOS | Status (iOS) |
| --- | --- | --- | --- | --- | --- |
| Search (users + posts) | `GET /api/search?q=&type=all` (min 2 chars; 10 users / 20 posts, unpaginated) | ✅ | ✅ | ✅ | IMPLEMENTED |
| Trending hashtags | `GET /api/hashtags/trending` (bare array, server-cached, limit clamped 1–50) | ✅ | ✅ | ✅ | IMPLEMENTED |
| Hashtag search | `GET /api/hashtags/search?q=` (new - prefix match against every real hashtag, ranked by usage, `{items,nextCursor}`; distinct from the row above, which only exact-matches a tag already typed out in full as part of a broader post search) | ⬜ no search-as-you-type hashtag UI on any client yet | ⬜ | ⬜ backend-only so far - not built on any client | MISSING |
| Hashtag timeline | `GET /api/posts/hashtag/{tag}` — now cursor-paginated on request, same `?cursor=`/`?limit=` → `{items,nextCursor}` convention as every other paginated route; a request with neither still gets the unchanged bare array capped at 50 — **FIXED server-side** | ✅ (unchanged, legacy shape) | ✅ | ✅ same field available to consume; older posts under a popular hashtag were previously unreachable past the first 50 | IMPLEMENTED |
| Hashtag / mention tap-through in post text | — | ✅ | ✅ | ✅ | IMPLEMENTED |
| Explore / trending pages | `GET /api/posts/explore` | ✅ | 🔶 (For You tab) | 🔶 For You tab + a discover surface (trending tags, suggested people) | PARTIAL |

### Comments & replies

| Feature | Backend route(s) | Web | Android | iOS | Status (iOS) |
| --- | --- | --- | --- | --- | --- |
| Comment list on a post | `GET /api/posts/{id}/comments` (`{comments,nextCursor}`, paged by top-level thread) | ✅ | ✅ | ✅ | IMPLEMENTED |
| Create comment | `POST /api/posts/{id}/comments` | ✅ | ✅ | ✅ | IMPLEMENTED |
| Threaded replies | same, `parentId` | ✅ | ✅ | ✅ (full nested tree, indent capped for narrow screens) | IMPLEMENTED |
| Like a comment | `POST /api/comments/{id}/like` | ✅ | ✅ | ✅ | IMPLEMENTED |
| Repost / bookmark a comment | `POST /api/comments/{id}/repost` → `{reposted}`, `POST /api/comments/{id}/bookmark` → `{bookmarked}` | ✅ | ✅ | ✅ inline with counts, matching the web row | IMPLEMENTED |
| Delete comment | `DELETE /api/comments/{id}` | ✅ | ✅ | ✅ | IMPLEMENTED |
| Edit comment | `PUT /api/comments/{id}` | ✅ | ✅ | ✅ | IMPLEMENTED |

### Stories

| Feature | Backend route(s) | Web | Android | iOS | Status (iOS) |
| --- | --- | --- | --- | --- | --- |
| Story rail | `GET /api/stories` (bare array, grouped by author) | ✅ | ✅ | ✅ | IMPLEMENTED |
| Viewer + auto-progression + pause | — | ✅ | ✅ | ✅ (tap to step, hold to pause, swipe down to dismiss; video runs its real duration) | IMPLEMENTED |
| Mark viewed | `POST /api/stories/{id}/view` | ✅ | ✅ | ✅ | IMPLEMENTED |
| Like a story | `POST /api/stories/{id}/like` | ✅ | ✅ | ✅ | IMPLEMENTED |
| Create story (text/image/video) | `POST /api/stories` + UploadThing `storyMedia` | ✅ | ✅ | ✅ | IMPLEMENTED |
| Story expiry | server filters `expiresAt > now`; no client handling needed | ✅ | ✅ | ✅ | IMPLEMENTED |
| Story view counts | returned to everyone, shown only to the author | ✅ | 🔶 | ✅ | IMPLEMENTED |

### Messages

| Feature | Backend route(s) | Web | Android | iOS | Status (iOS) |
| --- | --- | --- | --- | --- | --- |
| Conversation list | `GET /api/messages` (bare array; partner, last message, unread count) | ✅ | ✅ | ✅ | IMPLEMENTED |
| Thread | `GET /api/messages/{userId}` — now cursor-paginated (`?cursor=`/`?limit=`), see [L1](#l1-message-threads-are-unpaginated) | ✅ | ✅ | ✅ cursor-paginated with a "Load more" at the top of the thread, shown only when the route reports more history | IMPLEMENTED |
| Send message | `POST /api/messages` | ✅ | ✅ | ✅ | IMPLEMENTED |
| Edit / delete message | `PUT /api/messages/edit/{id}`, `DELETE /delete/{id}` | ✅ | ✅ | ✅ (sender-only, 403-enforced) | IMPLEMENTED |
| Reactions | `POST /api/messages/reaction/{id}` — one per person; same emoji removes, different replaces | ✅ | ✅ | ✅ | IMPLEMENTED |
| Unread badge | `GET /api/messages/unread` | ✅ | ✅ | ✅ | IMPLEMENTED |
| Realtime | Socket.IO (`server.js`, path `/api/socket.io`, websocket transport, session-cookie handshake) | ✅ | ✅ (Socket.IO Java client) | ✅ Engine.IO v4 + Socket.IO framing written directly on `URLSessionWebSocketTask` — no dependency added. Live `receive-message`, `message-edited`, `message-deleted`, `reaction-updated`, `message-read`; polling stays as the fallback while the socket is down (30 s connected, 6 s not) | IMPLEMENTED |
| Typing indicator | `typing` → `user-typing` relay | ✅ | ✅ | ✅ throttled to one event every 2 s; the indicator clears itself after 5 s in case the "stopped" event is lost with the connection | IMPLEMENTED |
| Contact drawer (avatar, name, badge, handle, profile, block/mute, shared media) | `POST /api/users/{username}/block`, `POST /api/users/mute` | ✅ `ChatContactDrawer` | 🔶 | ✅ — **without Call and Video** | PARTIAL |
| Voice / video calling — placing/answering | WebRTC signalling over the same socket (`call-user`, `accept-call`, …) | ✅ simple-peer | ✅ | ❌ needs a WebRTC stack, which would be this app's first third-party dependency and a large one. Two permanently dead buttons would be worse than none — see the note in `ChatContactSheet.swift` | MISSING (reported) |
| Voice / video calling — **being called** | `incoming-call` → `reject-call` | ✅ | ✅ | ✅ declines immediately and tells the recipient who called, so the caller is released instead of ringing forever — see `IncomingCallResponder.swift` | IMPLEMENTED |
| Read receipts | side effect of `GET /api/messages/{userId}` | ✅ | ✅ | ✅ | IMPLEMENTED |
| Reply to a message | `POST /api/messages` + `replyToId` | ✅ | ✅ | ✅ | IMPLEMENTED |
| Delete a conversation | `DELETE /api/messages/conversation/{userId}` | ✅ | ✅ | ✅ | IMPLEMENTED |
| Image attachments | `POST /api/messages` + `imageUrl` (UploadThing `chatImage`, 4 MB); the route accepts an empty `content` **only** alongside an image and refuses both-empty with a 400 | ✅ | ✅ | ✅ one picture per message (the row stores a single `imageUrl`), uploaded on send rather than on selection, and a failed upload stops the send rather than silently dropping the picture | IMPLEMENTED |
| Voice messages | `POST /api/messages` / `POST /api/conversations/{id}/messages` + UploadThing `chatAudio` (8 MB) | ✅ | ✅ | ✅ records AAC/M4A so every other client can play it back, tap-to-start and tap-to-send (not hold-to-record, which is unusable with VoiceOver), a live level meter, and a shared player so a second note stops the first. Sent as `🎤 Voice message (m:ss)` — **that marker is the wire format**, not decoration: `Message` has no type column, so it is the only thing telling web and Android what the `imageUrl` is | IMPLEMENTED |
| Video attachments in chat | UploadThing `chatVideo` (32 MB) | ✅ | ✅ | ✅ picked from the library, sent as `🎬 Video`, played inline with AVKit | IMPLEMENTED |
| Document attachments | UploadThing `chatFile` (8 MB, `pdf`/`text`/`blob`) | ✅ | ✅ | ✅ picked from Files, sent as `📎 {filename}`, rendered as a file card that opens in whatever the device has. The picker allows any file type because the router's `blob` category does — narrowing it would hide files the server would accept | IMPLEMENTED |
| Reading attachments sent from web/Android | the same four markers | ✅ | ✅ | ✅ `ChatAttachment.swift` decodes `🎬`/`🎤`/`📎`/none into video, voice, document and image. Both halves matter: sending without the marker renders as a broken image everywhere, and reading a `🎤` as an image does the same here. VoiceOver announces the real kind rather than "Photo" for all four | IMPLEMENTED |

### ZRP PLAY

| Feature | Backend route(s) | Web | Android | iOS | Status (iOS) |
| --- | --- | --- | --- | --- | --- |
| PLAY home | `GET /api/play/home` | ✅ | ✅ | ✅ today's challenge, trending, the top of the leaderboard and the viewer's own standing; serves a signed-out reader with the personal parts absent | IMPLEMENTED |
| Play a challenge | `GET /api/play/challenges/{id}` + `POST .../submit` | ✅ | ✅ | ✅ all three types — trivia, logic (multiple-choice and free-text), and a real memory board | IMPLEMENTED |
| Scoring | `scoreTrivia` / `scoreMemory` / `scoreLogic`, server-side | ✅ | ✅ | ✅ **nothing is scored on the client.** `stripAnswers` removes the answers before the content leaves the server, so this app could not score a challenge even if it wanted to — it sends what the player did and displays what the server made of it | IMPLEMENTED |
| XP, level, streak, achievements | computed by the submit route and `xpProgress` | ✅ | ✅ | ✅ every figure is the server's; the level curve is never recomputed here | IMPLEMENTED |
| Leaderboard | `GET /api/play/leaderboard` | ✅ | ✅ | ✅ | IMPLEMENTED |
| Duels | `GET`/`POST /api/play/duels`, `/duels/{id}` | ✅ | ✅ | ⬜ opponent search, an invitation lifecycle (pending / accepted / declined / expired) and a result screen that waits for the other player — a module of its own | MISSING |
| Create a challenge | `POST /api/play/challenges`, `/challenges/generate` | ✅ | ✅ | ⬜ a builder for three different content shapes, plus the AI generator | MISSING |

### ZRP OPPORTUNITY

| Feature | Backend route(s) | Web | Android | iOS | Status (iOS) |
| --- | --- | --- | --- | --- | --- |
| Browse listings | `GET /api/opportunity` (`type`, `remote`, `q`, cursor) | ✅ | ✅ | ✅ public — the route serves it without a session | IMPLEMENTED |
| Type and remote filters | same route, the eleven `OpportunityType` values | ✅ | ✅ | ✅ | IMPLEMENTED |
| Listing detail | `GET /api/opportunity/{id}` — attaches `alreadyApplied` for a signed-in viewer | ✅ | ✅ | ✅ | IMPLEMENTED |
| Apply | `POST /api/opportunity/{id}/apply` | ✅ | ✅ | ✅ cover note; the route's own refusals ("already applied", "your own listing", "note too long") are shown as written | IMPLEMENTED |
| Apply externally | `externalUrl` on the listing | ✅ | ✅ | ✅ opens the link instead of posting an application — the field exists precisely so ZRP does not collect it | IMPLEMENTED |
| Attach a CV | `resumeUrl` on the apply body | ✅ | ✅ | ⬜ the field is sent as absent rather than empty; a résumé picker is not built | MISSING |
| Save a listing | `POST`/`DELETE /api/opportunity/{id}/save`; the detail route now reports `alreadySaved` (PR #150) | ✅ (web now hydrates from `alreadySaved`, was always `false` on load) | ✅ | ✅ the bookmark reflects real saved state on load. It stays indeterminate rather than showing "not saved" only when the route genuinely reports nothing — a signed-out viewer, who has nothing saved and no way to save it | IMPLEMENTED |
| Post a listing | `POST /api/opportunity` — created as `PENDING_REVIEW` | ✅ | ✅ | ✅ full composer: all eleven types, skills editor, deadline picker, paid/remote toggles, external URL. The route's own limits are mirrored so a refusal is not how anyone learns them, and the note says the listing is not live yet | IMPLEMENTED |
| Edit a listing | `PUT /api/opportunity/{id}` — poster or staff | ✅ | ✅ | ✅ same composer. A **substantive** edit (type, title, description, compensation) returns a live listing to `PENDING_REVIEW`; the warning appears only when the route's own four fields actually changed | IMPLEMENTED |
| Close a listing | `PUT /api/opportunity/{id}` with `status: "CLOSED"` | ✅ | ✅ | ✅ offered only on an ACTIVE listing, which is the only state the route honours it in — elsewhere it silently keeps the existing status | IMPLEMENTED |
| Delete a listing | `DELETE /api/opportunity/{id}` | ✅ | ✅ | ⬜ the repository method exists; no control surfaces it, because closing is what a poster actually wants and deletion discards the applications with it | MISSING (by design) |
| My listings / my applications | `GET /api/opportunity/my-listings`, `/my-applications` | ✅ | ✅ | ✅ one screen, two tabs. Listings show status and a moderator's rejection reason verbatim — `my-listings` is the only route that returns a listing that is not live | IMPLEMENTED |
| Review applicants | `GET /api/opportunity/{id}/applications` — poster or staff, 403 otherwise | ✅ | ✅ | ✅ cover notes, and the three decisions the route lets an owner set | IMPLEMENTED |
| Decide on an application | `PUT /api/opportunity/applications/{id}` | ✅ | ✅ | ✅ the route splits by role — an applicant may set only `WITHDRAWN` on their own application, an owner only `REVIEWED`/`ACCEPTED`/`REJECTED`. Each side is offered only its own statuses, so the 403 explaining the rule is never how anyone finds out | IMPLEMENTED |

### ZRP HELP (Aid)

| Feature | Backend route(s) | Web | Android | iOS | Status (iOS) |
| --- | --- | --- | --- | --- | --- |
| Browse campaigns | `GET /api/help` (`category`, `needType`, cursor) | ✅ | ✅ | ✅ public — the route serves it without a session | IMPLEMENTED |
| Category filter | same route, the five `HELP_CATEGORIES` | ✅ | ✅ | ✅ | IMPLEMENTED |
| Campaign detail | `GET /api/help/{id}` — reading it counts a view for anyone but the organiser | ✅ | ✅ | ✅ gallery, organiser, needs, description, and progress when money is one of the needs | IMPLEMENTED |
| Offer supplies / skills / time | `POST /api/help/{id}/offer` — accepts exactly those three, refuses `MONEY` | ✅ | ✅ | ✅ one button per need the campaign actually asks for; a money-only campaign gets none rather than a control that cannot work | IMPLEMENTED |
| **Contribute money** | `POST /api/help/{id}/contribute` — calls `rejectNativePayment()` | ✅ | ⬜ | ❌ **deliberately absent.** Every request from this app carries `x-zrp-native-app`, so that route can only refuse it (Apple 3.1.1). A button could produce nothing but that refusal | OUT OF SCOPE (store policy) |
| Create a campaign | `POST /api/help` — `organization` badge only | ✅ | ✅ | ⬜ the badge is granted by manual verification off the app, so a composer would refuse almost everyone who opened it. The website's own `help.orgOnlyNote` is shown instead | MISSING (by design) |
| Raised / goal figures | serialised as decimal strings by `jsonWithDecimals` | ✅ | ✅ | ✅ shown exactly as the server formatted them; a float is derived only for the progress bar's width, never for a figure on screen | IMPLEMENTED |

### ZRP AI

| Feature | Backend route(s) | Web | Android | iOS | Status (iOS) |
| --- | --- | --- | --- | --- | --- |
| AI chat | `POST /api/ai/chat` (DeepSeek-backed; per-plan daily limits enforced server-side) | ✅ streamed (SSE) | ✅ buffered | ✅ buffered | IMPLEMENTED |
| Streaming replies | same route, `stream: true` | ✅ | ⬜ | ⬜ the route's own non-streaming branch is used instead — identical rate limiting, persistence and conversation; the difference is only whether the answer appears word by word or after a loading state. Android documents the same choice, and nothing in either app has ever needed an SSE reader | PARTIAL (by design) |
| Daily allowance | reported by the route as `remaining` | ✅ | ✅ | ✅ displayed as the server reports it, never predicted | IMPLEMENTED |
| Limit reached | 429 with the route's own wording | ✅ | ✅ | ✅ shown verbatim rather than reworded | IMPLEMENTED |

### Support

| Feature | Backend route(s) | Web | Android | iOS | Status (iOS) |
| --- | --- | --- | --- | --- | --- |
| My tickets | `GET /api/support/tickets` — a bare array, newest first, unpaginated | ✅ | ✅ | ✅ no paging control, because there is nothing to page | IMPLEMENTED |
| Open a ticket | `POST /api/support/tickets` — eleven categories, and the route sets priority from the opener's plan | ✅ | ✅ | ✅ priority is deliberately **not** a field: a client choosing its own would be asking for a queue position it has no right to | IMPLEMENTED |
| Ticket thread | `GET /api/support/tickets/{id}` — 403 for a ticket the viewer does not own | ✅ | ✅ | ✅ status, category, priority, the opening message and every reply, with support's own replies marked | IMPLEMENTED |
| Reply | `POST /api/support/tickets/{id}/reply` — refused on a resolved or closed ticket | ✅ | ✅ | ✅ the composer is not offered on one, and the thread is refetched after a reply because a reply also moves the ticket's status server-side | IMPLEMENTED |
| Delete a ticket | `DELETE /api/support/tickets/{id}` — only once resolved or closed | ✅ | ✅ | ✅ offered only where the route would allow it | IMPLEMENTED |

### Explore

| Feature | Backend route(s) | Web | Android | iOS | Status (iOS) |
| --- | --- | --- | --- | --- | --- |
| Explore — people | `GET /api/users/suggested?limit=50` | ✅ `/explore/people` | ⬜ | ✅ full list with follow, at the same fifty the website asks for rather than the ten Search previews | IMPLEMENTED |
| Explore — trending tags | `GET /api/hashtags/trending?limit=50` | ✅ `/explore/trending` | ⬜ | ✅ | IMPLEMENTED |
| Explore — trending posts | `GET /api/posts/explore` | ✅ `/explore` | ⬜ | ✅ **as the Home "For You" tab** — the same route and the same feed. Rebuilding it inside Explore would be a second copy of a screen one tap away | IMPLEMENTED (elsewhere) |
| Follow from a list | `POST /api/users/{username}/follow` | ✅ | ✅ | ✅ the route is a toggle and its own answer is what is recorded, never an assumption about what the tap did | IMPLEMENTED |

### ZRP News

| Feature | Backend route(s) | Web | Android | iOS | Status (iOS) |
| --- | --- | --- | --- | --- | --- |
| News feed | `GET /api/news` (`category`, `cursor`, `limit`; the cursor is a `publishedAt` timestamp, not an opaque token, and an unparseable one is a 400) | ✅ | ✅ | ✅ cursor-paginated, public — the route serves it without a session, exactly as zrp.one/news does | IMPLEMENTED |
| Category filter | same route, `?category=` against the schema's eleven `NewsArticleCategory` values | ✅ | ✅ | ✅ same eleven chips and the same "All" default; an unknown category decodes to a value that is never sent back as a filter, so a category added server-side cannot break an older build | IMPLEMENTED |
| Article | `GET /api/news/{slug}` — reading it is what increments the view tally, server-side | ✅ | ✅ | ✅ cover, category, byline (linking to the author's profile), excerpt, body, and the original source opened in the browser | IMPLEMENTED |
| Article body formatting | — | rich | ✅ | 🔶 rendered as stored plain text. The route defines no markup, and interpreting one would be inventing a format the backend does not have | PARTIAL (by design) |

### Notifications

| Feature | Backend route(s) | Web | Android | iOS | Status (iOS) |
| --- | --- | --- | --- | --- | --- |
| Notification list | `GET /api/notifications` (bare array, 50 max, unpaginated) | ✅ | ✅ | ✅ | IMPLEMENTED |
| Mark all read | `PUT /api/notifications` (all-at-once is the only granularity offered) | ✅ | ✅ | ✅ | IMPLEMENTED |
| Unread badge | `GET /api/notifications/unread` | ✅ | ✅ | ✅ | IMPLEMENTED |
| Notification tap-through | — | ✅ | ✅ | ✅ like/comment/repost → post, follow → profile, message → thread, appeal outcome → Appeals, listing decision → My listings (the payload carries no listing id, so it leads to where the outcome is visible rather than guessing at one) | IMPLEMENTED |
| Unrecognised notification types | — | 🔶 renders with no action phrase | 🔶 same | 🔶 same, deliberately | PARTIAL |
| Web Push (VAPID) | `POST /api/push/subscribe` | ✅ | n/a | n/a | WEB-ONLY |
| **Device push** | `POST/DELETE /api/push/fcm` accepts `platform: "ios"` and includes a deep-link `data.url`; delivery goes through `firebase-admin/messaging` | n/a | ✅ FCM | ❌ blocked on an APNs key, a `GoogleService-Info.plist`, **and an unresolved dependency decision** — an FCM token on iOS can only come from the Firebase iOS SDK, which this app's zero-dependency architecture excludes. The alternative is a direct APNs sender server-side, which does not exist | **BLOCKED — [B3](#b3-ios-device-push)** |

### Music

| Feature | Backend route(s) | Web | Android | iOS | Status (iOS) |
| --- | --- | --- | --- | --- | --- |
| Music home | `GET /api/music/home` (8 sections in one response) | ✅ | ✅ | ✅ | IMPLEMENTED |
| Discover / genres | `GET /api/music/genres`, `GET /api/music/tracks` | ✅ | ✅ | ✅ | IMPLEMENTED |
| Artists / artist detail / follow | `/api/music/artists`, `/{id}`, `/{id}/follow` | ✅ | ✅ | ✅ | IMPLEMENTED |
| Albums / album detail | `/api/music/albums`, `/{id}` | ✅ | ✅ | ✅ | IMPLEMENTED |
| Playlists (browse + detail) | `/api/music/playlists`, `/{id}` | ✅ | ✅ | ✅ | IMPLEMENTED |
| Playlist create / edit / delete | `POST /api/music/playlists`; `PATCH` and `DELETE /api/music/playlists/{id}` (owner-only, 404 for anyone else) | ✅ | ✅ | ✅ the PATCH reads by key presence, so an emptied description is sent as an explicit null — a deliberate clear, not an omission | IMPLEMENTED |
| Playlist add / remove a track | `POST /api/music/playlists/{id}` + `trackId` → `{added}`; it is a **toggle**, not an add — a track already in the playlist is removed | ✅ | ✅ | ✅ from Now Playing (a screen that is never recycled, so its sheet cannot be torn down mid-presentation as one raised from a lazy row would be), and by swipe in the curate sheet | IMPLEMENTED |
| Playlist reorder | `POST /api/music/playlists/{id}/reorder` + `orderedIds` — the **join-row** ids, not track ids | ✅ | ✅ | ✅ drag to reorder in a modal `List`, which is what gives `onMove` at all — the detail screen's `LazyVStack` has no move gesture | IMPLEMENTED |
| Track like | `POST /api/music/tracks/like` | ✅ | ✅ | ✅ | IMPLEMENTED |
| Play reporting + duration backfill | `POST /api/music/tracks/play` | ✅ | ✅ | ✅ (reports AVPlayer's real decoded duration, repairing tracks stored without one) | IMPLEMENTED |
| Liked / library / history pages | `GET /api/music/library` | ✅ | ✅ | ✅ full Liked and History pages | IMPLEMENTED |
| Queue | client-side | ✅ | ✅ | ✅ dedicated queue screen driven by the live `MusicPlayer` queue, not a copy of it | IMPLEMENTED |
| Mini + expanded player, seek, shuffle, repeat | client-side | ✅ | ✅ | ✅ (persistent across navigation) | IMPLEMENTED |
| Background audio | `UIBackgroundModes: audio` + `AVAudioSession .playback` | n/a | ✅ | ✅ | IMPLEMENTED |
| Lock screen / Now Playing | `MPNowPlayingInfoCenter` + `MPRemoteCommandCenter` | n/a | ✅ | ✅ (title, artist, album, artwork, scrubbing) | IMPLEMENTED |
| Interruptions & route changes | `AVAudioSession` notifications | n/a | ✅ | ✅ (resumes only when the system says to; pauses on headphone unplug) | IMPLEMENTED |
| AirPlay | system-provided via `AVAudioSession` | n/a | ✅ | ✅ `AVRoutePickerView` on Now Playing — the only API that can enumerate and switch routes | IMPLEMENTED |

### Music Studio

| Feature | Backend route(s) | Web | Android | iOS | Status (iOS) |
| --- | --- | --- | --- | --- | --- |
| Publish authorization gate | `GET /api/music/access` | ✅ | ✅ | ✅ read to decide what to show; enforced server-side twice | IMPLEMENTED |
| Apply as artist | `POST /api/music/artists` | ✅ | ✅ | ✅ | IMPLEMENTED |
| Artist profile edit (name, bio, avatar, banner) | `GET /api/music/artists?mine=true`, `POST /api/music/artists` | ✅ | ✅ | ✅ three-state field encoding; loads every field before saving | IMPLEMENTED |
| Track upload + publish | UploadThing `musicTrack` + `POST /api/music/tracks` | ✅ | ✅ | ✅ audio + cover in one presign; retry publishes without re-uploading | IMPLEMENTED |
| Own tracks (any status) | `GET /api/music/tracks?mine=true` | ✅ | ✅ | ✅ | IMPLEMENTED |
| Edit track metadata | `PATCH /api/music/tracks/{id}` | ✅ | ✅ | ✅ title, description, genre, explicit, cover, album | IMPLEMENTED |
| Delete track | `DELETE /api/music/tracks/{id}` | ✅ | ✅ | ✅ | IMPLEMENTED |
| Own albums | `GET /api/music/albums?mine=true` | ✅ | ✅ | ✅ | IMPLEMENTED |
| Create / edit / delete album | `POST /api/music/albums`, `PATCH`/`DELETE /{id}` | ✅ | ✅ | ✅ | IMPLEMENTED |
| Add / remove album tracks | `PATCH /api/music/tracks/{id}` (`albumId`) | ✅ | ✅ | ✅ | IMPLEMENTED |
| Reorder album tracks | `POST /api/music/albums/{id}/reorder` | ✅ | ✅ | ✅ | IMPLEMENTED |
| Artist verification | `POST /api/admin/music/artists/{id}/verify` | ✅ | ❌ | ❌ | STAFF/ADMIN |

### Marketplace

| Feature | Backend route(s) | Web | Android | iOS | Status (iOS) |
| --- | --- | --- | --- | --- | --- |
| Browse / category / search | `GET /api/listings` | ✅ | ✅ | ✅ cursor-paged, filters, sort | IMPLEMENTED |
| Listing detail | `GET /api/listings/{id}` | ✅ | ✅ | ✅ gallery, seller, views | IMPLEMENTED |
| Favorites | `POST /api/listings/{id}/favorite`, `GET /api/listings/favorites` | ✅ | ✅ | ✅ | IMPLEMENTED |
| Create / edit listing | `POST /api/listings`, `PUT /api/listings/{id}` | ✅ | ⬜ | ✅ multi-photo via UploadThing `listingMedia` | IMPLEMENTED |
| My listings (all statuses + rejection reason) | `GET /api/listings/mine` | ✅ | ⬜ | ✅ | IMPLEMENTED |
| Delete listing | `DELETE /api/listings/{id}` | ✅ | ⬜ | ✅ | IMPLEMENTED |
| Contact seller | existing messaging + prefilled draft | ✅ | ✅ | ✅ same opening line and listing link the web composes | IMPLEMENTED |
| Listing video | `videoUrl` on the listing (one per listing — a single column, not part of `imageUrls`); size capped by the seller's plan in the UploadThing router's middleware | ✅ | ⬜ | ✅ added and removed in the composer through the `listingMedia` uploader, played full-screen from the detail; a removal is sent as an explicit null, since the write request always carries the key | IMPLEMENTED |
| Report a listing | `POST /api/reports` (`listingId`) | ✅ | ✅ | ✅ from the listing detail screen | IMPLEMENTED |
| Purchase flow | — **none exists** (price informational, deals close off-platform) | n/a | n/a | n/a | n/a — must never be invented |

### Moderation & safety

| Feature | Backend route(s) | Web | Android | iOS | Status (iOS) |
| --- | --- | --- | --- | --- | --- |
| Report post / comment / listing | `POST /api/reports` | ✅ | ✅ | ✅ posts and listings; the site's exact stored reason strings | IMPLEMENTED |
| Report a comment | `POST /api/reports` (`commentId`) | ✅ | ✅ | ✅ | IMPLEMENTED |
| Block / unblock | `POST /api/users/{username}/block` | ✅ | ✅ | ✅ toggle from the blocked list | IMPLEMENTED |
| Blocked list | `GET /api/users/blocked` (bare array) | ✅ | ✅ | ✅ | IMPLEMENTED |
| Mute / unmute | `GET/POST /api/users/mute` | ✅ | ✅ | ✅ toggle from the muted list | IMPLEMENTED |
| Muted list | `GET /api/users/muted` (bare array) | ✅ | ✅ | ✅ | IMPLEMENTED |
| Block / mute **from a profile** | same routes | ✅ | ✅ | ✅ not offered on your own profile, which the routes refuse anyway | IMPLEMENTED |
| Appeals | `GET /api/appeals` → `{eligibleReports, appeals}` in one call; `POST /api/appeals` requires a message ≤2000 chars (400), answers 404 for a report that is not this account's actioned one, 409 for a second appeal on the same report, and is rate limited to 10 per ten minutes | ✅ | ⬜ | ✅ an entry in `eligibleReports` is appealable by construction, so nothing is re-checked before offering the button; action types are shown the way the web shows them (`post_removed` → `post removed`) because there is no dictionary of them to translate against | IMPLEMENTED |
| Feed-level block/mute filtering | server-side in `/api/posts/explore` | ✅ | ✅ | ✅ (inherited from server) | IMPLEMENTED |

### Settings

| Feature | Backend route(s) | Web | Android | iOS | Status (iOS) |
| --- | --- | --- | --- | --- | --- |
| Settings hub | — | ✅ | ✅ | ✅ | IMPLEMENTED |
| Security (password) | `PUT /api/user/password` | ✅ | ✅ | ✅ | IMPLEMENTED |
| Privacy (private account, public likes/following) | `PUT /api/user/privacy` | ✅ | ✅ | ✅ | IMPLEMENTED |
| Account deletion — 30-day schedule / cancel | `GET /api/user/delete-status`, `POST /api/user/delete` | ✅ | ✅ | ✅ web's own button reaching this path at all was broken until [F5](#f5-account-deletions-30-day-grace-period-never-actually-applied--fixed-server-side--web); a cron sweep now actually enforces the 30 days | IMPLEMENTED |
| Account deletion — immediate and permanent | `POST /api/user/delete/confirm` | ✅ | ✅ | ✅ typed DELETE gate, as on web | IMPLEMENTED |
| Data export | `GET /api/settings/export-data` | ✅ | ⬜ | ✅ downloaded to a file and handed to the share sheet | IMPLEMENTED |
| Account (email, username) | `GET/PUT /api/user/username`, `PUT /api/user/email` | ✅ | ✅ | ✅ 30-day username cooldown surfaced before typing; email change states that it needs verification | IMPLEMENTED |
| Email preferences | `GET`/`PUT /api/user/email-preferences` — six booleans; `PUT` merges what it is given and refuses any unknown key with a 400 | ⬜ **no web UI** (correcting an earlier error in this matrix: nothing in `src/` calls the route) | ⬜ | ✅ | IMPLEMENTED (iOS-only today) |
| Language (11 languages, `ar` RTL) | client-side preference | ✅ | ✅ | ✅ in-app picker, generated from the web's `SUPPORTED_LANGUAGES`; sets locale and layout direction | IMPLEMENTED |
| Plan / limits | `GET /api/user/plan`, `src/lib/limits.ts` | ✅ | ✅ | 🔶 composer and listing forms pre-check what the server enforces; the server's own limit message is shown verbatim | PARTIAL (by design) |
| Plan upgrade / monetisation / wallet surfaces | web billing | ✅ | ✅ | ❌ deliberately absent — see [Store policy constraint](#store-policy-constraint) | OUT OF SCOPE |

### Creator Studio

| Feature | Backend | Web | Android | iOS | Status |
| --- | --- | --- | --- | --- | --- |
| Content performance | `GET /api/creator/studio` → `content` (30-day totals, daily engagement trend, top 5 posts ranked server-side by `likes + comments*2 + reposts*3`) | ✅ | ⬜ | ✅ totals, trend chart and the ranked posts, each opening the post | IMPLEMENTED |
| Audience growth | same route → `audience` (total followers, new in window, daily curve) | ✅ | ⬜ | ✅ | IMPLEMENTED |
| Earnings / Overview tab | `GET /api/creator/dashboard`, `POST /api/creator/withdraw` | ✅ | ⬜ | ❌ deliberately absent — see [Store policy constraint](#store-policy-constraint) | OUT OF SCOPE |

The route is signed-in only and scoped to the caller by the session — there
is no user parameter, so it can only ever return the viewer's own numbers.
It is **not** role-gated: any account sees its own statistics, exactly as on
the website.

Two figures are the server's approximations and are shown as sent rather
than recomputed. `topPosts` arrives pre-ranked, so the weighting is not
written down a second time on the client where the two could drift. And the
follower curve is reconstructed by working backwards from today's total
without subtracting unfollows inside the window — the route says so in its
own comment, and re-deriving it here would not make it more accurate, only
differently wrong.

Day keys (`YYYY-MM-DD`) come from `toISOString().slice(0, 10)`, a **UTC**
boundary, and are displayed as strings. Parsing them into local `Date`s
would shift a day for anyone west of UTC and make the axis labels disagree
with the server's own buckets.

### Ads (viewing)

| Feature | Backend route(s) | Web | Android | iOS | Status (iOS) |
| --- | --- | --- | --- | --- | --- |
| Sponsored post in the feed | `GET /api/ads/serve` → `{ad}` (usually `null`); picks at random among ACTIVE campaigns that still have budget, and never the viewer's own | ✅ `AdCard.tsx`, after the post at index 4 when the feed has more than five | ✅ | ✅ same slot and same rule, on both feed tabs — the web's ad block carries no `feedType` guard, unlike the discovery modules directly beneath it in the same map, so that difference is deliberate and copied | IMPLEMENTED |
| Impression tracking | `POST /api/ads/impression` | ✅ IntersectionObserver at 0.5 | ✅ | ✅ measured against the key window at the same 0.5 threshold, fired once. **Not `.onAppear`** — a `LazyVStack` builds a row slightly before it is visible, which is fine for a view tally and not for something an advertiser is billed for | IMPLEMENTED |
| Click tracking + destination | `POST /api/ads/click` → `{logged, redirectUrl}` | ✅ | ✅ | ✅ the destination comes from the route, not from `targetUrl` locally — an advertiser who set none gets `/post/{id}` back. A relative path opens in-app; an advertiser's own URL opens in the browser, where the address bar shows whose site it is | IMPLEMENTED |
| Author tap is not a click | — | ✅ | ✅ | ✅ opening the advertiser's profile is not the billed event, the same line `PostCard` draws between its author link and its body | IMPLEMENTED |

The ad card deliberately reuses **none** of the post card's engagement
machinery. The serve route sends no counts and no viewer flags, and there
is no route to like, repost or reply to an ad — a post card here would
show four controls with nothing behind them. `AdCard.tsx` reuses none of
`PostCard` for the same reason; this matches that decision rather than
arriving at a different one.

A video ad shows its poster frame and does not autoplay. The feed has one
shared `AVPlayer` that belongs to the timeline, and letting a sponsored
post take it would interrupt the video someone was actually watching.

The ad is fetched **once per app run**, not per feed load. The route picks
at random among eligible campaigns, so refetching on pull-to-refresh would
swap the ad under a reader mid-scroll and bill a second impression for
what is, to them, the same slot. The website fetches once on mount too.


### Group conversations

| Feature | Backend | Web | Android | iOS | Status (iOS) |
| --- | --- | --- | --- | --- | --- |
| Group inbox | `GET /api/conversations` → `{id,name,avatarUrl,participantCount,lastMessage,unreadCount}[]` | ✅ | ✅ | ✅ merged with 1:1 into one list sorted by last activity — `GET /api/messages` filters on `conversationId IS NULL` and returns direct threads only, so an inbox that shows both must ask both routes | IMPLEMENTED |
| Group thread | `GET /api/conversations/{id}/messages` (`{items,nextCursor}`, born paginated) | ✅ | ✅ | ✅ with "Load more", the same merge-not-assign refresh as the 1:1 thread | IMPLEMENTED |
| Send to a group | `POST /api/conversations/{id}/messages` | ✅ | ✅ | ✅ the route's own refusals (empty, too long, media not from ZRP storage) shown as written | IMPLEMENTED |
| Realtime group delivery | `join-conversation` → room `group:{id}` → `receive-group-message` | ✅ | ✅ | ✅ joins the room on open and leaves on close. **Joining is required** — group relays go to a room, not to a user's own room, so without it the thread would silently degrade to polling | IMPLEMENTED |
| Group members | `GET /api/conversations/{id}` | ✅ | ✅ | ✅ member list with the OWNER marked | IMPLEMENTED |
| Leave a group | `DELETE /api/conversations/{id}/participants/{userId}` | ✅ | ✅ | ✅ removing yourself. The same route removes **someone else**, but only for an OWNER — see below | IMPLEMENTED |
| Create a group | `POST /api/conversations` | ✅ | ✅ | ✅ name + member picker, reusing `GET /api/users/suggested` for the starting list and `GET /api/search` (debounced, 2-char minimum, matching the route's own rule) for typing. The route's limits are mirrored — a name ≤100 and **at least 2 other members** — so the button says what is still needed instead of just being disabled | IMPLEMENTED |
| Rename a group | `PATCH /api/conversations/{id}` — OWNER only (403 otherwise) | ✅ | ✅ | ✅ offered only to an owner, so the 403 is not how anyone learns the rule. The route's empty-name and 100-character limits are mirrored | IMPLEMENTED |
| Set / clear a group photo | `PATCH /api/conversations/{id}` — OWNER only | ✅ | ✅ | ✅ uploads through the `chatImage` router, the same entry the website's group panel uses — the route runs `isAllowedMediaUrl` on whatever it is given, so a group picture must come from ZRP's own storage. Setting and clearing are distinguishable because the request encodes an **explicit JSON null** for "clear" rather than omitting the field | IMPLEMENTED |
| Add members | `POST .../participants` — **any member**, not owner-only | ✅ | ✅ | ✅ reuses the same picker as group creation, with current members excluded and the remaining capacity as its cap. Corrects this file's own earlier claim that adding was OWNER-only: the route's comment says any current member may add, and matching that keeps iOS from being stricter than web and Android for no reason | IMPLEMENTED |
| Remove another member | `DELETE .../participants/{userId}` — OWNER only | ✅ | ✅ | ✅ swipe action, offered only to an owner and never for an owner or for yourself — leaving is its own action with its own confirmation | IMPLEMENTED |
| Reactions / replies / edit in a group | — | ⬜ | ⬜ | ⬜ **no backend for it**: `GROUP_MESSAGE_INCLUDE` attaches only `sender`, and no route acts on a group message beyond deleting your own. Absent on every platform, not an iOS gap | n/a |

| Presence (online dots) | `get-status` / `user-status` over the socket | ✅ | ✅ | ✅ shared `PresenceStore`; asks on open and re-asks on reconnect, because presence is per-connection server-side. An unreported user shows **no dot** rather than a grey one — absent is "not known", not "offline" | IMPLEMENTED |
| Conversation deleted by the other party | `conversation-deleted` | ✅ | ✅ | ✅ the row disappears instead of sitting there until a manual refresh and then opening an empty thread | IMPLEMENTED |

The Messages badge is fixed by the inbox, not by badge code.
`GET /api/messages/unread` returns `directCount + groupCount`; iOS read
that while its inbox showed only direct threads, so a group message
raised a badge the person could never clear. Opening a group thread
advances their `lastReadAt` server-side, which is what makes the count
fall — and the list refreshes the badge on appear, because the tab only
refetched it when the Messages tab was *selected* and popping back from a
thread does not change tabs.

### Transparency

| Feature | Backend route(s) | Web | Android | iOS | Status (iOS) |
| --- | --- | --- | --- | --- | --- |
| Charity ledger | `GET /api/transparency/charity` — **public**, takes no session | ✅ | ✅ | ✅ native screen (not a web view): committed and disbursed kept apart as the route keeps them, per-cause breakdown, and the real disbursement records with proof links where they exist | IMPLEMENTED |
| Moderation transparency | `GET /api/transparency/moderation` — **public**, takes no session, aggregate counts only | ✅ | ✅ | ✅ native screen, works signed out. Totals, a 12-month received-vs-actioned trend, breakdowns by reason, status and action type, and appeal outcomes. Both trend series share **one** scale — scaling them apart would make 3 actions out of 300 reports look like near-total enforcement. A null median renders as an em dash, never "0h": no report ever actioned is not instant moderation. Reuses the web page's own label maps, including the `adminReports.*` status and action wording that page borrows | IMPLEMENTED |

`committed` and `disbursed` are never added together. The route computes
the first from completed tips and premium purchases (what the commitment
*owes*) and the second from real payment records staff entered (what has
actually moved), and says so in its own `note`. Collapsing them into one
total would claim ZRP had paid out money it may only have promised — on
the one page whose whole purpose is being checkable.

A disbursement whose `cause` this app does not recognise renders its raw
value rather than being hidden. That is the opposite of the milestone-badge
rule, deliberately: a badge is decoration, a disbursement is a financial
record, and dropping one from a public ledger because of an unknown
category would be worse than an untranslated word.

### Deliberately out of scope for the consumer iOS app

| Area | Reason |
| --- | --- |
| **Admin console** (`/api/admin/**`, 40+ routes) | **Web-only for v1, by decision — not an oversight.** Android ships four admin screens; iOS ships none. Every admin route is independently role-gated server-side, so an iOS app without an admin surface loses no security and gains none: hiding a screen is not what protects those routes, and building one would not weaken them either. The reason to leave it out is product, not safety — a staff console is a desk-and-keyboard tool, and the four screens Android has cover a fraction of the twenty the website offers. Anyone doing moderation work should be on the web console that has all of it. Revisit only if staff genuinely need to act from a phone; if so, build it against the same server-role gate and never surface an admin control on a client check alone. |
| Tips, plan upgrade, premium-post purchase, help/charity contribution, creator withdrawals | Blocked in native apps by `rejectNativePayment()` (Apple 3.1.1). iOS **must** send `x-zrp-native-app: 1` and must not surface this UI. See [Store policy](#store-policy-constraint). |
| Careers, Investors, Press | WEB-ONLY — Android has no surface for any of them either. Marketing and corporate pages with no JSON route to read. |
| **Ads** — advertiser side (`/api/ads/campaigns`, `src/app/ads`, `src/app/ads/new`) | Campaign creation is ad *spend* — money leaving an advertiser's account for placement. That is a commerce surface with the same store-policy exposure as the payment routes above, and it is a desk task besides. **The viewing side is a different question and is now built** — see the Ads section below. |
| **Journalist** (`/api/journalist/**`) | **Outstanding, and narrow.** Every route is behind `requireJournalistRole()`, so the only part most people could use is the application form. The rest is an article editor with a draft/review/publish workflow — a professional writing tool, and a poor fit for a phone. Worth building when journalists ask for it, not before. |
| **Creator Studio** — earnings half (`/api/creator/dashboard`, `/withdraw`) | Balance, tips, premium revenue and withdrawals are the monetisation surface the row above already excludes. |

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

## Build toolchain

App Store Connect has refused uploads built with anything below **Xcode 26
and an iOS 26 SDK since 28 April 2026**
([Apple, Upcoming Requirements](https://developer.apple.com/news/upcoming-requirements/)):

> "Apps uploaded to App Store Connect must be built with Xcode 26 or later
> using an SDK for iOS 26, iPadOS 26, tvOS 26, visionOS 26, or watchOS 26."

The CI workflow originally pinned `runs-on: macos-15` and selected no Xcode
at all, so every build silently used that image's *default* - Xcode 16.4
with the iOS 18.5 SDK. Those builds compiled correctly and were entirely
useless as evidence of submittability.

`ios-native-build.yml` now:

1. **Selects** the highest installed Xcode with major version >= 26, rather
   than hardcoding a path - the image's exact point release moves with
   every image bump. If no such Xcode exists it **fails the job** and
   prints what is installed. It never falls back to an older toolchain.
2. **Reports** `xcodebuild -version`, both `xcrun --show-sdk-version`
   values, and `sw_vers` verbatim, so the toolchain is readable straight
   from the log instead of inferred from an `-sdk` path.
3. **Asserts** Xcode, iOS device SDK and iOS Simulator SDK are all major
   version >= 26, failing with a specific reason otherwise. This gate was
   tested against the old 16.4 / 18.5 toolchain to confirm it rejects it.
4. **Builds for device** (`generic/platform=iOS`) as well as the simulator.
   An App Store archive compiles against the *device* SDK, so that build is
   what actually demonstrates the app compiles the way a submission would.

`IPHONEOS_DEPLOYMENT_TARGET` stays at 17.0. Deployment target and build SDK
are independent axes: building against the iOS 26 SDK does not drop iOS 17
support.

Signing, archiving and export remain Phase 19 - this module has no
provisioning profile of its own yet, and Sign in with Apple and push are
both still blocked server-side (B2, B3 below).

## Known backend limitations

### L1. Message threads are unpaginated - **FIXED server-side**

`GET /api/messages/{userId}` used to run a `findMany` with no `take`, no
cursor and no limit: it returned **every message ever exchanged** with
that user, oldest first, with each message's sender, `replyTo` and
reactions included. A long-running conversation therefore transferred its
entire history on every open - and, because the client polls while a
thread is open, on every poll.

The route now accepts `src/lib/pagination.ts`'s standard `?cursor=`/
`?limit=` params, the same convention every other paginated route in this
app uses, ordered newest-first internally and reversed back to
chronological order in the response. It stays **request-shape backward
compatible**: a request with neither param (what web's `ChatInterface.tsx`
and the shipped Android app both still send) gets the newest page as a
bare array - byte-for-byte the old response shape, just capped at 100
messages instead of unbounded - while a request that supplies `cursor`
and/or `limit` gets the `{items, nextCursor}` envelope every other
paginated route already returns. Opening a conversation still marks the
whole thread's unread messages read regardless of page size, unchanged
from before.

**iOS now uses it.** `MessagesRepository.thread(with:before:limit:)`
always sends `limit`, which is what makes the envelope - and therefore
the cursor - available at all; a request without it would get the bare
array and no way to reach anything before it. A "Load more" appears at
the top of a thread exactly when `nextCursor` is non-nil, so it is the
route's own answer about whether more exists rather than a control that
might do nothing.

Two details that make it work rather than merely exist. The scroll-to-
bottom is keyed on the newest message's identity, not on the message
count: prepending history changes the count, and the old rule would have
thrown the reader straight back out of the history they had just asked
for. And a refresh merges rather than assigns - once someone has paged
back, the array reaches further than any newest-page request returns, so
assigning would silently discard it. Older messages are kept, the
newest page replaces the range it covers (which is how an edit, a
reaction or someone else's deletion lands), and the refresh is sized to
cover what is on screen up to the route's 100-message cap. Beyond that
cap the older pages are merged rather than refetched, which is the one
place a stale reaction can persist until the thread is reopened.

Web and Android are unchanged and still send neither param, so both
still get the bare-array shape they expect.

### L2. `GET /api/music/playlists/{id}` does not report per-track `liked` - **FIXED server-side**

Every other route that returns music tracks tells the caller whether the
signed-in viewer has liked each one: `/api/music/home`, `/api/music/tracks`
(line 104), `/api/music/artists/{id}` and `/api/music/albums/{id}` all
attach a `liked` boolean. The playlist detail route did not - it returned
the join rows and their tracks with no like state at all.

The visible effect was the same on every client: a track opened from a
playlist showed an empty heart even when the viewer had liked it, until
some other screen loaded the same track. iOS did **not** paper over this
by assuming `false`; `MusicLikeStore` treats a missing flag as "unknown"
and keeps whatever it already knows, so the heart was right whenever any
other surface had reported it.

`GET /api/music/playlists/{id}` now attaches `liked` on each track the
same way `/api/music/albums/{id}` and `/api/music/artists/{id}` already
do: one `musicLike.findMany` scoped to the signed-in viewer and the
playlist's own track ids, `false` for every track when there is no
session. The response shape is unchanged otherwise - `liked` sits on the
nested `track` object inside each `{ id, position, track }` row, matching
where every other route that returns full track objects puts it (and
where iOS's `MusicTrack` already expects to find it), so no client needs
any changes to pick it up.

### L5. The Trust Passport's signal text is hardcoded English - **FIXED server-side + web**

`GET /api/users/{username}/trust` built its `breakdown` and `signals`
with English `title` and `description` strings written into the route
("Email verified", "Positive profile completeness signals."), and the
level's own `levelLabel` likewise. None of them existed in
`src/lib/translations.ts`, so there was nothing to translate against.

The website had the same limitation: it translated its own chrome and
rendered the route's strings as they arrived. iOS did the same rather
than inventing a dictionary for values the backend could add to at any
time — a guessed label is worse than an untranslated one on a screen
whose whole point is transparency.

Every `title`/`description` in `breakdown` and `signals`, every entry in
`additionalSignals`, and `passport.levelLabel` now carry a sibling
`titleKey`/`descriptionKey` (plus `descriptionParams` where the text is
parameterized, e.g. the account-age signal's month count) that matches a
real entry in `src/lib/translations.ts` — five of those entries
(`trust.category*Desc`, one per breakdown category) are newly added,
across all 11 locales; the rest already existed. This is the same
"backend sends a stable key, each client owns the wording" contract
already used for `src/lib/milestones.ts`. The old English `title`/
`description`/`levelLabel` fields are unchanged, so nothing that already
renders them breaks.

The four breakdown-only signals with no top-level equivalent (the
per-tier account-age and per-activity community entries under
`history`/`community`) intentionally have no key yet — nothing renders
them today, so a key with no real dictionary backing would just be a
different kind of prose to guess at.

The website's `src/app/trust/[username]/page.tsx` now reads `titleKey`/
`descriptionKey`/`categoryTitleKey`/`levelLabelKey` from the response
instead of keeping its own second copy of the signal-key mapping — the
two copies had already partially drifted before this fix (the page's
map only covered the top-level `signals`, not `breakdown`, and existed
only in the web bundle iOS and Android can't see). The API response is
now the one place that mapping lives.

iOS and Android can adopt the same fields whenever it's their turn:
prefer `titleKey`/`descriptionKey` when present, using the same
translation values as `src/lib/translations.ts` (or an equivalent
per-platform dictionary keyed the same way), and fall back to the raw
`title`/`description` only when a key is absent.

### L4. The email-preference setting is enforced but unreachable

`src/lib/notifications.ts` reads a user's `emailPreferences` before
sending any notification email, and `GET`/`PUT /api/user/email-preferences`
is a complete, working pair over it. Nothing calls that route: there is
no UI for it anywhere in `src/`, and Android has none either.

So the setting is honoured but cannot be changed by anyone. Everyone sits
on the default - all six on - whether they want to or not.

iOS now exposes it, in Settings. That is the first surface for an
existing, enforced backend capability rather than a new one: the route,
its six keys and its merge behaviour are used exactly as written, and
nothing about it is invented. Web and Android would benefit from the
same screen.

### L3. The explore feed does not select polls - **FIXED server-side**

`GET /api/posts?tab=following` and `GET /api/posts/{id}` both `include`
the post's `poll` (with the viewer's own vote rows). `GET /api/posts/explore`
used to not select it at all, so a poll post arriving in **For You** carried
no poll — indistinguishable, in the payload, from a post that never had
one.

`explore` now selects `isPoll` and the poll's `question`/`options`/`votes`/
`expiresAt`, and separately attaches the viewer's own vote as
`poll.votes_user` (the same raw shape the following feed already returns -
an array of the viewer's vote row(s) - which iOS's own `Poll` model already
falls back to reading when the folded `userVote` field isn't present, see
`ios-native/ZRPSocial/Models/Poll.swift`). The one deliberate difference
from a literal copy of the following feed's `include` block: `explore`
caches its whole ranked list for 5 minutes, and the viewer's own vote is
fetched fresh on every request rather than baked into that cache - the
same reason `liked` on this route already isn't cached. Voting on a poll
in For You shows up immediately, not up to 5 minutes later.

What remains is client-side: actually rendering a poll encountered while
browsing For You. Not built here.

## Reported defects in web / backend

Found while auditing, per the isolation rules: reported here for their
owners, not silently fixed from iOS.

### F5. Account deletion's 30-day grace period never actually applied — **FIXED server-side + web**

Found while auditing account deletion/privacy per the agreed backend
priority list — not an iOS parity gap, a real, already-shipped bug in
the web deletion flow and a gap in the backend's own promise.

`src/app/settings/delete/page.tsx`'s primary "Request Account Deletion"
button did not call `POST /api/user/delete` (the route that actually
sets `User.deletionScheduledFor` 30 days out) at all — `handleRequestDeletion`,
the only function that calls it, was dead code, never wired to any
button. The button instead revealed the typed-DELETE confirmation UI
directly, whose confirm action calls `POST /api/user/delete/confirm` —
**immediate, permanent deletion, no grace period**. Every user who used
the page's main flow got instant deletion while reading copy that
explicitly promised "your account will be deleted in **30 days**. You
can cancel this request at any time." The separate "Delete Now" button
(shown only once an account is actually scheduled) was also a dead
click — it set `showConfirm`, but the typed-DELETE block that reads that
state was only rendered in the *not-yet-scheduled* branch, so nothing
visible happened.

Separately, even a correctly-scheduled account was never actually
deleted once its 30 days passed: nothing swept `deletionScheduledFor`.
`GET /api/user/delete-status` could report a date in the past
indefinitely with the account still fully live.

Three fixes, all server-side/web, no client (Android/iOS) involvement:

1. `src/app/settings/delete/page.tsx`: the primary button now calls
   `handleRequestDeletion` (schedules, matches its own copy). The typed-
   DELETE confirmation is reachable only via "Delete Now" from the
   already-scheduled state, which now actually renders it.
2. `src/lib/account-deletion.ts` (new): the account-wipe + UploadThing-
   orphan-cleanup logic that used to live only inline in
   `/api/user/delete/confirm` is now a shared `deleteUserAccountAndFiles(userId)`,
   so the confirm route and the new sweep below can never drift apart on
   what actually gets deleted.
3. `GET /api/cron/delete-scheduled-accounts` (new): sweeps
   `deletionScheduledFor <= now` and deletes each one, same `CRON_SECRET`
   auth (fails closed) as `publish-scheduled-posts`. One account's
   cleanup failing doesn't block the rest of the sweep — it just stays
   scheduled and gets retried on the next run.

That third piece needs an actual scheduler calling it, which this repo
had no in-repo mechanism for at all - not for this route or, as far as
a full search of the repository turned up, for either of the other two
`CRON_SECRET`-gated routes either (no `railway.json`, no scheduled
GitHub Actions workflow, no cron-related npm script existed anywhere).
Those two are presumably invoked by a Cron Job configured directly in
Railway's own project dashboard, which is both invisible and off-limits
to touch from here. `.github/workflows/cron-delete-scheduled-accounts.yml`
gives this route its own independent, in-repo, code-reviewable daily
schedule instead of guessing at or modifying that external
configuration - it needs a `CRON_SECRET` repository secret added once
under this repo's GitHub Settings before it can succeed.

Verified end-to-end in a browser against a real Postgres-backed test
user: "Request Account Deletion" now shows the scheduled-for-30-days
banner with working Cancel/Delete Now buttons, and "Delete Now" now
correctly reveals the typed-DELETE prompt, without completing an actual
deletion.

Flagged for human review before merge given the blast radius (permanent,
irreversible account deletion), per the standing rule for security- and
safety-sensitive changes.

### F2. Scheduled posts are timed in the SERVER's timezone, not the author's — **FIXED (server, web and iOS)**

`POST /api/posts` used to store a bare `new Date(scheduledAt)`, and the
composer sent whatever `<input type="datetime-local">` produces: a naive
`yyyy-MM-dd'T'HH:mm` with no offset. ECMAScript reads a date-time form
without an offset as **local time**, which on the server means the
server's zone (UTC in production), not the author's - an author in UTC+9
scheduling for 09:00 got it published at 09:00 UTC (18:00 for them).

The route now resolves `scheduledAt` through `src/lib/scheduled-time.ts`'s
`resolveScheduledAt(scheduledAt, scheduledAtOffsetMinutes)`, a drop-in
replacement for the old bare `new Date(scheduledAt)` that recognizes two
ways a caller can be unambiguous, on top of the exact legacy fallback for
a caller that supplies neither:

1. `scheduledAt` already carries a real offset or `Z` suffix (a genuine
   ISO-8601 instant) - parsed directly, already correct regardless of
   server timezone.
2. `scheduledAt` is the naive wall-clock string, and the caller also sends
   `scheduledAtOffsetMinutes` - the exact value
   `Date.prototype.getTimezoneOffset()` reports in the author's own
   timezone at that moment (e.g. UTC+9 reports `-540`). The route then
   reads the wall-clock components as UTC and applies that offset to land
   on the real instant.

**Web is fixed**: the composer now sends `scheduledAtOffsetMinutes` from
`new Date(scheduledAt).getTimezoneOffset()` (a value the browser already
computes correctly, since parsing happens in the author's own real
timezone there) alongside the unchanged naive string.

**iOS is now fixed** and takes path 1. `ScheduledInstant.string(from:)`
replaces the old `WallClock.string(from:)` and writes
`yyyy-MM-dd'T'HH:mm:ss'Z'` in UTC. The author's `Date` already holds the
absolute moment their choice resolved to in their own timezone, so
nothing on the client needs to know what that timezone was - rendering
it as UTC is only how it is written down.

Path 1 rather than path 2 for three reasons: one field instead of two,
with nothing to keep in sync; no sign convention to get backwards; and
it is the only one of the two that also fixes the poll expiry below,
which knows nothing about `scheduledAtOffsetMinutes`.

Verified against the real `resolveScheduledAt`: a UTC+9 author choosing
09:00 now sends `2026-09-15T00:00:00Z` and gets exactly that instant,
where the old naive string produced `2026-09-15T09:00:00.000Z` - nine
hours late. The Z-suffix branch is already covered by
`src/lib/__tests__/scheduled-time.test.ts`, so no new backend test was
needed and none was added.

**Android remains on the legacy path.** Not this agent's code to change:
`Instant.ofEpochMilli(scheduledAtMillis).toString()` sent as
`scheduledAt` satisfies path 1 there with no second field either.

### F3. A poll's `expiresAt` is still timed in the server's timezone — **FIXED server-side + web**

The F2 fix routed `scheduledAt` through `resolveScheduledAt`. A poll's
end date in the same request was **not**: `POST /api/posts` stored it
with a bare `new Date(poll.expiresAt)`, and the poll branch read no
offset field at all.

So the original bug survived there in full. The web composer's poll end
date is an `<input type="datetime-local">` sending a naive string, which
the server read in its own zone - a poll an author in UTC+9 set to close
at 23:00 actually closed at 23:00 UTC, nine hours late; west of UTC it
closed early, cutting voting short.

**iOS was not affected**, because the same ISO-8601 instant it sends for
`scheduledAt` is sent here too, and a bare `new Date` parses an instant
correctly - that is precisely why an instant was the right choice rather
than the offset field.

Fixed exactly the way this finding proposed: `POST /api/posts` now
routes `poll.expiresAt` through `resolveScheduledAt(poll.expiresAt,
poll.expiresAtOffsetMinutes)`, the same function `scheduledAt` already
uses, and the web composer now sends a matching `expiresAtOffsetMinutes`
(`new Date(pollExpiry).getTimezoneOffset()`) alongside the poll's naive
`expiresAt` string. iOS needed no change and made none - its ISO-8601
instant already satisfies path 1 of `resolveScheduledAt` with no second
field.

### F4. Encoding a Swift `Date` into a request body silently sends a 2001 epoch — **FIXED (iOS)**

Not a backend fault, but worth recording because it bit this app twice
and would bite it again.

`JSONEncoder`'s default date strategy is `.deferredToDate`: a bare
number of **seconds since 2001-01-01**. Every route here hands the value
to `new Date(...)`, which reads a number as **milliseconds since 1970**.
The two are silently compatible in type and wildly incompatible in
meaning, so nothing fails - a date simply lands in early 1970.

Both occurrences are fixed:

- A poll's `expiresAt` - every poll created from iOS with an end date
  was created having already expired on 10 January 1970. No votes were
  possible, and it read as a server bug.
- An Opportunity listing's `deadline` - a deadline of 31 December 2026
  was stored as 10 January 1970, so the listing arrived expired.

Both now go through `ScheduledInstant`. An audit of every `Encodable`
request type in the app found no third case, and the two doc comments on
those fields say why they are strings so the next person does not
"simplify" them back to a `Date`.

### F1. `POST /api/music/artists` erased bio, avatar and banner — **RESOLVED**

Reported from the Phase 14 audit; fixed server-side and merged (PR #103,
`src/app/api/music/artists/route.ts` on `main`). The route's update branch
no longer writes a field the request did not mention:

```ts
const profileUpdate: Record<string, string | null> = {};
if ("bio" in body) profileUpdate.bio = body.bio || null;
if ("avatarUrl" in body) profileUpdate.avatarUrl = body.avatarUrl || null;
if ("bannerUrl" in body) profileUpdate.bannerUrl = body.bannerUrl || null;
update: { displayName, ...profileUpdate }
```

Three states now, decided by **key presence**: omitted leaves the column
alone, explicit `null` clears it, a value sets it.

**iOS was realigned to the corrected contract, not left on its
workaround.** `ArtistProfileField` encodes all three states, so:

- the profile editor sends all three fields, and an emptied one is a real
  `null` — a deliberate clear
- applying as an artist, publishing a track and creating an album send
  **only** a display name, omitting the profile keys entirely

The one asymmetry that remains by design: the route writes `displayName`
on every update, falling back to the account's name when the body omits
one. So `ensureArtistId` posts a name when the person typed one, and
otherwise reads the id rather than posting an empty body that would rename
the artist. That is a property of the route, not a workaround for a bug.

`Tools/verify-artist-contract.py` pins the pairing in CI: it transcribes
the merged route's per-field rule and the exact bodies each iOS path
emits, and fails if either drifts. Reverting the client to the old
all-nulls encoder makes it fail on four checks.

## App Store submission

The app builds and archives against the required toolchain, and CI proves
it on every push (see **Build toolchain**). What it cannot do here is
**sign**.

### What is verified in CI

- Archives with `xcodebuild archive` on Xcode 26.3 / iOS 26.2 SDK - a
  different path from `build`, which a project can pass while failing to
  archive.
- The archived bundle really contains an app, with a bundle identifier,
  marketing version, build number and minimum OS version.
- `PrivacyInfo.xcprivacy` survives into the bundle, where Apple reads it.
- An app icon is recorded in the built `Info.plist`.
- The manifest's declared required-reason APIs match what the code calls,
  in both directions (`validate-sources.py`).

### S1. Signing and upload - BLOCKED, needs an Apple Developer account

This repository contains no distribution certificate, no provisioning
profile, and no team identifier, and this environment has no App Store
Connect access. So the archive CI produces is **unsigned**: it proves the
app archives, not that it is signable or submittable.

`Signing/ExportOptions.plist` is ready and deliberately omits `teamID`
rather than guessing one - a wrong team id produces an export that fails
at upload with a misleading error.

To finish this, someone with the account must supply, as repository
secrets: the Apple Distribution certificate and its password, the App
Store provisioning profile for `one.zrp.social` (or whichever identifier
is chosen - see S2), and an App Store Connect API key. None of that can
be produced from inside this repo.

### S2. Bundle identifier collides with the Capacitor shell - needs a decision

`ios-native` and the existing Capacitor shell (`ios/App`, and
`capacitor.config.ts`) both declare `PRODUCT_BUNDLE_IDENTIFIER =
one.zrp.social`. **Two apps cannot share one identifier on the App
Store.**

If the native app is intended to *replace* the shell - which is what this
module is for - then sharing the identifier is correct and the native
build supersedes it on the next upload. That is a product decision with a
real consequence (existing installs update to the native app), so it is
recorded here rather than assumed. If instead both are meant to coexist,
the native app needs its own identifier before the first upload.

Not changed from the iOS side either way: `capacitor.config.ts` and
`ios/App` belong to the web release tooling.

## Blocked items

### B1. Native OAuth — **Google now UNBLOCKED server-side; Apple still blocked**

This entry was written when neither provider had a native token-exchange
route. **That changed on `main` while this branch was in flight**: PR #115
added `POST /api/mobile/auth/google`, which verifies a Google ID token
against the same `GOOGLE_CLIENT_ID` the website's provider trusts, hands
account linking to the same `findOrCreateOAuthUser` NextAuth's own
`signIn` callback uses, and mints a NextAuth-format JWT on the same
30-day schedule as `POST /api/mobile/auth/login`.

So the backend half of Google sign-in exists now, and it is provider-shaped
rather than Android-shaped — nothing in that route is Android-specific.
**What remains for iOS is client-side work, not a backend blocker:**
obtaining a Google ID token on iOS and posting it to that route. It is
outstanding rather than blocked, and is not built in this branch.

Apple is unchanged and still blocked — see B2. `src/lib/auth.ts` still
registers it only as a NextAuth **web** OAuth provider, and no route
accepts an `ASAuthorization` credential.

The Capacitor shell's workaround (`src/lib/nativeAuth.ts`) opens the web
OAuth URL in a system browser, leaving the session as an httpOnly cookie
inside the browser/WebView, which a real native app cannot read. That is
still the only path for Apple.

### B2. Sign in with Apple (native) — RESOLVED (server + client), Apple portal outstanding

Apple requires Sign in with Apple in any app that offers third-party
sign-in, so this was an **App Store submission blocker**.

**Both gaps below are now closed.**

`POST /api/mobile/auth/apple` verifies the identity token against Apple's
published JWKS with Node's own crypto — no new dependency, the same
choice `apple-client-secret.ts` already made — checking `alg` (pinned to
RS256, never read from the header), the signature, `iss`, `aud`, `exp`,
`iat`, and the SHA-256 `nonce` claim against the raw nonce the app kept.
It then reuses `findOrCreateOAuthUser`, the exact function NextAuth's own
`signIn` callback uses, and returns the same
`{sessionToken, cookieName, expiresInSeconds, user}` envelope as the
password and Google routes.

Both audiences are accepted: the bundle ID `one.zrp.social` for the
native flow and `APPLE_CLIENT_ID` (the Services ID) for the web one.
`APPLE_NATIVE_CLIENT_ID` overrides the former if the bundle ID ever
changes.

On identity key: this links on **email**, not `sub`. That is deliberate —
it is what the website's own Apple provider does through
`findOrCreateOAuthUser`, so an account created by signing in with Apple on
the web is the same account when signing in with Apple on iOS. A private
relay address is stable per app, so it works as a key; keying on `sub`
instead would silently split those two into different accounts.

Apple's name arrives only on the first authorization, so the app sends it
beside the token; `findOrCreateOAuthUser` only uses a name when creating,
which is exactly that one time. Username generation is
`generateUniqueUsername`, already shared with the web flow — no new rule
was invented.

**What remains is outside this repository:** "Sign In with Apple" must be
enabled for the `one.zrp.social` App ID in the Apple Developer portal.
The entitlement is declared in `Supporting/ZRPSocial.entitlements`; until
the portal capability exists a *signed* build cannot provision. Unsigned
CI builds are unaffected.

The original finding, for the record:

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

**Item 3 below (the backend change) is done.** `POST /api/push/fcm` now
accepts an optional `platform` (`"android"` or `"ios"`, case-insensitive)
in the request body, stored on both token creation and re-registration;
any request that omits it - which today means every existing Android
client, since this field didn't exist before - still defaults to
`"android"`, so no existing row or caller is relabeled or broken.
`sendFcmPush()` now also puts the same relative in-app path
`sendPushNotification` already sends to Web Push subscribers (e.g.
`/post/{id}`, `/messages/{username}`) into the FCM message's `data.url`,
alongside the existing `notification` block, so a tap can navigate to the
right screen instead of just opening the app - this reaches Android today
too, not only a future iOS client, since Android's `notification`-only
payload never carried a destination either.

Three things are still needed, and the third is a DECISION, not a
credential. An earlier version of this note listed only the first two and
said "an iOS client can register a token… with no further backend
change". That was true about the backend and quietly skipped the hard
part: **how an iOS client would obtain an FCM token at all.**

1. An **APNs key uploaded to the Firebase project** — a console action, not
   a code change.
2. A **`GoogleService-Info.plist`** for the iOS app. Only
   `android-native/app/google-services.json` exists in this repo; the iOS
   counterpart has never been generated.
3. **A resolution to the dependency conflict.** `src/lib/fcm.ts` sends
   through `firebase-admin/messaging`, so delivery to a device requires an
   **FCM registration token**. On iOS that token is produced by the
   Firebase iOS SDK — there is no way to obtain one from a raw APNs
   device token on the client. So iOS push needs either:
   - the **Firebase iOS SDK**, which would be this app's first
     third-party dependency and a large one (the same objection that
     keeps WebRTC out, see the calling row); or
   - a **direct APNs sender added server-side**, letting iOS register its
     raw APNs device token instead. `grep -rl "apns" src/lib src/app/api`
     returns nothing today, so this path does not exist yet — it is real
     backend work, not configuration.

Until item 3 is decided, items 1 and 2 are not sufficient on their own.
**No fake local notifications will stand in for this**, and no
"registration" that cannot produce a deliverable token will be added to
make the screen look finished.

---

## Phase plan

| Phase | Scope | State |
| --- | --- | --- |
| 1 | Repository + backend + Android audit, this matrix | ✅ done |
| 2 | iOS project foundation, theme, CI | ✅ done |
| 3 | Auth + session (login/restore/logout) | ✅ done — 3b (signup, verify, reset, onboarding) pending |
| 4 | Navigation shell + deep links | 🔶 in-app routing done (profile / hashtag / follow lists); OS deep links pending |
| 5 | Home feed (For You / Following) + interactions | ✅ done |
| 6 | Profiles + social graph | ✅ done — 6b complete (edit profile, pin, all five list tabs, own-profile analytics, Trust Passport) |
| 7 | Post composer + media upload + viewer | ✅ done — 7b complete (scheduling, polls). Camera capture was listed here in error: no ZRP client has it — not the web app, not Android — so `NSCameraUsageDescription` stays absent by decision rather than by omission |
| 8 | Comments, replies, quotes, edit | ✅ done — 8b complete (reactions, comment repost/bookmark, reposts & quotes lists, inline translation) |
| 9 | Stories | ✅ done |
| 10 | Messages | ✅ done — 10b image attachments done. Conversation search was listed here in error: the website has none either (no search box on `/messages`, and no route behind one), so there is nothing to reach parity with |
| 11 | Notifications | ✅ in-app list done — device push remains BLOCKED (B3) |
| 12 | Search + hashtags | ✅ done |
| 13 | Music + background player | ✅ 13a (engine, background audio, lock screen, home) and 13b (discover, artists, albums, playlists, liked, history, queue) done |
| 14 | Music Studio | ✅ gate, apply, artist profile, upload/publish, track + album management, reorder |
| 15 | Marketplace | ✅ browse, detail, favorites, create/edit/delete, my listings, contact seller |
| 16 | Settings, moderation, account deletion | ✅ settings hub, privacy, password, blocked/muted lists, reporting, data export, account deletion (both paths) |
| 17 | Localization (11 languages) + accessibility | ✅ in-app language picker (11 languages, RTL), locale-aware formatting, Dynamic Type pass with a CI rule |
| 18 | Performance + security pass | ✅ downsampling image loader with a decoded cache, path-segment escaping, no silent URL fallback; logging/Keychain/ATS audited clean |
| 19 | App Store preparation | 🔶 archive + bundle verification in CI, privacy manifest corrected and CI-enforced, export options ready — signing BLOCKED (S1), bundle id needs a decision (S2) |
| 20 | Final parity audit | ✅ this matrix is machine-checked in CI (`Tools/audit-parity.py`): every route it names exists, every IMPLEMENTED row is backed by a real iOS call site |
