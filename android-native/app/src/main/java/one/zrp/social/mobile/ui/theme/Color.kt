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
