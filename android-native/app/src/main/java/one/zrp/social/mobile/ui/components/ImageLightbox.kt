package one.zrp.social.mobile.ui.components

import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.background
import androidx.compose.foundation.gestures.awaitEachGesture
import androidx.compose.foundation.gestures.awaitFirstDown
import androidx.compose.foundation.gestures.calculateCentroid
import androidx.compose.foundation.gestures.calculatePan
import androidx.compose.foundation.gestures.calculateZoom
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawing
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.pager.HorizontalPager
import androidx.compose.foundation.pager.rememberPagerState
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.BrokenImage
import androidx.compose.material.icons.filled.Close
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.input.pointer.positionChanged
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import coil.compose.AsyncImage
import coil.compose.AsyncImagePainter
import coil.request.ImageRequest
import one.zrp.social.mobile.R
import one.zrp.social.mobile.ui.theme.IconSize
import one.zrp.social.mobile.ui.theme.Spacing
import one.zrp.social.mobile.ui.theme.TouchTarget

private const val MIN_SCALE = 1f
private const val MAX_SCALE = 5f
private const val DOUBLE_TAP_SCALE = 2.5f

// The same full-screen viewer PostCard.tsx's own image lightbox offers -
// swipe between every real image in the list (mobile web relies on the
// same touch-swipe gesture too; its prev/next chevron buttons are
// desktop-only, "hidden sm:flex", so a swipeable pager alone is genuine
// parity with the actual mobile experience, not a reduced substitute).
// "Close image" matches the real, untranslated aria-label="Close image"
// web's own lightbox close button carries. Shared (not private to
// PostCard.kt) so any screen with a tappable image - feed posts, the
// profile avatar/banner, message attachments - opens the exact same
// viewer and gesture behavior rather than each building its own.
//
// What a real-device pass found broken here, all fixed in place:
//   - No zoom. A profile avatar or banner opened at fit-to-screen and
//     that was it; pinching did nothing. Pinch/pan and double-tap now
//     zoom (bounded 1x..5x), reset per page and on close.
//   - Tapping anywhere closed the viewer - including the end of a
//     pinch, when a finger lifts a fraction after the other, so zooming
//     often just dismissed it. A single tap now closes only at 1x.
//   - No loading or error state: a slow or dead URL showed an empty
//     black screen with no explanation and no way out but the X. There
//     is now a spinner while Coil loads, and a labelled error state with
//     Retry when it fails.
//   - The close button was a default 40dp IconButton sitting inside the
//     dialog's own inset-less window: sized to the 48dp floor and inset
//     by WindowInsets.safeDrawing so it clears the status bar and the
//     display cutout in either orientation (the Dialog is now drawn
//     edge-to-edge, so those insets are this composable's to respect).
@OptIn(ExperimentalFoundationApi::class)
@Composable
fun ImageLightbox(images: List<String>, initialIndex: Int, onDismiss: () -> Unit) {
    Dialog(
        onDismissRequest = onDismiss,
        properties = DialogProperties(
            usePlatformDefaultWidth = false,
            decorFitsSystemWindows = false,
        ),
    ) {
        val pagerState = rememberPagerState(initialPage = initialIndex.coerceIn(0, (images.size - 1).coerceAtLeast(0))) { images.size }
        // Only the page under the finger can be zoomed; the pager may
        // only swipe while that page is at 1x (see ZoomableImage).
        var zoomedPage by remember { mutableIntStateOf(-1) }

        Box(modifier = Modifier.fillMaxSize().background(Color.Black)) {
            HorizontalPager(
                state = pagerState,
                userScrollEnabled = zoomedPage == -1,
                modifier = Modifier.fillMaxSize(),
            ) { page ->
                ZoomableImage(
                    url = images[page],
                    onTapAtRest = onDismiss,
                    onZoomedChanged = { zoomed -> zoomedPage = if (zoomed) page else if (zoomedPage == page) -1 else zoomedPage },
                )
            }

            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .align(Alignment.TopCenter)
                    .windowInsetsPadding(WindowInsets.safeDrawing)
                    .padding(horizontal = Spacing.sm, vertical = Spacing.xs),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                if (images.size > 1) {
                    Text(
                        text = "${pagerState.currentPage + 1} / ${images.size}",
                        color = Color.White,
                        style = MaterialTheme.typography.labelMedium,
                        modifier = Modifier.padding(start = Spacing.sm),
                    )
                } else {
                    Spacer(modifier = Modifier.size(1.dp))
                }
                IconButton(onClick = onDismiss, modifier = Modifier.size(TouchTarget.min)) {
                    Icon(
                        Icons.Filled.Close,
                        contentDescription = stringResource(R.string.post_close_image_cd),
                        tint = Color.White,
                        modifier = Modifier.size(IconSize.md),
                    )
                }
            }
        }
    }
}

