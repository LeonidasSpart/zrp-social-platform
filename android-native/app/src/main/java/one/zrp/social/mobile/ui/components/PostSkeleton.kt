package one.zrp.social.mobile.ui.components

import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Shape
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.unit.dp
import one.zrp.social.mobile.ui.theme.Spacing

/**
 * Feed loading placeholders.
 *
 * Nothing in this app had a skeleton of any kind - a first load showed
 * either a centred spinner or, on Home, simply nothing - so the feed
 * appeared to pop into existence and the layout jumped as it did. These
 * mirror PostCard's real proportions (40dp avatar, name line, two body
 * lines) so rows land in roughly the space their placeholder occupied
 * instead of shifting it.
 *
 * The website renders the same shape for the same moment (see the
 * skeleton block in src/app/page.tsx).
 */
@Composable
private fun rememberShimmerBrush(): Brush {
    // Brush offsets are in pixels, so the sweep distance has to be
    // converted from dp - passing screenWidthDp straight in made the
    // gradient travel a fraction of the intended distance on every
    // device above 1x density.
    val density = LocalDensity.current
    val configuration = LocalConfiguration.current
    val sweepPx = with(density) { configuration.screenWidthDp.dp.toPx() }

    val transition = rememberInfiniteTransition(label = "skeletonShimmer")
    val offset by transition.animateFloat(
        initialValue = -sweepPx,
        targetValue = sweepPx * 2f,
        animationSpec = infiniteRepeatable(
            animation = tween(durationMillis = 1400, easing = LinearEasing),
            repeatMode = RepeatMode.Restart,
        ),
        label = "skeletonShimmerOffset",
    )

    val base = MaterialTheme.colorScheme.surfaceContainerHighest
    return Brush.linearGradient(
        colors = listOf(base, base.copy(alpha = 0.45f), base),
        start = Offset(offset, 0f),
        end = Offset(offset + sweepPx, 0f),
    )
}

// The brush is hoisted and passed in rather than created here: one
// infinite transition drives the whole list, instead of one per block
// (five rows x four blocks = twenty animations running at once).
@Composable
private fun SkeletonBlock(
    brush: Brush,
    modifier: Modifier = Modifier,
    shape: Shape = RoundedCornerShape(6.dp),
) {
    Spacer(modifier = modifier.background(brush = brush, shape = shape))
}

/** One placeholder row, shaped like a real PostCard. */
@Composable
fun PostSkeleton(modifier: Modifier = Modifier, brush: Brush = rememberShimmerBrush()) {
    Row(
        modifier = modifier
            .fillMaxWidth()
            .padding(horizontal = Spacing.lg, vertical = Spacing.md),
    ) {
        SkeletonBlock(brush = brush, modifier = Modifier.size(40.dp), shape = CircleShape)
        Column(modifier = Modifier.padding(start = Spacing.md)) {
            SkeletonBlock(
                brush = brush,
                modifier = Modifier
                    .padding(top = Spacing.xs)
                    .width(128.dp)
                    .height(12.dp),
            )
            SkeletonBlock(
                brush = brush,
                modifier = Modifier
                    .padding(top = Spacing.md)
                    .fillMaxWidth()
                    .height(12.dp),
            )
            SkeletonBlock(
                brush = brush,
                modifier = Modifier
                    .padding(top = Spacing.sm)
                    .fillMaxWidth(0.75f)
                    .height(12.dp),
            )
        }
    }
}

/**
 * A short column of placeholder rows for a first load.
 *
 * clearAndSetSemantics keeps the whole block out of the accessibility
 * tree: a screen reader announcing five identical empty rows is worse
 * than announcing nothing while content loads.
 */
@Composable
fun PostSkeletonList(count: Int = 5, modifier: Modifier = Modifier) {
    val brush = rememberShimmerBrush()
    Column(modifier = modifier.clearAndSetSemantics {}) {
        repeat(count) { PostSkeleton(brush = brush) }
    }
}
