package one.zrp.social.mobile.ui.shorts

import android.content.Intent
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.scaleIn
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.sizeIn
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.pager.VerticalPager
import androidx.compose.foundation.pager.rememberPagerState
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.ChatBubbleOutline
import androidx.compose.material.icons.filled.Favorite
import androidx.compose.material.icons.filled.FavoriteBorder
import androidx.compose.material.icons.filled.Repeat
import androidx.compose.material.icons.filled.Share
import androidx.compose.material.icons.filled.VolumeOff
import androidx.compose.material.icons.filled.VolumeUp
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
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
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.runtime.snapshotFlow
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import one.zrp.social.mobile.ui.theme.IconSize
import one.zrp.social.mobile.ui.theme.Spacing
import one.zrp.social.mobile.ui.theme.TouchTarget
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.media3.common.MediaItem
import androidx.media3.common.PlaybackException
import androidx.media3.common.Player
import androidx.media3.common.util.UnstableApi
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.ui.AspectRatioFrameLayout
import androidx.media3.ui.PlayerView
import kotlinx.coroutines.delay
import one.zrp.social.mobile.R
import one.zrp.social.mobile.data.PostsRepository
import one.zrp.social.mobile.network.Post
import one.zrp.social.mobile.ui.components.Avatar
import one.zrp.social.mobile.ui.components.VerifiedBadge
import one.zrp.social.mobile.ui.theme.ZrpGreen
import one.zrp.social.mobile.ui.theme.ZrpRed
import one.zrp.social.mobile.util.formatCount

/**
 * ZRP Shorts - ported from shorts/page.tsx: a full-screen vertical
 * video feed against the same real GET /api/videos (filtered video
 * posts, same Post shape and cursor pagination as every other feed)
 * and like/repost/comment interaction model PostCard already uses
 * elsewhere, plus "Post a Short" (ShortsUploadDialog) - the same real
 * upload-then-POST-/api/posts flow ShortUploadModal.tsx drives.
 */
@Composable
fun ShortsScreen(
    onBack: () -> Unit,
    onOpenComments: (String) -> Unit,
    onAuthorClick: (String) -> Unit,
    startPostId: String? = null,
) {
    val viewModel: ShortsViewModel = viewModel(
        factory = remember(startPostId) { ShortsViewModelFactory(PostsRepository(), startPostId) },
    )
    val state by viewModel.state.collectAsState()
    val pagerState = rememberPagerState(pageCount = { state.posts.size })
    var showUpload by remember { mutableStateOf(false) }

    LaunchedEffect(pagerState) {
        snapshotFlow { pagerState.currentPage }.collect { page -> viewModel.setCurrentIndex(page) }
    }

    // Matches handleUploaded's own requestAnimationFrame(() =>
    // containerRef.current?.scrollTo({ top: 0 })): jump the pager back
    // to the just-uploaded Short at the top of the feed.
    LaunchedEffect(state.uploadedPostId) {
        if (state.uploadedPostId != null) {
            pagerState.scrollToPage(0)
            viewModel.consumeUploadedPost()
        }
    }

    Box(modifier = Modifier.fillMaxSize().background(Color.Black)) {
        if (state.isLoading) {
            Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                CircularProgressIndicator(color = Color.White)
            }
        } else if (state.posts.isEmpty()) {
            Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    Text(text = stringResource(R.string.shorts_no_shorts_yet), color = Color.White, modifier = Modifier.padding(32.dp))
                    Button(
                        onClick = { showUpload = true },
                        colors = ButtonDefaults.buttonColors(containerColor = ZrpRed),
                    ) {
                        Icon(Icons.Filled.Add, contentDescription = null, modifier = Modifier.size(18.dp))
                        Text(text = stringResource(R.string.shorts_post_a_short), modifier = Modifier.padding(start = 6.dp))
                    }
                }
            }
        } else {
            VerticalPager(state = pagerState, modifier = Modifier.fillMaxSize()) { page ->
                val post = state.posts[page]
                ShortItem(
                    post = post,
                    isActive = page == pagerState.currentPage,
                    muted = state.muted,
                    onLike = { viewModel.toggleLike(post.id) },
                    onRepost = { viewModel.toggleRepost(post.id) },
                    onComment = { onOpenComments(post.id) },
                    onAuthorClick = { onAuthorClick(post.author.username) },
                    onPlaybackError = { viewModel.removeBrokenPost(post.id) },
                )
            }
        }

        // No statusBarsPadding() here: this screen is hosted inside
        // ZrpNavHost's Scaffold, whose NavHost already applies
        // Modifier.padding(innerPadding), and with no topBar that
        // innerPadding.top *is* the status-bar inset. Adding it again
        // pushed this row down by two status bars.
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .align(Alignment.TopCenter)
                .padding(horizontal = Spacing.xs, vertical = Spacing.xs),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            IconButton(onClick = onBack) {
                Icon(Icons.Filled.ArrowBack, contentDescription = stringResource(R.string.shorts_back), tint = Color.White)
            }
            Text(
                text = stringResource(R.string.shorts_title),
                color = Color.White,
                fontWeight = FontWeight.Bold,
                style = MaterialTheme.typography.titleMedium,
                modifier = Modifier.weight(1f),
                textAlign = TextAlign.Center,
            )
            // Always visible (not gated on posts being present), matching
            // shorts/page.tsx's own top-right Plus button.
            IconButton(onClick = { showUpload = true }) {
                Icon(Icons.Filled.Add, contentDescription = stringResource(R.string.shorts_post_a_short), tint = Color.White)
            }
            if (state.posts.isNotEmpty()) {
                IconButton(onClick = viewModel::toggleMuted) {
                    Icon(
                        if (state.muted) Icons.Filled.VolumeOff else Icons.Filled.VolumeUp,
                        contentDescription = stringResource(if (state.muted) R.string.shorts_unmute else R.string.shorts_mute),
                        tint = Color.White,
                    )
                }
            } else {
                Box(modifier = Modifier.size(TouchTarget.min))
            }
        }
    }

    if (showUpload) {
        ShortsUploadDialog(
            onDismiss = { showUpload = false },
            onPosted = { post ->
                viewModel.onShortUploaded(post)
                showUpload = false
            },
        )
    }
}

