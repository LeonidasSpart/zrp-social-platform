package one.zrp.social.mobile.ui.components

import android.content.Intent
import android.net.Uri
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.matchParentSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.OpenInNew
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import coil.compose.AsyncImage
import one.zrp.social.mobile.data.LinkPreviewRepository
import one.zrp.social.mobile.network.LinkPreview
import one.zrp.social.mobile.ui.theme.Spacing
import one.zrp.social.mobile.ui.theme.ZrpRed
import java.util.Locale

// Ported field-for-field from src/lib/link-preview-parse.ts's own
// extractFirstUrl(): finds the first http(s)/www URL in free-form text,
// trims plain trailing sentence punctuation, then only strips a
// trailing ')' when it isn't balanced by a still-open '(' earlier in
// the same URL - the same bracket-balance heuristic that keeps a
// Wikipedia-style .../wiki/Example_(disambiguation) link intact.
//
// Shared by PostCard (feed posts) and the 1:1/group message screens -
// previously duplicated privately inside PostCard.kt only, so messages
// had no preview card at all despite this same backend already
// existing and working.
private val FIRST_URL_REGEX = Regex("""(https?://\S+)|(www\.\S+)""")
private val FIRST_URL_TRAILING_PUNCTUATION = Regex("""[.,!?;:'"\]}]+$""")

fun extractFirstUrl(content: String): String? {
    val match = FIRST_URL_REGEX.find(content) ?: return null
    var raw = match.value.replace(FIRST_URL_TRAILING_PUNCTUATION, "")

    while (raw.endsWith(")")) {
        val opens = raw.count { it == '(' }
        val closes = raw.count { it == ')' }
        if (closes <= opens) break
        raw = raw.dropLast(1)
    }

    return if (raw.startsWith("http")) raw else "https://$raw"
}

// The native equivalent of LinkPreviewCard.tsx - same on-demand fetch
// (GET /api/link-preview?url=), same "nothing usable found -> render
// nothing, the plain URL text stays the fallback" behavior (never a
// broken/empty card), same tap target (opens the real page in a
// browser, never an in-app embed even for the video/YouTube case).
// [onLoaded] mirrors the reference component's own onLoaded(found)
// callback, used by callers to decide whether to hide the matching raw
// URL token in their own linkified text.
@Composable
fun LinkPreviewBlock(url: String, onLoaded: (Boolean) -> Unit, modifier: Modifier = Modifier) {
    val context = LocalContext.current
    val repository = remember { LinkPreviewRepository() }
    var preview by remember(url) { mutableStateOf<LinkPreview?>(null) }
    var loading by remember(url) { mutableStateOf(true) }
    var imageErrored by remember(url) { mutableStateOf(false) }

    LaunchedEffect(url) {
        loading = true
        imageErrored = false
        val data = repository.getLinkPreview(url).getOrNull()
        val found = data != null && (data.title != null || data.image != null)
        preview = if (found) data else null
        loading = false
        onLoaded(found)
    }

    if (loading) {
        Column(
            modifier = modifier
                .fillMaxWidth()
                .padding(top = Spacing.sm)
                .clip(MaterialTheme.shapes.medium)
                .border(1.dp, MaterialTheme.colorScheme.outlineVariant, MaterialTheme.shapes.medium),
        ) {
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .aspectRatio(1.91f)
                    .background(MaterialTheme.colorScheme.surfaceContainerLow),
            )
        }
        return
    }

    val data = preview ?: return

    val domain = remember(data) {
        data.siteName?.takeIf { it.isNotBlank() } ?: try {
            java.net.URI(data.url).host?.removePrefix("www.") ?: ""
        } catch (e: Exception) {
            ""
        }
    }
    // isVideo covers any publisher whose own page metadata says so, not
    // just YouTube - matching LinkPreviewCard.tsx's own isVideo/isYouTube
    // check exactly. This is purely a visual play-icon affordance; the
    // card still only ever opens the real target page, never an embed.
    val isYouTube = data.siteName == "YouTube"
    val showPlayIcon = data.isVideo || isYouTube

    Column(
        modifier = modifier
            .fillMaxWidth()
            .padding(top = Spacing.sm)
            .clip(MaterialTheme.shapes.medium)
            .border(1.dp, MaterialTheme.colorScheme.outlineVariant, MaterialTheme.shapes.medium)
            .clickable {
                context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(data.url)))
            },
    ) {
        if (data.image != null && !imageErrored) {
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .aspectRatio(1.91f)
                    .background(MaterialTheme.colorScheme.surfaceContainerLow),
            ) {
                AsyncImage(
                    model = data.image,
                    contentDescription = null,
                    contentScale = ContentScale.Crop,
                    onError = { imageErrored = true },
                    modifier = Modifier.fillMaxSize(),
                )
                if (showPlayIcon) {
                    Box(modifier = Modifier.matchParentSize(), contentAlignment = Alignment.Center) {
                        Box(
                            modifier = Modifier
                                .clip(CircleShape)
                                .background(ZrpRed.copy(alpha = 0.9f))
                                .padding(Spacing.sm),
                        ) {
                            Icon(
                                imageVector = Icons.Filled.PlayArrow,
                                contentDescription = null,
                                tint = Color.White,
                            )
                        }
                    }
                }
            }
        }

        Column(modifier = Modifier.padding(Spacing.sm)) {
            if (domain.isNotEmpty()) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Icon(
                        imageVector = Icons.Filled.OpenInNew,
                        contentDescription = null,
                        tint = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.size(12.dp),
                    )
                    Text(
                        text = domain.uppercase(Locale.getDefault()),
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.padding(start = 4.dp),
                    )
                }
            }
            val title = data.title
            if (!title.isNullOrBlank()) {
                Text(
                    text = title,
                    style = MaterialTheme.typography.bodyMedium,
                    fontWeight = FontWeight.SemiBold,
                    maxLines = 2,
                    modifier = Modifier.padding(top = 2.dp),
                )
            }
            val description = data.description
            if (!description.isNullOrBlank()) {
                Text(
                    text = description,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    maxLines = 2,
                    modifier = Modifier.padding(top = 2.dp),
                )
            }
        }
    }
}
