package one.zrp.social.mobile.ui.stories

import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.Spring
import androidx.compose.animation.core.spring
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.AddCircle
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Favorite
import androidx.compose.material.icons.filled.FavoriteBorder
import androidx.compose.material.icons.filled.Visibility
import androidx.compose.material.icons.filled.VolumeOff
import androidx.compose.material.icons.filled.VolumeUp
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.key
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.scale
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.media3.common.MediaItem
import androidx.media3.common.Player
import androidx.media3.common.util.UnstableApi
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.ui.AspectRatioFrameLayout
import androidx.media3.ui.PlayerView
import coil.compose.AsyncImage
import kotlinx.coroutines.delay
import one.zrp.social.mobile.R
import one.zrp.social.mobile.data.StoriesRepository
import one.zrp.social.mobile.ui.components.Avatar
import one.zrp.social.mobile.ui.theme.ZrpRed

// Matches the website's own StoryViewer duration constant for
// text/image stories exactly. Video stories are the one deliberate
// native improvement over the website here: the website drives every
// story - video included - off this same flat 5s timer while a plain
// HTML <video controls autoPlay> tag plays independently underneath,
// so a longer video gets cut off mid-playback there. Native instead
// binds the progress bar and auto-advance to the video's own real
// duration/position (see StoryVideoPlayer below) - the same real
// content, presented the way every reference story app (Instagram,
// TikTok, Snapchat) actually does it, not a literal copy of a web
// timing quirk that reads as a bug rather than an intentional choice.
private const val STORY_DURATION_MS = 5000L

/**
 * A single user's real story viewer - real stories, real like/view
 * state, real author info, and the same real interaction model the
 * website's own StoryViewer uses: timed auto-advance with an animated
 * progress bar, tap left/right thirds to go back/forward, press-and-
 * hold the middle to pause, double-tap the middle to like. Video
 * stories play for real via ExoPlayer (ImageStory playback already
 * worked via Coil).
 */