@OptIn(UnstableApi::class)
@Composable
private fun ShortItem(
    post: Post,
    isActive: Boolean,
    muted: Boolean,
    onLike: () -> Unit,
    onRepost: () -> Unit,
    onComment: () -> Unit,
    onAuthorClick: () -> Unit,
    onPlaybackError: () -> Unit,
) {
    val context = LocalContext.current
    val videoUrl = post.imageUrl
    // A tap pauses/resumes; matches shorts/page.tsx's own single-tap
    // handler on the <video> element itself.
    var manuallyPaused by remember(post.id) { mutableStateOf(false) }
    var showHeartBurst by remember(post.id) { mutableStateOf(false) }

    Box(modifier = Modifier.fillMaxSize()) {
        if (videoUrl != null) {
            ShortVideoPlayer(
                url = videoUrl,
                playing = isActive && !manuallyPaused,
                muted = muted,
                onTap = { manuallyPaused = !manuallyPaused },
                onDoubleTap = {
                    if (post.liked != true) onLike()
                    showHeartBurst = true
                },
                onPlaybackError = onPlaybackError,
                modifier = Modifier.fillMaxSize(),
            )
        }

        AnimatedVisibility(
            visible = showHeartBurst,
            enter = fadeIn() + scaleIn(initialScale = 0.6f),
            exit = fadeOut(),
            modifier = Modifier.align(Alignment.Center),
        ) {
            Icon(
                Icons.Filled.Favorite,
                contentDescription = null,
                tint = ZrpRed,
                modifier = Modifier.size(96.dp),
            )
        }
        LaunchedEffect(showHeartBurst) {
            if (showHeartBurst) {
                delay(700)
                showHeartBurst = false
            }
        }

        val shareLabel = stringResource(R.string.shorts_share)
        val shareTitle = stringResource(R.string.shorts_share_post_by, post.author.name ?: post.author.username)

        // ── Bottom overlay ────────────────────────────────────────────
        //
        // Caption and action rail are one bottom-anchored row so they
        // share a baseline and can never overlap. Previously the rail
        // was Alignment.CenterEnd with padding(bottom = 90.dp) while the
        // caption was Alignment.BottomStart with padding(bottom = 24.dp)
        // - two different anchors, so the rail floated near the middle
        // of the video (a bottom padding on a centre-anchored child
        // shifts it *upwards* from the centre, which is exactly the
        // "controls sit too high" real-device report), and on a narrow
        // screen a long caption ran underneath it.
        //
        // No navigationBarsPadding() either: the Scaffold in ZrpNavHost
        // already insets this content above both the bottom bar and the
        // system navigation bar via NavHost's padding(innerPadding), so
        // adding it here counted that inset a second time on top of the
        // hardcoded 90dp.
        Row(
            modifier = Modifier
                .align(Alignment.BottomCenter)
                .fillMaxWidth()
                .padding(start = Spacing.lg, end = Spacing.sm, bottom = Spacing.lg),
            verticalAlignment = Alignment.Bottom,
        ) {
            // Author (avatar/name) and the caption are deliberately two
            // separate clickable zones, not one shared Row - they used
            // to be a single clickable(onAuthorClick) Row, so tapping the
            // caption text itself (trying to read or expand it)
            // navigated to the author's profile instead. Only the avatar/
            // name row still does that; the caption's own tap target is
            // ExpandableCaption's "View more"/"View less" toggle below.
            Column(modifier = Modifier.weight(1f)) {
                Row(
                    modifier = Modifier.clickable(onClick = onAuthorClick),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Avatar(url = post.author.avatarUrl, name = post.author.username, size = 40.dp)
                    Text(
                        text = "@${post.author.username}",
                        color = Color.White,
                        fontWeight = FontWeight.Bold,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                        modifier = Modifier
                            .padding(start = Spacing.md)
                            .weight(1f, fill = false),
                    )
                    VerifiedBadge(
                        badgeType = post.author.badgeType,
                    )
                }
                if (post.content.isNotBlank()) {
                    ExpandableCaption(
                        text = post.content,
                        // Lines up under the username, not the avatar -
                        // same indent the caption already had as a child
                        // of the avatar-width Column before this fix.
                        modifier = Modifier.padding(start = 40.dp + Spacing.md, top = Spacing.xs),
                    )
                }
            }

            Spacer(modifier = Modifier.width(Spacing.sm))

            Column(
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.spacedBy(Spacing.sm),
            ) {
                ShortActionButton(
                    icon = if (post.liked == true) Icons.Filled.Favorite else Icons.Filled.FavoriteBorder,
                    tint = if (post.liked == true) ZrpRed else Color.White,
                    count = post._count.likes,
                    contentDescription = stringResource(R.string.shorts_like),
                    onClick = onLike,
                )
                ShortActionButton(
                    icon = Icons.Filled.ChatBubbleOutline,
                    tint = Color.White,
                    count = post._count.comments,
                    contentDescription = stringResource(R.string.shorts_comment),
                    onClick = onComment,
                )
                ShortActionButton(
                    icon = Icons.Filled.Repeat,
                    tint = if (post.reposted == true) ZrpGreen else Color.White,
                    count = post._count.reposts,
                    contentDescription = stringResource(R.string.shorts_repost),
                    onClick = onRepost,
                )
                // Share carries no count - the backend has no share
                // metric, and inventing one would be fake data. It uses
                // the same control so the rail's rhythm and glyph size
                // stay identical rather than a smaller odd-one-out.
                ShortActionButton(
                    icon = Icons.Filled.Share,
                    tint = Color.White,
                    count = null,
                    contentDescription = shareLabel,
                    onClick = {
                        val sendIntent = Intent(Intent.ACTION_SEND).apply {
                            type = "text/plain"
                            putExtra(Intent.EXTRA_TEXT, "https://zrp.one/post/${post.id}")
                        }
                        context.startActivity(Intent.createChooser(sendIntent, shareTitle))
                    },
                )
            }
        }
    }
}

