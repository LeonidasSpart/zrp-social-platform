---
name: zrp-design-system
description: The project design authority for ZRP Social - the single source of truth for visual language, tokens, components, states, responsive behaviour, accessibility and brand protection across BOTH frontends (the Next.js web app in src/ and the native Android app in android-native/). Load before any UI, UX, layout, styling, component, responsive, motion, theming or accessibility work in this repository, including "just make it look better", a new screen or component, a redesign of an existing surface, or a visual bug. Supersedes and extends the older zrp-design skill.
---

# ZRP Design System

The standard is not "prettier". A person opens ZRP and thinks *"this is a
real product, and it is not like the others."*

Everything here is derived from the actual code in this repository. **When
this document and the source disagree, the source wins** — fix this
document.

**Relationship to other skills in this repo**
- `zrp-design` — the earlier, web-only version of this document. This file
  supersedes it. If both load, this one governs.
- `frontend-design` (official Anthropic) — general aesthetic judgement.
  Read it for *how to make a distinctive choice*; read this for *what ZRP
  has already decided*. Where they conflict, ZRP's fixed brand and tokens
  win, because they are already shipped.
- `webapp-testing` (official Anthropic) — Playwright harness. Use it to
  actually look at the web app instead of guessing.

---

## 1. Absolute rules

### The logo is untouchable

The official mark lives at `public/logo.png`, `assets/logo.png`,
`public/icon-*.png`, `public/favicon.*`, `public/og-image.png`,
`store-assets/`, and the native asset catalogues.

**Never** redraw, recreate, redesign, replace, recolour, distort,
reinterpret, regenerate, AI-generate, re-proportion or produce a variant
of it. Reference the existing file and render it (`next/image` on web,
the existing drawable/asset on native).

Removing a *duplicate render* of the logo is a layout fix and is allowed.
Changing the asset never is.

### Brand colour is fixed

`tailwind.config.js` (web) and `ui/theme/Color.kt` (native) are the
palette, and they already agree:

| Token | Value | Use |
| --- | --- | --- |
| `zrp-red` / `ZrpRed` | `#FF2D2D` | Brand + primary action |
| `zrp-darkRed` / `ZrpDarkRed` | `#B10000` | Primary action at rest |
| `zrp-deepBlack` / `ZrpDeepBlack` | `#050505` | Dark ground |
| `zrp-charcoal` / `ZrpCharcoal` | `#0D0D0D` | Dark raised surface |
| `zrp-silver` / `ZrpSilver` | `#BDBDBD` | Muted metadata |
| `zrp-blue.*` / `ZrpBlue` | `#3B82F6` | **Secondary only** — trust/info, data viz, never a primary action |
| `ZrpGreen` | `#22C55E` | Repost / success only |

`yellow`, `amber` and `orange` are deliberately remapped to neutral greys
in `tailwind.config.js`. ZRP has no warm accent. Do not reintroduce one,
and do not use a raw hex to route around it.

Red is the only primary action colour. Three red buttons on one screen
means two are wrong.

### Never ship fake data or fake functionality

No invented users, posts, followers, counts, messages, tracks, creators,
trends, listings, notifications or statistics — not as a placeholder, not
temporarily, not to make a screenshot look better.

No control that implies a capability the product does not have. Two real
examples from this repo, both correct decisions:

- Shorts' Share action carries **no count** — there is no share metric on
  the backend, so inventing one would be a lie.
- The conversation header shows **no partner-presence dot** —
  `state.socketConnected` is *this device's* socket, not whether the other
  person is online. `server.js` does track real presence, but nothing
  exposes it to the client.

If there is no real data, **design the empty state**. A good empty state
is a feature; a fake feed is a lie that ships.

---

## 2. What ZRP is not

Never a clone of X, Facebook, Instagram, TikTok, Threads, LinkedIn,
Reddit, YouTube, Pinterest or Snapchat. Study them for *usability* —
hierarchy, interaction patterns, responsive behaviour, motion timing.
Never borrow their visual identity, layout signature or navigation shape.

