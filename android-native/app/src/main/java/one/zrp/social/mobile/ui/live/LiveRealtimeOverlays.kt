package one.zrp.social.mobile.ui.live

import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.LinearOutSlowInEasing
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Favorite
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.key
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.delay
import one.zrp.social.mobile.R
import one.zrp.social.mobile.network.LiveChatAuthor
import one.zrp.social.mobile.network.LiveGift
import one.zrp.social.mobile.ui.components.Avatar
import one.zrp.social.mobile.ui.theme.Spacing
import one.zrp.social.mobile.ui.theme.ZrpRed
import kotlin.math.sin

/**
 * Shows the head of the server-driven gift queue (`live-gift:sent`, never
 * a client-side guess) as one banner at a time, then consumes it. Only
 * transform/alpha animate - never layout - and the layer draws nothing
 * when the queue is empty, so it can sit over a live video surface
 * without ever blocking or re-laying-out the video underneath. A
 * backlog shortens each banner's hold (giftDisplayDurationMillis) so a
 * burst drains instead of lagging behind the room.
 */
@Composable
fun LiveGiftAnimationLayer(
    queue: List<LiveGiftEvent>,
    authors: Map<String, LiveChatAuthor>,
    catalog: List<LiveGift>,
    onConsumed: (Long) -> Unit,
    modifier: Modifier = Modifier,
) {
    val head = queue.firstOrNull() ?: return
    val holdMillis = giftDisplayDurationMillis(queue.size)
    key(head.localId) {
        val progress = remember { Animatable(0f) }
        LaunchedEffect(Unit) {
            progress.animateTo(1f, tween(durationMillis = 260, easing = FastOutSlowInEasing))
            delay(holdMillis)
            progress.animateTo(0f, tween(durationMillis = 200, easing = LinearOutSlowInEasing))
            onConsumed(head.localId)
        }
        val sender = authors[head.senderId]
        val senderName = sender?.name ?: sender?.username ?: stringResource(R.string.live_chat_unknown_author)
        val gift = catalog.firstOrNull { it.key == head.giftKey }
        val giftName = liveGiftDisplayName(head.giftKey)
        val announcement = stringResource(R.string.live_gift_banner_a11y, senderName, head.quantity, giftName)
        Row(
            verticalAlignment = Alignment.CenterVertically,
            modifier = modifier
                .graphicsLayer {
                    alpha = progress.value
                    translationX = (1f - progress.value) * -size.width * 0.35f
                    val s = 0.9f + 0.1f * progress.value
                    scaleX = s
                    scaleY = s
                }
                .widthIn(max = 320.dp)
                .background(Color.Black.copy(alpha = 0.62f), RoundedCornerShape(50))
                .padding(start = Spacing.xs, end = Spacing.md, top = Spacing.xs, bottom = Spacing.xs)
                .clearAndSetSemantics {
                    contentDescription = announcement
                    liveRegion = LiveRegionMode.Polite
                },
        ) {
            Avatar(url = sender?.avatarUrl, name = senderName, size = 32.dp)
            Column(modifier = Modifier.weight(1f, fill = false).padding(horizontal = Spacing.sm)) {
                Text(
                    text = senderName,
                    color = Color.White,
                    style = MaterialTheme.typography.labelLarge,
                    fontWeight = FontWeight.Bold,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
                Text(
                    text = stringResource(R.string.live_gift_banner_sent, giftName),
                    color = Color.White.copy(alpha = 0.85f),
                    style = MaterialTheme.typography.labelSmall,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }
            LiveGiftIcon(iconUrl = gift?.iconUrl, size = 36.dp, tint = Color.White)
            Text(
                text = stringResource(R.string.live_gift_quantity_multiplier, head.quantity),
                color = Color.White,
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.Bold,
                modifier = Modifier.padding(start = Spacing.xs),
            )
        }
    }
}

/**
 * Floating hearts for `live-reaction:tap` bursts (and my own taps, drawn
 * locally the instant they happen). Each burst draws at most
 * [reactionParticleCount] hearts driven by ONE Animatable - a burst of
 * 50 taps is a handful of particles plus a "+50" label, never 50
 * separately animated views - and every particle animates only through
 * graphicsLayer (draw phase), so a busy room never recomposes per frame.
 */
@Composable
fun LiveReactionLayer(
    bursts: List<LiveReactionBurst>,
    onConsumed: (Long) -> Unit,
    modifier: Modifier = Modifier,
) {
    Box(modifier = modifier) {
        bursts.forEach { burst ->
            key(burst.localId) {
                ReactionBurstView(burst = burst, onDone = { onConsumed(burst.localId) })
            }
        }
    }
}

@Composable
private fun ReactionBurstView(burst: LiveReactionBurst, onDone: () -> Unit) {
    val progress = remember { Animatable(0f) }
    val particles = reactionParticleCount(burst.count)
    // Deterministic per-burst spread so concurrent bursts don't overlap
    // into one column, without any randomness that would make tests or
    // screenshots non-reproducible.
    val lane = (burst.localId % 5).toInt() - 2
    val density = LocalDensity.current
    val risePx = with(density) { 180.dp.toPx() }
    val lanePx = with(density) { 14.dp.toPx() }
    LaunchedEffect(Unit) {
        progress.animateTo(1f, tween(durationMillis = 1_600, easing = LinearOutSlowInEasing))
        onDone()
    }
    Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.BottomCenter) {
        repeat(particles) { index ->
            Icon(
                imageVector = Icons.Filled.Favorite,
                contentDescription = null,
                tint = if (burst.mine) ZrpRed else ZrpRed.copy(alpha = 0.85f),
                modifier = Modifier
                    .size(if (index == 0) 26.dp else 20.dp)
                    .graphicsLayer {
                        val stagger = index * 0.08f
                        val p = ((progress.value - stagger) / (1f - stagger)).coerceIn(0f, 1f)
                        translationY = -p * risePx * (1f - index * 0.06f)
                        translationX = lane * lanePx + sin((p * 3f + index) * 1.7f) * lanePx * 0.9f
                        alpha = if (p <= 0f) 0f else (1f - p)
                        val s = 0.7f + 0.5f * p
                        scaleX = s
                        scaleY = s
                    },
            )
        }
        if (burst.count > particles) {
            Text(
                text = stringResource(R.string.live_reaction_burst_count, burst.count),
                color = Color.White,
                style = MaterialTheme.typography.labelMedium,
                fontWeight = FontWeight.Bold,
                modifier = Modifier
                    .graphicsLayer {
                        translationY = -progress.value * risePx * 0.7f
                        translationX = lane * lanePx
                        alpha = 1f - progress.value
                    }
                    .background(ZrpRed, CircleShape)
                    .padding(horizontal = Spacing.sm, vertical = 2.dp),
            )
        }
    }
}