@Composable
fun StoryViewerScreen(
    userId: String,
    onClose: () -> Unit,
    onAddStory: () -> Unit = {},
    onOpenProfile: (username: String) -> Unit = {},
) {
    val viewModel: StoryViewerViewModel = viewModel(
        factory = remember(userId) { StoryViewerViewModelFactory(StoriesRepository(), userId) },
    )
    val state by viewModel.state.collectAsState()
    var currentIndex by remember(userId) { mutableIntStateOf(0) }
    // Persists across this author's stories (not reset per-story) so a
    // user's mute choice carries forward the same way it would on any
    // other short-form video surface (see Shorts' own muted state) -
    // the website's <video> here has no muted attribute at all (sound
    // on by default, browser autoplay policy permitting), which native
    // matches by defaulting to unmuted rather than inventing a
    // different default.
    var videoMuted by remember(userId) { mutableStateOf(false) }

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(Color.Black),
    ) {
        when {
            state.isLoading -> {
                Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    CircularProgressIndicator(color = Color.White)
                }
            }
            state.stories.isEmpty() -> {
                LaunchedEffect(Unit) { onClose() }
            }
            else -> {
                val stories = state.stories
                val index = currentIndex.coerceIn(0, stories.lastIndex)
                val story = stories[index]
                val isVideo = story.mediaType == "video" && story.mediaUrl != null

                LaunchedEffect(story.id) {
                    if (!story.viewed) viewModel.markViewed(story.id)
                }

                var paused by remember(story.id) { mutableStateOf(false) }
                var progress by remember(story.id) { mutableFloatStateOf(0f) }
                var burstTrigger by remember(story.id) { mutableIntStateOf(0) }

                fun goNext() {
                    if (index < stories.lastIndex) currentIndex = index + 1 else onClose()
                }
                fun goPrev() {
                    if (index > 0) currentIndex = index - 1
                }

                // Fixed-duration auto-advance for text/image stories only -
                // video drives its own progress via StoryVideoPlayer's
                // onProgress callback below.
                if (!isVideo) {
                    LaunchedEffect(story.id, paused) {
                        if (paused) return@LaunchedEffect
                        val startTime = System.currentTimeMillis() - (progress * STORY_DURATION_MS).toLong()
                        while (true) {
                            val elapsed = System.currentTimeMillis() - startTime
                            progress = (elapsed / STORY_DURATION_MS.toFloat()).coerceIn(0f, 1f)
                            if (progress >= 1f) {
                                goNext()
                                break
                            }
                            delay(16)
                        }
                    }
                }

                // ── Media layer (edge-to-edge, letterboxed rather than
                // cropped so nothing the author actually posted is cut off) ──
                Box(modifier = Modifier.fillMaxSize()) {
                    key(story.id) {
                        when {
                            story.mediaUrl != null && isVideo -> {
                                StoryVideoPlayer(
                                    url = story.mediaUrl,
                                    paused = paused,
                                    muted = videoMuted,
                                    onProgress = { position, duration ->
                                        if (duration > 0) progress = (position.toFloat() / duration).coerceIn(0f, 1f)
                                    },
                                    onEnded = { goNext() },
                                    modifier = Modifier.fillMaxSize(),
                                )
                            }
                            story.mediaUrl != null -> {
                                AsyncImage(
                                    model = story.mediaUrl,
                                    contentDescription = null,
                                    contentScale = ContentScale.Fit,
                                    modifier = Modifier.fillMaxSize(),
                                )
                            }
                            else -> {
                                Box(
                                    modifier = Modifier
                                        .fillMaxSize()
                                        .background(
                                            Brush.verticalGradient(listOf(Color(0xFF1A1A1A), Color.Black)),
                                        ),
                                    contentAlignment = Alignment.Center,
                                ) {
                                    Text(
                                        text = story.content ?: "",
                                        color = Color.White,
                                        style = MaterialTheme.typography.headlineSmall,
                                        modifier = Modifier.padding(32.dp),
                                    )
                                }
                            }
                        }
                    }

                    // Bottom scrim + caption, only when there's real media
                    // to overlay text onto (matches the website's own
                    // gradient-behind-caption treatment).
                    if (story.mediaUrl != null && !story.content.isNullOrBlank()) {
                        Box(
                            modifier = Modifier
                                .fillMaxWidth()
                                .align(Alignment.BottomCenter)
                                .background(Brush.verticalGradient(listOf(Color.Transparent, Color.Black.copy(alpha = 0.75f)))),
                        ) {
                            Text(
                                text = story.content,
                                color = Color.White,
                                style = MaterialTheme.typography.bodyMedium,
                                textAlign = androidx.compose.ui.text.style.TextAlign.Center,
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .navigationBarsPadding()
                                    .padding(horizontal = 20.dp, vertical = 24.dp),
                            )
                        }
                    }
                }

                // ── Tap zones: left third = prev, middle third = hold-to-
                // pause / double-tap-to-like, right third = next ──
                val noRipple = remember { MutableInteractionSource() }
                Row(modifier = Modifier.fillMaxSize()) {
                    Box(
                        modifier = Modifier
                            .weight(1f)
                            .fillMaxHeight()
                            .clickable(interactionSource = noRipple, indication = null) { goPrev() },
                    )
                    Box(
                        modifier = Modifier
                            .weight(1f)
                            .fillMaxHeight()
                            .pointerInput(story.id) {
                                detectTapGestures(
                                    onPress = {
                                        paused = true
                                        tryAwaitRelease()
                                        paused = false
                                    },
                                    onDoubleTap = {
                                        if (!story.liked) viewModel.toggleLike(story.id)
                                        burstTrigger++
                                    },
                                )
                            },
                    )
                    Box(
                        modifier = Modifier
                            .weight(1f)
                            .fillMaxHeight()
                            .clickable(interactionSource = noRipple, indication = null) { goNext() },
                    )
                }

                if (burstTrigger > 0) {
                    HeartBurst(trigger = burstTrigger, modifier = Modifier.align(Alignment.Center))
                }

                // ── Top chrome: progress segments + author/view-count/close ──
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .statusBarsPadding()
                        .padding(horizontal = 8.dp, vertical = 8.dp),
                ) {
                    Row(horizontalArrangement = Arrangement.spacedBy(4.dp), modifier = Modifier.fillMaxWidth()) {
                        stories.forEachIndexed { segmentIndex, _ ->
                            val fraction = when {
                                segmentIndex < index -> 1f
                                segmentIndex == index -> progress
                                else -> 0f
                            }
                            Box(
                                modifier = Modifier
                                    .weight(1f)
                                    .height(3.dp)
                                    .background(Color.White.copy(alpha = 0.3f)),
                            ) {
                                Box(
                                    modifier = Modifier
                                        .fillMaxHeight()
                                        .fillMaxWidth(fraction)
                                        .background(Color.White),
                                )
                            }
                        }
                    }

                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(top = 10.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        val author = state.author
                        // Tapping the author here must go to their real
                        // profile the same way every other author-click
                        // surface in the app does (goToProfile in
                        // ZrpNavHost, keyed by username) - not just look
                        // clickable. Guarded on author being loaded since
                        // this row can render for one frame before
                        // state.author arrives.
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            modifier = Modifier
                                .weight(1f)
                                .clickable(
                                    interactionSource = noRipple,
                                    indication = null,
                                    enabled = author != null,
                                ) { author?.let { onOpenProfile(it.username) } },
                        ) {
                            Avatar(
                                url = author?.avatarUrl,
                                name = author?.name ?: author?.username ?: "?",
                                size = 32.dp,
                            )
                            Text(
                                text = author?.name ?: author?.username ?: "",
                                color = Color.White,
                                fontWeight = FontWeight.SemiBold,
                                style = MaterialTheme.typography.bodyMedium,
                                modifier = Modifier
                                    .weight(1f)
                                    .padding(start = 8.dp),
                            )
                        }

                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            modifier = Modifier
                                .background(Color.Black.copy(alpha = 0.35f), MaterialTheme.shapes.extraLarge)
                                .padding(horizontal = 8.dp, vertical = 4.dp),
                        ) {
                            Icon(Icons.Filled.Visibility, contentDescription = null, tint = Color.White, modifier = Modifier.size(14.dp))
                            Text(
                                text = story.viewCount.toString(),
                                color = Color.White,
                                style = MaterialTheme.typography.labelSmall,
                                modifier = Modifier.padding(start = 4.dp),
                            )
                        }

                        if (isVideo) {
                            IconButton(onClick = { videoMuted = !videoMuted }) {
                                Icon(
                                    if (videoMuted) Icons.Filled.VolumeOff else Icons.Filled.VolumeUp,
                                    contentDescription = stringResource(
                                        if (videoMuted) R.string.story_unmute_cd else R.string.story_mute_cd,
                                    ),
                                    tint = Color.White,
                                )
                            }
                        }

                        IconButton(onClick = onClose) {
                            Icon(Icons.Filled.Close, contentDescription = stringResource(R.string.action_close), tint = Color.White)
                        }
                    }
                }

                // ── Bottom chrome: add-another-story (own stories) + like ──
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .align(Alignment.BottomEnd)
                        .navigationBarsPadding()
                        .padding(20.dp),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.Bottom,
                ) {
                    if (state.isOwnStories) {
                        IconButton(onClick = onAddStory) {
                            Icon(
                                imageVector = Icons.Filled.AddCircle,
                                contentDescription = stringResource(R.string.stories_add_story),
                                tint = Color.White,
                                modifier = Modifier.size(32.dp),
                            )
                        }
                    } else {
                        Spacer(modifier = Modifier.width(1.dp))
                    }

                    Column(horizontalAlignment = Alignment.CenterHorizontally) {
                        IconButton(onClick = { viewModel.toggleLike(story.id) }) {
                            Icon(
                                imageVector = if (story.liked) Icons.Filled.Favorite else Icons.Filled.FavoriteBorder,
                                contentDescription = stringResource(if (story.liked) R.string.story_unlike_cd else R.string.story_like_cd),
                                tint = if (story.liked) ZrpRed else Color.White,
                                modifier = Modifier.size(28.dp),
                            )
                        }
                        Text(text = story.likeCount.toString(), color = Color.White, style = MaterialTheme.typography.labelSmall)
                    }
                }
            }
        }
    }
}

