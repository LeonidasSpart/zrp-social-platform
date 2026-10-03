package one.zrp.social.mobile.ui.live

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.size
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CardGiftcard
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.Dp
import coil.compose.SubcomposeAsyncImage

/**
 * Display names for gift catalog keys, resolved client-side exactly like
 * ZRP PLAY's challengeTypeLabel() resolves a server-sent `type` - the
 * server never sends display text (see schema.prisma's GiftDefinition
 * comment).
 *
 * Deliberately EMPTY today: the catalog is admin-defined at runtime
 * (POST /api/admin/live-gifts accepts any lowercase slug), no gift is
 * seeded by any migration, and web's translations.ts has no gift-name
 * keys yet - so there is no canonical key set to translate. Inventing
 * keys here would be fake data. Until the catalog's keys are decided,
 * every gift renders as its humanised key ([humanizeGiftKey]) - real
 * server data, just formatted. When keys are fixed, add one
 * `live_gift_name_<key>` string per key (in every values-xx folder) and
 * one entry here.
 */
internal val LIVE_GIFT_NAME_RES: Map<String, Int> = emptyMap()

@Composable
fun liveGiftDisplayName(key: String): String {
    val res = LIVE_GIFT_NAME_RES[key]
    return if (res != null) stringResource(res) else humanizeGiftKey(key)
}

/**
 * A gift's icon from its real catalog `iconUrl`, or a neutral gift glyph
 * when the catalog entry has none (or it fails to load). Never a made-up
 * image. [animationUrl] is intentionally not rendered: its format is
 * unspecified by the backend (Lottie? animated WebP? GIF?) and this app
 * has no decoder for any animated format (coil-gif/Lottie aren't
 * dependencies) - see the PR's reported gaps.
 */
@Composable
fun LiveGiftIcon(iconUrl: String?, size: Dp, modifier: Modifier = Modifier, tint: Color = MaterialTheme.colorScheme.onSurfaceVariant) {
    val url = iconUrl
    if (url.isNullOrBlank()) {
        GiftFallbackIcon(size = size, tint = tint, modifier = modifier)
        return
    }
    SubcomposeAsyncImage(
        model = url,
        contentDescription = null,
        contentScale = ContentScale.Fit,
        modifier = modifier.size(size),
        loading = { GiftFallbackIcon(size = size, tint = tint) },
        error = { GiftFallbackIcon(size = size, tint = tint) },
    )
}

@Composable
private fun GiftFallbackIcon(size: Dp, tint: Color, modifier: Modifier = Modifier) {
    Box(modifier = modifier.size(size), contentAlignment = Alignment.Center) {
        Icon(Icons.Filled.CardGiftcard, contentDescription = null, tint = tint, modifier = Modifier.size(size * 0.8f))
    }
}
