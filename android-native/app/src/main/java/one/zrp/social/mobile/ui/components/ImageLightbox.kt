package one.zrp.social.mobile.ui.components

import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.pager.HorizontalPager
import androidx.compose.foundation.pager.rememberPagerState
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Close
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import coil.compose.AsyncImage
import one.zrp.social.mobile.R
import one.zrp.social.mobile.ui.theme.Spacing

// The same full-screen viewer PostCard.tsx's own image lightbox offers -
// swipe between every real image in the list (mobile web relies on the
// same touch-swipe gesture too; its prev/next chevron buttons are
// desktop-only, "hidden sm:flex", so a swipeable pager alone is genuine
// parity with the actual mobile experience, not a reduced substitute).
// "Close image" matches the real, untranslated aria-label="Close image"
// web's own lightbox close button carries. Shared (not private to
// PostCard.kt) so any screen with a tappable image - feed posts,
// message attachments - opens the exact same viewer and gesture
// behavior rather than each building its own.
@OptIn(ExperimentalFoundationApi::class)
@Composable
fun ImageLightbox(images: List<String>, initialIndex: Int, onDismiss: () -> Unit) {
    Dialog(
        onDismissRequest = onDismiss,
        properties = DialogProperties(usePlatformDefaultWidth = false),
    ) {
        val pagerState = rememberPagerState(initialPage = initialIndex) { images.size }
        Box(modifier = Modifier.fillMaxSize().background(Color.Black)) {
            HorizontalPager(state = pagerState, modifier = Modifier.fillMaxSize()) { page ->
                // Tap the image again to close, matching how every other
                // mobile image viewer behaves - the only way out
                // otherwise is the small top-right X. clickable's tap
                // gesture doesn't fight the pager's own drag-to-swipe
                // gesture, so swiping between images is unaffected.
                AsyncImage(
                    model = images[page],
                    contentDescription = null,
                    contentScale = ContentScale.Fit,
                    modifier = Modifier
                        .fillMaxSize()
                        .clickable(onClick = onDismiss),
                )
            }
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .align(Alignment.TopCenter)
                    .padding(Spacing.md),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                if (images.size > 1) {
                    Text(
                        text = "${pagerState.currentPage + 1} / ${images.size}",
                        color = Color.White,
                        style = MaterialTheme.typography.labelMedium,
                    )
                } else {
                    Spacer(modifier = Modifier.size(1.dp))
                }
                IconButton(onClick = onDismiss) {
                    Icon(Icons.Filled.Close, contentDescription = stringResource(R.string.post_close_image_cd), tint = Color.White)
                }
            }
        }
    }
}