Avoid the generated-page tells (see `frontend-design` for the full list;
these are the ones that keep appearing here):

- hero → three feature cards → CTA
- everything chopped into identical rounded cards with the same shadow
- one border-radius on everything regardless of hierarchy
- tracked-out ALL-CAPS eyebrow labels above every heading
- gradient washes and glass panels used as decoration
- fade-and-slide-up on every section, hover transition on every card
- **numbered markers (01 / 02 / 03) on content that is not a sequence** —
  a list of three values is a list, not a process. Check before reaching
  for them.

If a section could appear unchanged in another product's marketing page,
it is not ZRP design.

---

## 3. Tokens — use them, don't respell them

### Native (`android-native/.../ui/theme/`)

| File | Contents |
| --- | --- |
| `Dimens.kt` | `Spacing.xs/sm/md/lg/xl/xxl` (4/8/12/16/24/32), `Radius.sm/md/lg` (10/16/22), `IconSize.sm/md/lg` (18/24/32), `TouchTarget.min` (48) |
| `Shapes.kt` | `MaterialTheme.shapes` bound to the `Radius` scale |
| `Color.kt` | the palette above plus dark/light surface ramps |
| `Type.kt` | type scale |

**Known debt, measured:** roughly 1700 raw `.dp` literals against ~730
`Spacing.*` uses, and **17 distinct corner radii across 138
`RoundedCornerShape` call sites** (4, 6, 8, 10, 12, 14, 16, 18, 20 plus
the `50` pill) against a three-step scale used barely at all outside
`Shapes.kt`. Do not add to it: in any file you touch, prefer the token.
Do not launch a blind 138-site radius migration either — that changes
real visual values app-wide and needs someone able to look at a build.

### Web (`tailwind.config.js`, `src/app/globals.css`)

Tailwind's 4px scale. Never invent an arbitrary pixel value to make one
screen line up. Radius has three jobs: `rounded-full` (pills, avatars,
primary actions), `rounded-xl`/`2xl` (inputs, cards, sheets), `rounded-md`
(chips). **Two adjacent fields must never have different radii** — that
is the single most common drift in the web codebase.

---

## 4. Type and space

- Headings: `font-orbitron` (web, set globally on `h1`–`h6`). Orbitron is
  geometric and wide — it earns its place at display sizes and short
  lengths. Never set a paragraph in it.
- Body/UI: `font-inter` / the Material type scale on native.
- Long-form measure caps around 65–80 characters. Never a full-width
  paragraph.
- Space is the primary tool for hierarchy — reach for it before a border,
  a shadow or a card. Step the rhythm across breakpoints
  (`py-12 sm:py-16 lg:py-24`), don't scale it linearly.
- Shadow is for things that actually float (menus, dialogs, sheets). A
  card sitting in the page does not float — give it a hairline.
- **One focal treatment per viewport.** One gradient, or one large media
  element, or one bold type block. Not all three.

---

## 5. Copy is a design material

ZRP ships **11 languages**: `en, fr, de, it, sq, es, ru, ar, zh, tr, id`.

- Web strings live in `src/lib/translations.ts`; native in
  `android-native/app/src/main/res/values*/strings.xml`.
- **Reuse before you invent.** Web's dictionary is the source of truth and
  is already professionally translated. Most native strings in this repo
  were lifted verbatim from it, and that is the correct pattern.
- Adding a user-facing string means adding it to **all 11** language
  blocks (and the `TranslationKey` union on web). A new key with 10
  English fallbacks is not done.
- Never machine-translate to fill a gap. If no translation exists and
  none can be reused, say so and ask.
- Arabic is RTL (`RTL_LANGUAGES`). Prefer logical properties
  (`ps-*`/`pe-*`, `start`/`end`) over `left`/`right`.
- German and Russian run ~30% longer than English. Layouts must survive
  that.

Errors explain what happened and how to fix it. Empty screens invite an
action. Buttons say what happens: "Save changes", not "Submit". An action
keeps its name through the whole flow.

---

## 6. Responsive contract

Design for these, mobile first — that is where social traffic is:

`320 · 360 · 375 · 390 · 412 · 430 · 768 · 820 · 1024 · 1280 · 1440 · 1920`

- **320px must not overflow horizontally.** Test it.
- Never shrink a desktop layout; each range gets an intentional one.
- Use `dvh`, not `vh`, for anything filling the mobile viewport.
- Touch targets ≥ 44px (web) / `TouchTarget.min` = 48dp (native). An icon
  button with no padding is a bug.

### Two traps this codebase has already hit

**1. Text that evicts its siblings.** A display name is free text. An
unconstrained `Text`/`<span>` in a row takes all the width and pushes the
verification badge, lock, or timestamp off the edge. This bug was found
in **nine** places. Any name rendered before a badge needs
`weight(1f, fill = false)` + `maxLines = 1` + ellipsis (native), or
`min-w-0 truncate` on the name and `shrink-0` on the badge (web).

**2. Double-counted insets.** `ZrpNavHost`'s `Scaffold` already applies
`padding(innerPadding)`, which under `enableEdgeToEdge()` **is** the
status-bar inset on top and the bottom-bar-plus-navigation-bar inset
underneath. A screen inside it that also calls `statusBarsPadding()` or
`navigationBarsPadding()` counts the same inset twice. That, plus a
hardcoded `90.dp`, is what pushed the Shorts controls up the screen.
Respect `env(safe-area-inset-*)` on web the way `layout.tsx`,
`Header.tsx` and `BottomNav.tsx` already do.

### Known shell facts

- Web `Header` renders on **every** route including signed-out, and always
  shows the logo. A page rendering `/logo.png` near the top shows it twice.
- Web `Sidebar`/`RightPanel` are `lg:`+ only; `BottomNav` is `lg:hidden`
  and returns `null` when signed out — but the app shell pads for it
  **unconditionally**, so public/auth pages carry dead bottom space on
  mobile. Don't stack `min-h-screen` on top of that.
- Native `ZrpBottomBar` has no route gating — it renders on every route,
  Shorts included.

---

## 7. Accessibility floor

Not a later pass.

- Semantic HTML first; `<div onClick>` is a bug. Exactly one `<main>` per
  page — `layout.tsx` already provides it.
- Every input has a real `<label>` with `htmlFor` matching the input `id`.
  A styled label with no `htmlFor` is worse than none: it looks done.
- Errors: `role="alert"` + `aria-live="polite"`. A failed submit that
  announces nothing is a broken form.
- Async controls: `aria-busy`, a stable accessible name, a spinner.
- Visible `:focus-visible` on everything keyboard-reachable. The global
  ring is `zrp-red`; never remove an outline without replacing it.
- Native: a tappable thing gets `Role.Button` and a click label, not a
  bare `clickable()` — a bare one announces as plain text.
- Contrast 4.5:1 body, 3:1 large text and UI boundaries. `text-gray-400`
  on white fails; `text-gray-500` is the floor for metadata.
- Icon-only buttons need a **translated** `aria-label`/`contentDescription`.
- `prefers-reduced-motion` is mandatory: the global CSS guard on web,
  `useReducedMotion()` for framer-motion variants.

---

## 8. Every surface needs four states

Design all four. Missing states are where a product feels cheap.

1. **Loading** — skeletons shaped like the real layout so nothing jumps.
   Web: `ui/Skeleton.tsx`. Native: `ui/components/PostSkeleton.kt`. A
   centred spinner on a blank page is a last resort.
2. **Empty** — say what this is, why it is empty, and give the one action
   that fills it. Native: `ui/components/ZrpEmptyState.kt`. Never a bare
   "No results".
3. **Error** — human language plus a retry. Never a raw exception string.
   "Nothing here yet" and "loading failed" must not be the same sentence
   in a different colour.
4. **Loaded** — the real thing, with real data.

Also handle: partial data, very long strings, missing avatars, slow
networks, offline.

---

## 9. Component discipline

**Search before you create.** Web: `src/components/` (~59 top-level plus
`ui/`, `Feed/`, `Post/`, `music/`, …). Native:
`android-native/.../ui/components/` plus per-feature packages.

