---
name: zrp-design
description: The design authority for the ZRP Social web frontend. Load before any web UI, UX, layout, styling, component, responsive, motion or accessibility work in this repository - including "just make it look better", a new page or component, a redesign of an existing surface, or a visual bug. Encodes ZRP's design language, brand protection rules, token system, responsive contract, accessibility floor, motion rules and the parallel-agent safety boundaries that web changes must respect.
---

# ZRP Design Excellence

The standard is not "prettier". The standard is: a visitor opens ZRP and
thinks *"this is a real product, and it is not like the others."*

Everything below is derived from the actual codebase. When this document
and the source disagree, **the source wins** — update this document.

---

## 1. Non-negotiables

Read these before touching anything.

### The logo is untouchable

The official ZRP mark lives at `public/logo.png` (and `assets/logo.png`,
`public/icon-*.png`, `public/favicon.*`, `public/og-image.png`,
`store-assets/`, and the native asset catalogues).

**Never** redraw, recreate, redesign, replace, recolour, distort,
reinterpret, regenerate, AI-generate, re-proportion, or produce a variant
of it. Reference the existing file path and render it with `next/image`.

Removing a *duplicate instance* of the logo from a page is a layout fix,
not a brand change, and is allowed. Changing the asset is never allowed.

### Brand colours are fixed

`tailwind.config.js` is the palette source of truth:

| Token | Value | Use |
| --- | --- | --- |
| `zrp-red` | `#FF2D2D` | Primary brand + primary action |
| `zrp-darkRed` | `#B10000` | Primary action (resting), hover on red |
| `zrp-deepBlack` | `#050505` | Dark-mode page ground |
| `zrp-charcoal` | `#0D0D0D` | Dark-mode raised surface |
| `zrp-silver` | `#BDBDBD` | Muted metadata |
| `zrp-blue.*` | `#3B82F6` … | **Secondary only** — trust/info surfaces, data viz, never a primary action |

`yellow`, `amber` and `orange` are deliberately remapped to neutral greys
in `tailwind.config.js`. That is intentional — ZRP has no warm accent. Do
not reintroduce one, and do not use a raw hex to get around it.

Red is the only primary action colour. If a screen has three red buttons,
two of them are wrong.

### Never ship fake data

No invented users, posts, followers, messages, tracks, creators, trends,
listings, notifications or statistics — not even as a "visual
placeholder", not even temporarily.

If there is no real data, **design the empty state**. An excellent empty
state is a feature. A fake feed is a lie that will ship.

### Scope boundaries (other agents are working in parallel)

Do not touch: `android/`, `android-native/`, `ios/`, `ios-native/`,
`prisma/`, `.github/workflows/`, Railway or any deployment config. Never
run the Railway CLI.

Do not change backend route logic, auth logic, payment policy or security
policy. If a frontend problem appears to need a backend change, **write it
down in the PR** instead of changing it — unless the frontend genuinely
cannot function without it.

`src/app/api/**` is the contract three clients depend on. Changing a
response shape breaks Android and iOS silently.

---

## 2. What ZRP is not

ZRP must never read as a clone of X, Facebook, Instagram, TikTok,
Threads, LinkedIn, Reddit, YouTube, Pinterest or Snapchat.

Study them for *usability* — information hierarchy, interaction patterns,
responsive behaviour, motion timing. Never borrow their visual identity,
layout signature or navigation shape.

Also avoid the generic-AI-landing-page tell:

- hero → three feature cards → logo wall → pricing → CTA
- gradient blobs and glass panels used as decoration
- every surface a rounded card with a shadow
- animation on scroll for its own sake
- "Trusted by thousands" with no thousands

If a section could appear unchanged in any other product's landing page,
it is not ZRP design.

---

## 3. The ZRP design language

### Voice

Confident, plain, human. ZRP's real positioning already exists in
`src/lib/translations.ts` and is professionally translated into all 11
languages — **use those keys** rather than writing new marketing copy:

- `about.subtitle`, `about.tagline`
- `about.value1Title` / `value1Desc` — Freedom of Speech
- `about.value2Title` / `value2Desc` — Privacy & Security
- `about.value3Title` / `value3Desc` — People First
- `rightPanel.footerText` — the charity commitment

Adding a new user-facing string means adding it to **all 11 language
blocks** (`en, fr, de, it, sq, es, ru, ar, zh, tr, id`) and to the
`TranslationKey` union. Reusing an existing key is almost always better.

### Type

- Headings: `font-orbitron` (set globally on `h1`–`h6` in `globals.css`).
  Orbitron is geometric and wide — it earns its place at display sizes
  and short lengths. Never set a paragraph in it.