/**
 * One page of the lightbox: the image with pinch-to-zoom, pan while
 * zoomed, double-tap to toggle 1x/2.5x, plus real loading and error
 * states for the URL.
 *
 * Gesture arbitration with the parent pager, done by hand rather than
 * with Modifier.transformable: transformable consumes every pan past
 * touch slop, which would steal the pager's swipe even at 1x. This loop
 * only consumes events when a second finger is down (a pinch) or the
 * page is already zoomed in, so a plain one-finger swipe at 1x reaches
 * the pager untouched and paging keeps working. The pager is
 * additionally told to stop scrolling while zoomed (userScrollEnabled)
 * so a pan near the edge of a zoomed image can never accidentally flip
 * the page.
 */
@Composable
private fun ZoomableImage(
    url: String,
    onTapAtRest: () -> Unit,
    onZoomedChanged: (Boolean) -> Unit,
) {
    val context = LocalContext.current
    var scale by remember(url) { mutableFloatStateOf(MIN_SCALE) }
    var offset by remember(url) { mutableStateOf(Offset.Zero) }
    var loadState by remember(url) { mutableStateOf<AsyncImagePainter.State>(AsyncImagePainter.State.Empty) }
    // Bumped by Retry: a new ImageRequest (different parameters) is
    // what makes Coil actually re-fetch instead of returning the same
    // failed result for an unchanged model.
    var attempt by remember(url) { mutableIntStateOf(0) }

    fun applyZoom(newScale: Float, newOffset: Offset) {
        val clamped = newScale.coerceIn(MIN_SCALE, MAX_SCALE)
        scale = clamped
        offset = if (clamped <= MIN_SCALE) Offset.Zero else newOffset
        onZoomedChanged(clamped > MIN_SCALE)
    }

    Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
        AsyncImage(
            model = ImageRequest.Builder(context)
                .data(url)
                .apply { if (attempt > 0) setParameter("zrp_retry", attempt) }
                .build(),
            contentDescription = null,
            contentScale = ContentScale.Fit,
            onState = { loadState = it },
            modifier = Modifier
                .fillMaxSize()
                .graphicsLayer {
                    scaleX = scale
                    scaleY = scale
                    translationX = offset.x
                    translationY = offset.y
                }
                .pointerInput(url) {
                    detectTapGestures(
                        onTap = { if (scale <= MIN_SCALE) onTapAtRest() },
                        onDoubleTap = {
                            if (scale > MIN_SCALE) applyZoom(MIN_SCALE, Offset.Zero) else applyZoom(DOUBLE_TAP_SCALE, Offset.Zero)
                        },
                    )
                }
                .pointerInput(url) {
                    awaitEachGesture {
                        awaitFirstDown(requireUnconsumed = false)
                        do {
                            val event = awaitPointerEvent()
                            val pinching = event.changes.count { it.pressed } > 1
                            if (pinching || scale > MIN_SCALE) {
                                val zoomChange = event.calculateZoom()
                                val panChange = event.calculatePan()
                                val centroid = event.calculateCentroid()
                                val newScale = (scale * zoomChange).coerceIn(MIN_SCALE, MAX_SCALE)
                                // Zoom about the pinch centroid (measured
                                // from the page centre, which is where
                                // graphicsLayer scales around) so the
                                // image grows under the fingers rather
                                // than from its own middle.
                                val centre = Offset(size.width / 2f, size.height / 2f)
                                val focal = centroid - centre
                                val scaled = if (newScale != scale) (offset - focal) * (newScale / scale) + focal else offset
                                applyZoom(newScale, scaled + panChange)
                                event.changes.forEach { if (it.positionChanged()) it.consume() }
                            }
                        } while (event.changes.any { it.pressed })
                    }
                },
        )

        when (loadState) {
            is AsyncImagePainter.State.Loading, AsyncImagePainter.State.Empty -> {
                CircularProgressIndicator(color = Color.White)
            }
            is AsyncImagePainter.State.Error -> {
                Column(
                    horizontalAlignment = Alignment.CenterHorizontally,
                    modifier = Modifier.padding(Spacing.xl),
                ) {
                    Icon(
                        Icons.Filled.BrokenImage,
                        contentDescription = null,
                        tint = Color.White,
                        modifier = Modifier.size(IconSize.lg),
                    )
                    Text(
                        text = stringResource(R.string.image_viewer_load_failed),
                        color = Color.White,
                        style = MaterialTheme.typography.bodyMedium,
                        textAlign = TextAlign.Center,
                        modifier = Modifier.padding(top = Spacing.sm),
                    )
                    TextButton(onClick = { attempt++ }) {
                        Text(stringResource(R.string.action_retry), color = Color.White)
                    }
                }
            }
            is AsyncImagePainter.State.Success -> Unit
        }
    }
}