Existing primitives worth knowing:

| Web | Native |
| --- | --- |
| `ui/Skeleton.tsx`, `ui/avatar.tsx` | `ZrpEmptyState.kt`, `PostSkeleton.kt` |
| `PasswordInput.tsx`, `icons/` | `Avatar.kt`, `VerifiedBadge.kt` |
| `cn()` in `lib/utils.ts` | `Spacing`/`Radius`/`IconSize`/`TouchTarget` |
| `Loader2` from lucide | `CircularProgressIndicator` |

Before modifying a shared component: grep every usage, read each call
site's variant and responsive context, check its existing states, make the
**smallest** safe change, verify every call site.

**Duplication is the signal to extract**, and the gap belongs to the
component, not the caller. `VerifiedBadge` is the worked example: its
leading gap was left to 32 call sites and produced 2dp, 3dp, 4dp, 6dp and
none. It is now a `leadingGap` parameter with one default.

Highest-risk shared surfaces — treat changes as their own PR: web
`Header`, `Sidebar`, `RightPanel`, `BottomNav`, `PageTransition`,
`PostCard`, `PostComposer`, `layout.tsx`, `globals.css`; native
`ZrpNavHost`, `PostCard.kt`, `Avatar.kt`, `VerifiedBadge.kt`, theme files.

Do not add a dependency for a visual effect. Web has `framer-motion`,
`tailwind-merge`, `clsx`, `lucide-react`; native has Compose, Coil,
Media3.

---

## 10. Motion

Motion explains state, hierarchy and continuity. It is never decoration.

- Micro-feedback 120–180ms; enter/exit 200–300ms; ease out entering, ease
  in leaving.
- Never animate `width`, `height`, `top`, `left`. Animate `transform` and
  `opacity`.
- Web page transitions are already global in `PageTransition.tsx` — do not
  add a second one on top.
- One orchestrated moment beats scattered effects.

---

## 11. Scope and parallel agents

Other agents work in this repository at the same time. Before starting,
check open PRs for overlap; if one already fixes the thing, **do not
duplicate it**.

Design work does **not** change: backend route logic, `src/app/api/**`
response shapes (three clients depend on them), Prisma schema or
migrations, authentication, admin authorization, payment policy, security
policy, `.github/workflows/`, Railway or any deployment config. Never run
the Railway CLI.

If a visual fix appears to need one of those, write the dependency down in
the PR and stop that part rather than reaching across the boundary.

**Protected functionality** — a design change must never break:
authentication, email verification, Google/Apple sign-in, account
deletion, posting, media upload, Stories, Shorts, messaging,
notifications, Music, playlists, Creator Studio, reporting, blocking,
muting, moderation, search, hashtags, scheduled posts, polls, link
previews, Trust Passport, Help, Opportunities, Marketplace. Moving a
control is a design decision; deleting the only path to a feature is a
regression.

---

## 12. Working method

```
audit the real source → pick the highest-impact surface → design
  → implement → responsive pass → a11y pass → perf pass
  → checks → focused commit → PR
```

One surface per PR. Reviewable, reversible, production-safe. Fixing one
screen by breaking another is a failure, not a trade-off.

### Checks

Web:
```bash
npm run lint && npx tsc --noEmit && npm test && npm run build && git diff --check
```

Native: there is **no Android SDK, emulator or adb in the cloud sandbox**,
and `dl.google.com` is unreachable, so Gradle cannot run there. The CI
build on the PR (`.github/workflows/android-native-build.yml`) is the only
compile check. Before pushing, verify by hand: brace/paren balance, every
referenced symbol imported, every `R.string.*` defined, every new string
present in all 11 `values*/strings.xml`, and each `weight()` genuinely
inside a `RowScope`/`ColumnScope`.

### Honesty rule

Report only what was actually verified. Headless Chromium at set viewport
sizes is real rendering — it is **not** device testing, and saying so is
mandatory. If no device was used, say no device was used. If a native
change was only compiled by CI, say that. **Never claim visual or device
validation that did not happen** — a false green is worse than a known gap.