/**
 * A Shorts caption: short text renders in full; text that overflows a
 * bounded preview gets a "View more" toggle that expands it in place -
 * no navigation, no dialog, nothing that leaves this screen. Overflow
 * is real Compose measurement (TextLayoutResult.hasVisualOverflow), not
 * a guessed character count, so it stays correct across font scaling,
 * translated text (which can run longer/shorter than English), RTL
 * layouts, and captions containing URLs/hashtags/mentions - all of
 * which are just plain text runs here, same as the website's own
 * unlinkified caption rendering elsewhere in this app.
 */
@Composable
private fun ExpandableCaption(text: String, modifier: Modifier = Modifier) {
    var expanded by remember(text) { mutableStateOf(false) }
    var isOverflowing by remember(text) { mutableStateOf(false) }
    val collapsedMaxLines = 2

    Column(modifier = modifier) {
        Text(
            text = text,
            color = Color.White,
            style = MaterialTheme.typography.bodyMedium,
            maxLines = if (expanded) Int.MAX_VALUE else collapsedMaxLines,
            overflow = TextOverflow.Ellipsis,
            onTextLayout = { result ->
                if (!expanded) {
                    isOverflowing = result.hasVisualOverflow
                }
            },
        )
        if (isOverflowing || expanded) {
            Text(
                text = stringResource(
                    if (expanded) R.string.caption_view_less else R.string.caption_view_more,
                ),
                color = Color.White,
                style = MaterialTheme.typography.bodyMedium,
                fontWeight = FontWeight.Bold,
                modifier = Modifier
                    .padding(top = 2.dp)
                    .clickable { expanded = !expanded },
            )
        }
    }
}

