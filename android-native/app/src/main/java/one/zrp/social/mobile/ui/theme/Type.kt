package one.zrp.social.mobile.ui.theme

import androidx.compose.material3.Typography
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.sp

// Platform default (Roboto) - the web app's Inter/Orbitron pairing (see
// src/app/layout.tsx) is not bundled as font resources here, since doing
// so blind (no way to render/verify a font file in this environment)
// risks shipping a broken or license-uncertain asset. Documented as a
// known, intentional difference from the reference rather than silently
// approximated - see the redesign's visual QA notes. The scale below
// covers every Material3 Typography slot explicitly (previously only 5
// of 13 were set, so anything else silently fell back to Material3's
// own default sizes) and leans slightly larger than Material3 defaults
// throughout, per the senior-friendly readability requirement.
val ZrpTypography = Typography(
    displayLarge = TextStyle(fontWeight = FontWeight.Black, fontSize = 40.sp, lineHeight = 46.sp),
    displayMedium = TextStyle(fontWeight = FontWeight.Bold, fontSize = 32.sp, lineHeight = 38.sp),
    displaySmall = TextStyle(fontWeight = FontWeight.Bold, fontSize = 28.sp, lineHeight = 34.sp),

    headlineLarge = TextStyle(fontWeight = FontWeight.Bold, fontSize = 26.sp, lineHeight = 32.sp),
    headlineMedium = TextStyle(fontWeight = FontWeight.Bold, fontSize = 24.sp, lineHeight = 30.sp),
    headlineSmall = TextStyle(fontWeight = FontWeight.SemiBold, fontSize = 22.sp, lineHeight = 28.sp),

    titleLarge = TextStyle(fontWeight = FontWeight.Bold, fontSize = 22.sp, lineHeight = 28.sp),
    titleMedium = TextStyle(fontWeight = FontWeight.SemiBold, fontSize = 18.sp, lineHeight = 24.sp),
    titleSmall = TextStyle(fontWeight = FontWeight.SemiBold, fontSize = 16.sp, lineHeight = 22.sp),

    // Body copy is the floor for senior readability - kept a notch above
    // Material3's own defaults (bodyLarge 16sp/bodyMedium 14sp there).
    bodyLarge = TextStyle(fontWeight = FontWeight.Normal, fontSize = 17.sp, lineHeight = 24.sp),
    bodyMedium = TextStyle(fontWeight = FontWeight.Normal, fontSize = 15.sp, lineHeight = 21.sp),
    bodySmall = TextStyle(fontWeight = FontWeight.Normal, fontSize = 13.sp, lineHeight = 18.sp),

    // labelLarge is new (previously undefined, so it silently fell back
    // to Material3's 14sp default) - the redesign's new nav-row/button
    // label size. labelMedium/labelSmall keep their original sizes
    // unchanged: they're already relied on across dozens of existing,
    // untouched-this-pass screens for compact UI text (badges, chips,
    // timestamps), where even a couple sp of growth risks overflow no
    // compiler or test here can catch.
    labelLarge = TextStyle(fontWeight = FontWeight.SemiBold, fontSize = 16.sp, lineHeight = 22.sp),
    labelMedium = TextStyle(fontWeight = FontWeight.Medium, fontSize = 12.sp, lineHeight = 16.sp),
    labelSmall = TextStyle(fontWeight = FontWeight.Medium, fontSize = 11.sp, lineHeight = 14.sp),
)
