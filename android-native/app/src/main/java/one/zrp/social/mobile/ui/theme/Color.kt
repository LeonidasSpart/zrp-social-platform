package one.zrp.social.mobile.ui.theme

import androidx.compose.ui.graphics.Color

// Mirrors the zrp.* palette in tailwind.config.js exactly - this is the
// single native source of truth for ZRP brand color, kept in sync by
// hand with the web app's values rather than generated, since there is
// no shared design-token pipeline between the two frontends yet.
val ZrpRed = Color(0xFFFF2D2D)
val ZrpDarkRed = Color(0xFFB10000)
val ZrpWhite = Color(0xFFFFFFFF)
val ZrpSilver = Color(0xFFBDBDBD)
val ZrpCharcoal = Color(0xFF0D0D0D)
val ZrpDeepBlack = Color(0xFF050505)
val ZrpBlue = Color(0xFF3B82F6)
val ZrpBlueDark = Color(0xFF1D4ED8)

// Tailwind's green-500 - matches the website's repost/success accent
// (see PostCard.tsx's reposted state: text-green-500) exactly, since
// that's the one UI meaning ZRP's palette doesn't already cover.
val ZrpGreen = Color(0xFF22C55E)

// A short ramp of near-black grays, each a little lighter than the
// last, used only as dark-theme surface elevation levels (see Theme.kt)
// - not part of the website's palette, since the web has no equivalent
// to Android's "lighter = higher" dark-surface convention. Without
// this, every card/sheet/row in dark mode sat on the exact same flat
// charcoal as the page background, with nothing but a hairline divider
// to separate them.
val ZrpSurfaceDim = Color(0xFF050505)
val ZrpSurfaceLow = Color(0xFF0A0A0A)
val ZrpSurfaceContainer = Color(0xFF121212)
val ZrpSurfaceHigh = Color(0xFF1A1A1A)
val ZrpSurfaceHighest = Color(0xFF242424)
val ZrpOutline = Color(0xFF2E2E2E)
val ZrpOutlineFaint = Color(0xFF1C1C1C)

// Light-theme counterparts of the above - Tailwind's gray-50/100/200,
// matching the website's own light-mode hover/border grays exactly
// (e.g. PostCard.tsx's hover:bg-gray-50/70, border-gray-200).
val ZrpLightSurfaceContainer = Color(0xFFF9FAFB)
val ZrpLightSurfaceHigh = Color(0xFFF3F4F6)
val ZrpLightOutline = Color(0xFFE5E7EB)