- Body/UI: `font-inter` (the `body` default).
- Ship a real type scale. Display headlines want tight leading
  (`leading-[1.05]`–`leading-tight`); body wants `leading-relaxed`.
- Long-form measure caps at ~65ch. `max-w-prose` or an explicit
  `max-w-[38ch]`-style cap — never a full-width paragraph.

### Space

Use the Tailwind 4px scale. Never invent an arbitrary pixel value to make
one screen line up.

Space is the primary tool for hierarchy — reach for it before adding a
border, a shadow or a card. Sections breathe more on desktop than mobile:
step the rhythm (`py-12 sm:py-16 lg:py-24`), don't scale it linearly.

### Surface

The codebase's honest defaults:

- Page ground: `bg-white dark:bg-zrp-deepBlack`
- Raised surface: `dark:bg-zrp-charcoal` / `dark:bg-white/5`
- Hairline: `border-gray-200 dark:border-gray-800`

Radius has three jobs and should stop there: `rounded-full` (pills,
avatars, primary actions), `rounded-xl`/`rounded-2xl` (inputs, cards,
sheets), `rounded-md` (chips, small controls). Two adjacent fields must
never have different radii — that is the most common drift in this
codebase.

Shadow is for things that actually float (menus, dialogs, sheets). A card
sitting in the page does not float; give it a hairline instead.

**Budget: one focal treatment per viewport.** One gradient, or one large
media element, or one bold type block — not all three.

### Motion

Motion explains state, hierarchy and continuity. It is never decoration.

- Micro-feedback (hover, press, toggle): 120–180ms
- Enter/exit, expand/collapse: 200–300ms
- Page transitions: already handled globally by
  `src/components/PageTransition.tsx` — do not add a second page-level
  transition on top of it
- Ease out for entering, ease in for leaving
- Never animate `width`, `height`, `top` or `left`. Animate `transform`
  and `opacity`.

**`prefers-reduced-motion` is mandatory.** The global guard in
`globals.css` neutralises CSS transitions/animations; for framer-motion,
gate variants on `useReducedMotion()`.

---

## 4. Responsive contract

Design for these, in this order — **mobile is the primary target**, it is
where social traffic actually is:

`320 · 360 · 375 · 390 · 412 · 430 · 768 · 820 · 1024 · 1280 · 1440 · 1920+`

Rules:

- Never shrink a desktop layout. Each range gets an intentional layout.
- **320px must not overflow horizontally.** Test it. Long usernames, long
  hashtags, long translated strings (German and Russian run ~30% longer
  than English) and unbroken URLs are the usual culprits.
- Arabic is RTL (`RTL_LANGUAGES` in `src/lib/translations.ts`). Prefer
  logical properties (`ps-*`/`pe-*`, `start`/`end`) over `left`/`right`
  for anything directional.
- Use `dvh`, not `vh`, for anything that should fill the mobile viewport —
  `vh` is wrong while browser chrome is showing.
- Respect `env(safe-area-inset-*)`. The app already does this in
  `layout.tsx`, `Header.tsx` and `BottomNav.tsx`; match that pattern.
- Touch targets ≥ 44×44px. A 32px icon button with no padding is a bug.
- Sticky/fixed elements must be checked against the on-screen keyboard.

### Known shell facts

- `Header` renders on **every** route, authenticated or not, and always
  shows the logo. A page that also renders `/logo.png` near the top is
  showing it twice.
- `Sidebar` and `RightPanel` are `lg:` and above, and `Sidebar` returns
  `null` when unauthenticated / on `/onboarding` / on `/shorts`.
- `BottomNav` is `lg:hidden`, `position: fixed`, and returns `null` when
  unauthenticated.
- The app shell in `layout.tsx` pads
  `pb-[calc(3.5rem+env(safe-area-inset-bottom))] lg:pb-0`
  **unconditionally**, so public and auth pages carry dead bottom space
  on mobile where `BottomNav` never renders. Do not force `min-h-screen`
  on those pages on top of it; size them naturally on mobile and fill
  only at `lg:`.

---

## 5. Accessibility floor

Not optional, not a later pass.

- Semantic HTML first. A `<div onClick>` is a bug; use `<button>`.
- **Exactly one `<main>`** per page. `layout.tsx` already provides it.
- Every input has a real `<label>` with `htmlFor` matching the input `id`.
  A styled `<label>` with no `htmlFor` is worse than none — it looks done.
- Errors: `role="alert"` and `aria-live="polite"`, associated to the field
  with `aria-describedby` where it belongs to one.