/**
 * One rail control: glyph plus its real count.
 *
 * The icon and its label are a single clickable target rather than an
 * IconButton with a caption floating underneath it - on a short-video
 * rail the number is part of the affordance, and tapping it should do
 * what tapping the icon does. Sized to at least the 48dp accessible
 * minimum in both directions.
 */
@Composable
private fun ShortActionButton(
    icon: ImageVector,
    tint: Color,
    count: Int?,
    contentDescription: String,
    onClick: () -> Unit,
) {
    Column(
        modifier = Modifier
            .sizeIn(minWidth = TouchTarget.min, minHeight = TouchTarget.min)
            .clickable(
                onClick = onClick,
                role = Role.Button,
                onClickLabel = contentDescription,
            )
            .padding(vertical = Spacing.xs),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        Icon(
            icon,
            contentDescription = contentDescription,
            tint = tint,
            modifier = Modifier.size(IconSize.lg),
        )
        if (count != null) {
            Text(
                text = formatCount(count),
                color = Color.White,
                style = MaterialTheme.typography.labelSmall,
                fontWeight = FontWeight.Bold,
                modifier = Modifier.padding(top = Spacing.xs),
            )
        }
    }
}

/**
 * Looping ExoPlayer for one Short - same player-lifecycle shape as
 * StoryViewerScreen's own StoryVideoPlayer. Uses FIT (letterboxed),
 * matching shorts/page.tsx's own `object-contain` video element
 * exactly, not a cropping fill.
 */
@OptIn(UnstableApi::class)
@Composable
private fun ShortVideoPlayer(
    url: String,
    playing: Boolean,
    muted: Boolean,
    onTap: () -> Unit,
    onDoubleTap: () -> Unit,
    onPlaybackError: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val context = LocalContext.current
    val exoPlayer = remember(url) {
        ExoPlayer.Builder(context).build().apply {
            setMediaItem(MediaItem.fromUri(url))
            repeatMode = Player.REPEAT_MODE_ONE
            prepare()
        }
    }

    DisposableEffect(exoPlayer) {
        val listener = object : Player.Listener {
            override fun onPlayerError(error: PlaybackException) {
                onPlaybackError()
            }
        }
        exoPlayer.addListener(listener)
        onDispose {
            exoPlayer.removeListener(listener)
            exoPlayer.release()
        }
    }

    LaunchedEffect(playing) {
        exoPlayer.playWhenReady = playing
    }

    LaunchedEffect(muted) {
        exoPlayer.volume = if (muted) 0f else 1f
    }

    Box(
        modifier = modifier.pointerInput(Unit) {
            detectTapGestures(onTap = { onTap() }, onDoubleTap = { onDoubleTap() })
        },
    ) {
        AndroidView(
            modifier = Modifier.fillMaxSize(),
            factory = {
                PlayerView(context).apply {
                    player = exoPlayer
                    useController = false
                    resizeMode = AspectRatioFrameLayout.RESIZE_MODE_FIT
                }
            },
        )
    }
}