@Composable
private fun HeartBurst(trigger: Int, modifier: Modifier = Modifier) {
    val scale = remember(trigger) { Animatable(0.4f) }
    val alpha = remember(trigger) { Animatable(1f) }

    LaunchedEffect(trigger) {
        scale.animateTo(1f, spring(dampingRatio = Spring.DampingRatioMediumBouncy, stiffness = Spring.StiffnessLow))
        delay(300)
        alpha.animateTo(0f, tween(200))
    }

    Icon(
        imageVector = Icons.Filled.Favorite,
        contentDescription = null,
        tint = Color.White,
        modifier = modifier
            .size(96.dp)
            .scale(scale.value)
            .alpha(alpha.value),
    )
}

// Real ExoPlayer-backed video playback for video stories - the honest
// gap this used to leave as a "not yet playable" label is now real
// media loading, same as images already had via Coil. Progress/
// duration are surfaced to the caller so the shared progress bar and
// auto-advance stay in sync with actual playback rather than a guess.
@OptIn(UnstableApi::class)
@Composable
private fun StoryVideoPlayer(
    url: String,
    paused: Boolean,
    muted: Boolean,
    onProgress: (positionMs: Long, durationMs: Long) -> Unit,
    onEnded: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val context = LocalContext.current
    val exoPlayer = remember(url) {
        ExoPlayer.Builder(context).build().apply {
            setMediaItem(MediaItem.fromUri(url))
            prepare()
            playWhenReady = true
        }
    }

    LaunchedEffect(muted) {
        exoPlayer.volume = if (muted) 0f else 1f
    }

    DisposableEffect(exoPlayer) {
        val listener = object : Player.Listener {
            override fun onPlaybackStateChanged(playbackState: Int) {
                if (playbackState == Player.STATE_ENDED) onEnded()
            }
        }
        exoPlayer.addListener(listener)
        onDispose {
            exoPlayer.removeListener(listener)
            exoPlayer.release()
        }
    }

    LaunchedEffect(paused) {
        exoPlayer.playWhenReady = !paused
    }

    LaunchedEffect(exoPlayer) {
        while (true) {
            val duration = exoPlayer.duration
            if (duration > 0) onProgress(exoPlayer.currentPosition, duration)
            delay(100)
        }
    }

    AndroidView(
        modifier = modifier,
        factory = {
            PlayerView(context).apply {
                player = exoPlayer
                useController = false
                resizeMode = AspectRatioFrameLayout.RESIZE_MODE_FIT
            }
        },
    )
}
