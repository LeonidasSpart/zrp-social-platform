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
| Registration | `POST /api/auth/register` | ✅ | ✅ | ✅ ends on "check your email" — the route returns no session | IMPLEMENTED |
| Live username availability | `GET /api/auth/check-username` | ✅ | ✅ | ✅ debounced, with the route's own pre-checked suggestions | IMPLEMENTED |
| Email verification — resend | `POST /api/auth/resend-verification` | ✅ | ✅ | ✅ | IMPLEMENTED |
| Email verification — confirm | `GET /api/auth/verify-email` | ✅ | ✅ | ⬜ opened from the emailed link in a browser; no in-app route exists | MISSING (by design) |
| Forgot password — request | `POST /api/auth/forgot-password` | ✅ | ✅ | ✅ answers the same way whether or not the address exists, as the route intends | IMPLEMENTED |
| Reset password — complete | `POST /api/auth/reset-password` | ✅ | ✅ | ⬜ completed through the emailed link on the web; no route accepts a code typed into an app | MISSING (by design) |
| Onboarding | `POST /api/user/onboarding-complete`, `PUT /api/user/profile`, `POST /api/user/update-avatar`, `GET /api/users/suggested` | ✅ | ✅ | ✅ profile, avatar, follow suggestions; every step skippable | IMPLEMENTED |
| Google sign-in | NextAuth `google` provider (web OAuth) | ✅ | ❌ | ❌ | BLOCKED — [B1](#b1-native-oauth-google--apple) |
| **Sign in with Apple** | NextAuth `apple` provider (web OAuth, Services ID) | ✅ (if env configured) | n/a | ❌ | **BLOCKED — [B2](#b2-sign-in-with-apple-native)** |
| Account deletion | `POST /api/user/delete`, `/api/user/delete/confirm`, `GET /api/user/delete-status` | ✅ | ✅ | ✅ both paths — see [Settings](#settings) | IMPLEMENTED |

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
| Scheduled posts | `POST /api/posts` + `scheduledAt` naive wall-clock | ✅ | ✅ | ⬜ | MISSING (Phase 7b) |
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
| Replies / media / likes / reposts tabs | `GET /api/users/{username}/replies`, `/media`, `/likes`, `/reposts` | ✅ | 🔶 | ✅ all four, each paging on its own cursor (likes and reposts page on the join row, not the post); Likes is hidden unless it is your own profile or the account keeps likes public, matching the web | IMPLEMENTED |
| Profile analytics tab | — (own-profile dashboard, no single route) | ✅ | ⬜ | ⬜ | MISSING |
| Follow / unfollow (+ request for private) | `POST /api/users/{username}/follow` | ✅ | ✅ | ✅ (all three outcomes: followed, unfollowed, request pending) | IMPLEMENTED |
| Followers / Following lists | `/followers`, `/following` → `{items,nextCursor}` | ✅ | ✅ | ✅ | IMPLEMENTED |
| Edit profile | `PUT /api/user/profile`, `POST /api/user/update-avatar`, `POST /api/user/update-cover` | ✅ | ✅ | ✅ loads the real profile first, so blanks it never read cannot erase a bio | IMPLEMENTED |
| Suggested users | `GET /api/users/suggested` | ✅ | ✅ | ✅ | IMPLEMENTED |
| Private-account gating | every content route returns `{items: []}`, not 403 | ✅ | 🔶 | ✅ (explains the account is private instead of showing "no posts") | IMPLEMENTED |
| Trust profile | `GET /api/users/{username}/trust` | ✅ | ⬜ | ⬜ | MISSING |

### Discovery

| Feature | Backend route(s) | Web | Android | iOS | Status (iOS) |
| --- | --- | --- | --- | --- | --- |
| Search (users + posts) | `GET /api/search?q=&type=all` (min 2 chars; 10 users / 20 posts, unpaginated) | ✅ | ✅ | ✅ | IMPLEMENTED |
| Trending hashtags | `GET /api/hashtags/trending` (bare array, server-cached, limit clamped 1–50) | ✅ | ✅ | ✅ | IMPLEMENTED |
| Hashtag timeline | `GET /api/posts/hashtag/{tag}` (bare array, 50, no pagination) | ✅ | ✅ | ✅ | IMPLEMENTED |
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
| Thread | `GET /api/messages/{userId}` — **unpaginated**, see [L1](#l1-message-threads-are-unpaginated) | ✅ | ✅ | ✅ (no paging UI, because there is nothing to page) | IMPLEMENTED |
| Send message | `POST /api/messages` | ✅ | ✅ | ✅ | IMPLEMENTED |
| Edit / delete message | `PUT /api/messages/edit/{id}`, `DELETE /delete/{id}` | ✅ | ✅ | ✅ (sender-only, 403-enforced) | IMPLEMENTED |
| Reactions | `POST /api/messages/reaction/{id}` — one per person; same emoji removes, different replaces | ✅ | ✅ | ✅ | IMPLEMENTED |
| Unread badge | `GET /api/messages/unread` | ✅ | ✅ | ✅ | IMPLEMENTED |
| Realtime | Socket.io (`server.js`) | ✅ | ❌ polling | ❌ 6s polling while a thread is open | PARTIAL (by design) |
| Read receipts | side effect of `GET /api/messages/{userId}` | ✅ | ✅ | ✅ | IMPLEMENTED |
| Reply to a message | `POST /api/messages` + `replyToId` | ✅ | ✅ | ✅ | IMPLEMENTED |
| Delete a conversation | `DELETE /api/messages/conversation/{userId}` | ✅ | ✅ | ✅ | IMPLEMENTED |
| Image attachments | `POST /api/messages` + `imageUrl` (UploadThing `chatImage`, 4 MB); the route accepts an empty `content` **only** alongside an image and refuses both-empty with a 400 | ✅ | ✅ | ✅ one picture per message (the row stores a single `imageUrl`), uploaded on send rather than on selection, and a failed upload stops the send rather than silently dropping the picture | IMPLEMENTED |

### Notifications

| Feature | Backend route(s) | Web | Android | iOS | Status (iOS) |
| --- | --- | --- | --- | --- | --- |
| Notification list | `GET /api/notifications` (bare array, 50 max, unpaginated) | ✅ | ✅ | ✅ | IMPLEMENTED |
| Mark all read | `PUT /api/notifications` (all-at-once is the only granularity offered) | ✅ | ✅ | ✅ | IMPLEMENTED |
| Unread badge | `GET /api/notifications/unread` | ✅ | ✅ | ✅ | IMPLEMENTED |
| Notification tap-through | — | ✅ | ✅ | 🔶 like/comment/repost → post, follow → profile, message → thread; appeal and listing outcomes have no screen yet (Phases 15/16) | PARTIAL |
| Unrecognised notification types | — | 🔶 renders with no action phrase | 🔶 same | 🔶 same, deliberately | PARTIAL |
| Web Push (VAPID) | `POST /api/push/subscribe` | ✅ | n/a | n/a | WEB-ONLY |
| **Device push** | `POST/DELETE /api/push/fcm` | n/a | ✅ FCM | ❌ | **BLOCKED — [B3](#b3-ios-device-push)** |

### Music

| Feature | Backend route(s) | Web | Android | iOS | Status (iOS) |
| --- | --- | --- | --- | --- | --- |
| Music home | `GET /api/music/home` (8 sections in one response) | ✅ | ✅ | ✅ | IMPLEMENTED |
| Discover / genres | `GET /api/music/genres`, `GET /api/music/tracks` | ✅ | ✅ | ✅ | IMPLEMENTED |
| Artists / artist detail / follow | `/api/music/artists`, `/{id}`, `/{id}/follow` | ✅ | ✅ | ✅ | IMPLEMENTED |
| Albums / album detail | `/api/music/albums`, `/{id}` | ✅ | ✅ | ✅ | IMPLEMENTED |
| Playlists (browse + detail) | `/api/music/playlists`, `/{id}` | ✅ | ✅ | ✅ | IMPLEMENTED |
| Playlist create / add track / reorder | `POST /api/music/playlists`, `/{id}/tracks`, `/{id}/reorder` | ✅ | ✅ | ⬜ read-only on iOS today | MISSING (Phase 14) |
| Track like | `POST /api/music/tracks/like` | ✅ | ✅ | ✅ | IMPLEMENTED |
| Play reporting + duration backfill | `POST /api/music/tracks/play` | ✅ | ✅ | ✅ (reports AVPlayer's real decoded duration, repairing tracks stored without one) | IMPLEMENTED |
| Liked / library / history pages | `GET /api/music/library` | ✅ | ✅ | ✅ full Liked and History pages | IMPLEMENTED |
| Queue | client-side | ✅ | ✅ | ✅ dedicated queue screen driven by the live `MusicPlayer` queue, not a copy of it | IMPLEMENTED |
| Mini + expanded player, seek, shuffle, repeat | client-side | ✅ | ✅ | ✅ (persistent across navigation) | IMPLEMENTED |
| Background audio | `UIBackgroundModes: audio` + `AVAudioSession .playback` | n/a | ✅ | ✅ | IMPLEMENTED |
| Lock screen / Now Playing | `MPNowPlayingInfoCenter` + `MPRemoteCommandCenter` | n/a | ✅ | ✅ (title, artist, album, artwork, scrubbing) | IMPLEMENTED |
| Interruptions & route changes | `AVAudioSession` notifications | n/a | ✅ | ✅ (resumes only when the system says to; pauses on headphone unplug) | IMPLEMENTED |
| AirPlay | system-provided via `AVAudioSession` | n/a | ✅ | 🔶 audio routes correctly; no explicit route picker yet | PARTIAL |

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
| Listing video | `videoUrl` on the listing | ✅ | ⬜ | 🔶 an existing video is preserved on edit, but none can be added yet | PARTIAL (Phase 15b) |
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
| Appeals | `POST /api/appeals` | ✅ | ⬜ | ⬜ | MISSING |
| Feed-level block/mute filtering | server-side in `/api/posts/explore` | ✅ | ✅ | ✅ (inherited from server) | IMPLEMENTED |

### Settings

| Feature | Backend route(s) | Web | Android | iOS | Status (iOS) |
| --- | --- | --- | --- | --- | --- |
| Settings hub | — | ✅ | ✅ | ✅ | IMPLEMENTED |
| Security (password) | `PUT /api/user/password` | ✅ | ✅ | ✅ | IMPLEMENTED |
| Privacy (private account, public likes/following) | `PUT /api/user/privacy` | ✅ | ✅ | ✅ | IMPLEMENTED |
| Account deletion — 30-day schedule / cancel | `GET /api/user/delete-status`, `POST /api/user/delete` | ✅ | ✅ | ✅ | IMPLEMENTED |
| Account deletion — immediate and permanent | `POST /api/user/delete/confirm` | ✅ | ✅ | ✅ typed DELETE gate, as on web | IMPLEMENTED |
| Data export | `GET /api/settings/export-data` | ✅ | ⬜ | ✅ downloaded to a file and handed to the share sheet | IMPLEMENTED |
| Account (email, username) | `GET/PUT /api/user/username`, `PUT /api/user/email` | ✅ | ✅ | ✅ 30-day username cooldown surfaced before typing; email change states that it needs verification | IMPLEMENTED |
| Email preferences | `/api/user/email-preferences` | ✅ | ⬜ | ⬜ | MISSING (Phase 16b) |
| Language (11 languages, `ar` RTL) | client-side preference | ✅ | ✅ | ✅ in-app picker, generated from the web's `SUPPORTED_LANGUAGES`; sets locale and layout direction | IMPLEMENTED |
| Plan / limits | `GET /api/user/plan`, `src/lib/limits.ts` | ✅ | ✅ | 🔶 composer and listing forms pre-check what the server enforces; the server's own limit message is shown verbatim | PARTIAL (by design) |
| Plan upgrade / monetisation / wallet surfaces | web billing | ✅ | ✅ | ❌ deliberately absent — see [Store policy constraint](#store-policy-constraint) | OUT OF SCOPE |

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

### L1. Message threads are unpaginated

`GET /api/messages/{userId}` runs a `findMany` with no `take`, no cursor
and no limit: it returns **every message ever exchanged** with that user,
oldest first, with each message's sender, `replyTo` and reactions
included. A long-running conversation therefore transfers its entire
history on every open - and, because the client polls while a thread is
open, on every poll.

This is not something a client can fix. The iOS app deliberately shows no
"load more" control, since there is nothing to page, and polls at a
deliberately unaggressive 6 seconds to limit the cost. Adding `cursor`
and `limit` to that route (defaulting to the newest N, as the comments
route already does) would fix it for web, Android and iOS at once.

Noted, not worked around. No client-side change was made that would mask
it.

### L2. `GET /api/music/playlists/{id}` does not report per-track `liked`

Every other route that returns music tracks tells the caller whether the
signed-in viewer has liked each one: `/api/music/home`, `/api/music/tracks`
(line 104), `/api/music/artists/{id}` and `/api/music/albums/{id}` all
attach a `liked` boolean. The playlist detail route does not - it returns
the join rows and their tracks with no like state at all.

The visible effect is the same on every client: a track opened from a
playlist shows an empty heart even when the viewer has liked it, until
some other screen loads the same track. iOS does **not** paper over this
by assuming `false`; `MusicLikeStore` treats a missing flag as "unknown"
and keeps whatever it already knows, so the heart is right whenever any
other surface has reported it. Attaching `liked` there the same way the
album route does (one `musicLike.findMany` over the playlist's track ids)
would fix it for web, Android and iOS at once.

Noted, not worked around.

### L3. The explore feed does not select polls

`GET /api/posts?tab=following` and `GET /api/posts/{id}` both `include`
the post's `poll` (with the viewer's own vote rows). `GET /api/posts/explore`
does not select it at all, so a poll post arriving in **For You** carries
no poll — indistinguishable, in the payload, from a post that never had
one.

The visible effect is the same on every client: the same post shows its
poll in Following and on its own screen, and nothing in For You. iOS does
not paper over this — there is no way to, short of a second request per
card to find out whether a poll exists. Adding the same `include` block
the following feed already uses would fix it for web, Android and iOS at
once.

Noted, not worked around.

## Reported defects in web / backend

Found while auditing, per the isolation rules: reported here for their
owners, not silently fixed from iOS.

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
| 6 | Profiles + social graph | ✅ done — 6b done (edit profile, pin, replies/media/likes/reposts tabs); the own-profile analytics dashboard is still MISSING |
| 7 | Post composer + media upload + viewer | ✅ done — 7b (scheduling, quote entry point, camera capture) pending |
| 8 | Comments, replies, quotes, edit | ✅ done — 8b complete (reactions, comment repost/bookmark, reposts & quotes lists, inline translation) |
| 9 | Stories | ✅ done |
| 10 | Messages | ✅ done — 10b image attachments done; conversation search still pending |
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