- Async controls: `aria-busy` while pending; keep the accessible name
  stable; never leave a spinner with no name.
- Visible `:focus-visible` on everything reachable by keyboard. The global
  ring uses `zrp-red`; do not remove outlines without replacing them.
- Contrast: 4.5:1 body, 3:1 large text and UI boundaries. `text-gray-400`
  on white fails — `text-gray-500` is the floor for metadata on white.
- Decorative imagery gets `aria-hidden="true"`; meaningful imagery gets a
  real `alt`.
- Icon-only buttons need `aria-label`, and it must be translated via
  `useLanguage()` like every other string.

---

## 6. Component discipline

**Search before you create.** `src/components/` has 59 top-level
components plus `ui/`, `Feed/`, `Post/`, `music/`, `help/`, `play/`,
`opportunity/`, `skeletons/`, `icons/`.

Existing primitives worth knowing: `ui/Skeleton.tsx`, `ui/avatar.tsx`,
`PasswordInput.tsx`, `icons/GoogleIcon.tsx`, `icons/AppleIcon.tsx`,
`cn()` in `src/lib/utils.ts`, `Loader2` from `lucide-react` as the
spinner idiom.

Before modifying a shared component:

1. `grep -rn "ComponentName" src` — find every usage.
2. Read each call site's variant and responsive context.
3. Check existing loading / empty / error states.
4. Make the **smallest** safe change.
5. Verify every call site still works.

Highest-risk shared surfaces — treat changes to these as their own PR:
`Header`, `Sidebar`, `RightPanel`, `BottomNav`, `PageTransition`,
`PostCard`, `PostComposer`, `layout.tsx`, `globals.css`.

Duplication is the signal to extract. Two pages rendering the same block
byte-for-byte should share a component — that is a net code *reduction*
and it stops the two copies drifting.

Do not add a dependency for a visual effect. The stack already has
`framer-motion`, `tailwind-merge`, `clsx` and `lucide-react`.

---

## 7. Every surface needs four states

Design all four, every time. Missing states are where products feel cheap.

1. **Loading** — skeletons that match the real layout's shape, so nothing
   jumps when data lands. Use `ui/Skeleton.tsx`. A centred spinner on a
   blank page is a last resort.
2. **Empty** — say what this is, why it is empty, and give the one action
   that fills it. Never a bare "No results".
3. **Error** — say what failed in human language, and offer a retry.
   Never surface a raw exception string to a user.
4. **Loaded** — the real thing, with real data.

Also handle: partial data, very long strings, missing avatars, slow
networks, and offline (`public/offline.html` and the service worker
already exist).

---

## 8. Performance

Visual polish that costs speed is a net loss.

- `next/image` for every raster asset, always with `sizes`. Note the brand
  files are large on disk (`logo.png` ≈ 2.3MB, `og-image.png` ≈ 1.7MB) —
  they must go through the optimizer, never a bare `<img>`.
- `priority` only on the true LCP element, and never on more than one.
- Keep `"use client"` at the leaves. A page becoming a client component to
  get one hover effect is a regression.
- Prefer CSS transitions over JS animation; prefer `transform`/`opacity`
  over layout-triggering properties.
- Watch re-renders in feed and message lists — those are the hot paths.

---

## 9. Working method

```
audit the real source  →  pick the highest-impact surface  →  design
  →  implement  →  responsive pass  →  a11y pass  →  perf pass
  →  lint / tsc / test / build  →  focused commit  →  PR
```

- **One surface per PR.** Reviewable, reversible, production-safe.
- Never redesign the whole product in one change.
- Fixing one page by breaking another is a failure, not a trade-off.
- Re-check `main` before pushing; other agents are moving.
- Never destructively rebase or force-push shared branches.

### Before every PR

```bash
npm run lint
npx tsc --noEmit
npm test
npm run build
git diff --check
```

### Honesty rule

Report only what was actually verified. If breakpoints were checked by
reading CSS rather than in a browser, say that. If no device test was
run, say that. **Never claim visual or device validation that did not
happen** — a false green is worse than a known gap.

---

## 10. Protected functionality

A design change must never break: authentication, email verification,
Google Sign-In, Sign in with Apple, account deletion, posting, media
upload, Stories, Shorts, messaging, notifications, Music, playlists,
Creator Studio, reporting, blocking, muting, moderation, search,
hashtags, scheduled posts, polls, link previews, Trust Passport, Help,
Opportunities, Marketplace.

If a redesign requires removing a control, the function must remain
reachable somewhere obvious. Moving a button is a design decision;
deleting the only path to a feature is a regression.
