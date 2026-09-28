package one.zrp.social.mobile.ui.discover

import android.content.Intent
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.sizeIn
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.pager.VerticalPager
import androidx.compose.foundation.pager.rememberPagerState
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Bookmark
import androidx.compose.material.icons.filled.BookmarkBorder
import androidx.compose.material.icons.filled.ChatBubbleOutline
import androidx.compose.material.icons.filled.Favorite
import androidx.compose.material.icons.filled.FavoriteBorder
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material.icons.filled.MoreVert
import androidx.compose.material.icons.filled.Repeat
import androidx.compose.material.icons.filled.Share
import androidx.compose.material.icons.filled.VolumeOff
import androidx.compose.material.icons.filled.VolumeUp
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
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
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.media3.common.MediaItem
import androidx.media3.common.PlaybackException
import androidx.media3.common.Player
import androidx.media3.common.util.UnstableApi
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.ui.AspectRatioFrameLayout
import androidx.media3.ui.PlayerView
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import one.zrp.social.mobile.R
import one.zrp.social.mobile.data.DiscoverRepository
import one.zrp.social.mobile.network.DiscoverItem
import one.zrp.social.mobile.ui.components.Avatar
import one.zrp.social.mobile.ui.components.ReportDialog
import one.zrp.social.mobile.ui.components.VerifiedBadge
import one.zrp.social.mobile.ui.theme.IconSize
import one.zrp.social.mobile.ui.theme.Spacing
import one.zrp.social.mobile.ui.theme.TouchTarget
import one.zrp.social.mobile.ui.theme.ZrpGreen
import one.zrp.social.mobile.ui.theme.ZrpRed
import one.zrp.social.mobile.util.formatCount
import one.zrp.social.mobile.util.localizedError

/**
 * ZRP Discover - ported from src/app/discover/page.tsx: a full-screen,
 * server-ranked vertical video feed, distinct from the Search screen's
 * own "Discover" pre-search suggestions (a different backend and a
 * different concept sharing only the name). Comments open the app's
 * existing standalone comments screen ([onOpenComments]) rather than an
 * in-place sheet - this app has never had an overlay comments sheet
 * (every other feed already routes to that same screen the same way),
 * so reusing it here keeps one real comments surface instead of a
 * second, narrower one.
 */
@OptIn(UnstableApi::class)
@Composable
fun DiscoverFeedScreen(
    onBack: () -> Unit,
    onOpenComments: (String) -> Unit,
    onAuthorClick: (String) -> Unit,
) {
    val viewModel: DiscoverViewModel = viewModel(
        factory = remember { DiscoverViewModelFactory(DiscoverRepository()) },
    )
    val state by viewModel.state.collectAsState()
    val pagerState = rememberPagerState(pageCount = { state.items.size })

    LaunchedEffect(pagerState) {
        snapshotFlow { pagerState.currentPage }.collect { page -> viewModel.setCurrentIndex(page) }
    }

    var reportingPostId by remember { mutableStateOf<String?>(null) }
    var explainingReason by remember { mutableStateOf<String?>(null) }

    val toast = state.toast
    LaunchedEffect(toast) {
        if (toast != null) {
            delay(3500)
            viewModel.dismissToast()
        }
    }

    Box(modifier = Modifier.fillMaxSize().background(Color.Black)) {
        when {
            state.isLoading -> {
                Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    CircularProgressIndicator(color = Color.White)
                }
            }
            state.items.isEmpty() -> {
                Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    Text(
                        text = localizedError(state.error) ?: stringResource(R.string.discover_end_of_feed),
                        color = Color.White,
                        modifier = Modifier.padding(32.dp),
                    )
                }
            }
            else -> {
                VerticalPager(state = pagerState, modifier = Modifier.fillMaxSize()) { page ->
                    val item = state.items[page]
                    DiscoverItemView(
                        item = item,
                        isActive = page == pagerState.currentPage,
                        muted = state.muted,
                        isOwnItem = state.ownUserId != null && state.ownUserId == item.author.id,
                        onLike = { viewModel.toggleLike(item.id) },
                        onRepost = { viewModel.toggleRepost(item.id) },
                        onSave = { viewModel.toggleSave(item.id) },
                        onFollow = { viewModel.toggleFollow(item.author.id, item.author.username) },
                        onComment = { onOpenComments(item.id) },
                        onAuthorClick = { onAuthorClick(item.author.username) },
                        onPlaybackStarted = { viewModel.onPlaybackStarted(item.id) },
                        onPlaybackProgress = { positionMs, durationMs -> viewModel.onPlaybackProgress(item.id, positionMs, durationMs) },
                        onPlaybackError = { viewModel.removeBrokenPost(item.id) },
                        onReport = { reportingPostId = item.id },
                        onNotInterested = { viewModel.markNotInterested(item.id) },
                        onMute = { viewModel.muteCreator(item.author.id) },
                        onBlock = { viewModel.blockCreator(item.author.id, item.author.username) },
                        onExplainReason = { explainingReason = item.reason },
                    )
                }
            }
        }

        Row(
            modifier = Modifier
                .fillMaxWidth()
                .align(Alignment.TopCenter)
                .padding(horizontal = Spacing.xs, vertical = Spacing.xs),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            IconButton(onClick = onBack) {
                Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = stringResource(R.string.shorts_back), tint = Color.White)
            }
            Text(
                text = stringResource(R.string.nav_discover),
                color = Color.White,
                fontWeight = FontWeight.Bold,
                style = MaterialTheme.typography.titleMedium,
                modifier = Modifier.weight(1f),
                textAlign = TextAlign.Center,
            )
            if (state.items.isNotEmpty()) {
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

        if (toast != null) {
            Text(
                text = discoverToastMessage(toast),
                color = Color.White,
                style = MaterialTheme.typography.bodyMedium,
                modifier = Modifier
                    .align(Alignment.BottomCenter)
                    .padding(bottom = 100.dp)
                    .background(Color.Black.copy(alpha = 0.75f), MaterialTheme.shapes.medium)
                    .padding(horizontal = Spacing.lg, vertical = Spacing.md),
            )
        }
    }

    val reportId = reportingPostId
    if (reportId != null) {
        // Closes immediately rather than waiting for the request (unlike
        // BookmarksScreen's own ReportDialog usage, which does wait) -
        // the result (submitted/failed) surfaces a moment later as the
        // same toast every other Discover action uses, so there's
        // nothing for a spinner to usefully wait on here.
        ReportDialog(
            isSubmitting = false,
            error = null,
            onDismiss = { reportingPostId = null },
            onSubmit = { reason, details ->
                viewModel.reportPost(reportId, reason, details)
                reportingPostId = null
            },
        )
    }

    val reason = explainingReason
    if (reason != null) {
        AlertDialog(
            onDismissRequest = { explainingReason = null },
            title = { Text(stringResource(R.string.discover_why_am_i_seeing)) },
            text = {
                Text(
                    if (reason == "popular") stringResource(R.string.discover_reason_popular) else stringResource(R.string.discover_reason_recent),
                )
            },
            confirmButton = {
                TextButton(onClick = { explainingReason = null }) {
                    Text(stringResource(R.string.discover_close_explanation))
                }
            },
        )
    }
}

@Composable
private fun discoverToastMessage(toast: DiscoverToast): String = when (toast) {
    DiscoverToast.NOT_INTERESTED_CONFIRMED -> stringResource(R.string.discover_not_interested_confirmed)
    DiscoverToast.NOT_INTERESTED_FAILED -> stringResource(R.string.discover_not_interested_failed)
    DiscoverToast.CREATOR_MUTED -> stringResource(R.string.discover_creator_muted)
    DiscoverToast.CREATOR_BLOCKED -> stringResource(R.string.discover_creator_blocked)
    DiscoverToast.REPORT_SUBMITTED -> stringResource(R.string.discover_report_submitted)
    DiscoverToast.REPORT_FAILED -> stringResource(R.string.discover_report_failed)
    DiscoverToast.ACTION_FAILED -> stringResource(R.string.discover_action_failed)
}

@Composable
private fun DiscoverItemView(
    item: DiscoverItem,
    isActive: Boolean,
    muted: Boolean,
    isOwnItem: Boolean,
    onLike: () -> Unit,
    onRepost: () -> Unit,
    onSave: () -> Unit,
    onFollow: () -> Unit,
    onComment: () -> Unit,
    onAuthorClick: () -> Unit,
    onPlaybackStarted: () -> Unit,
    onPlaybackProgress: (Long, Long) -> Unit,
    onPlaybackError: () -> Unit,
    onReport: () -> Unit,
    onNotInterested: () -> Unit,
    onMute: () -> Unit,
    onBlock: () -> Unit,
    onExplainReason: () -> Unit,
) {
    val context = LocalContext.current
    var manuallyPaused by remember(item.id) { mutableStateOf(false) }
    var menuOpen by remember(item.id) { mutableStateOf(false) }
    val videoUrl = item.media.url
    val premiumPost = item.premiumPost

    Box(modifier = Modifier.fillMaxSize()) {
        if (videoUrl != null) {
            DiscoverVideoPlayer(
                url = videoUrl,
                playing = isActive && !manuallyPaused,
                muted = muted,
                onTap = { manuallyPaused = !manuallyPaused },
                onPlaying = onPlaybackStarted,
                onProgress = onPlaybackProgress,
                onPlaybackError = onPlaybackError,
                modifier = Modifier.fillMaxSize(),
            )
        } else if (premiumPost != null) {
            // A locked, unpurchased pay-per-view item - shown as a real
            // preview with no purchase button (this app has never built
            // a crypto/money purchase flow for any feature - see
            // DiscoverPremiumPost's own KDoc).
            Column(
                modifier = Modifier.fillMaxSize().padding(Spacing.xl),
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.Center,
            ) {
                Icon(Icons.Filled.Lock, contentDescription = stringResource(R.string.play_locked), tint = Color.White, modifier = Modifier.size(40.dp))
                Text(
                    text = premiumPost.previewContent,
                    color = Color.White,
                    style = MaterialTheme.typography.bodyLarge,
                    textAlign = TextAlign.Center,
                    modifier = Modifier.padding(top = Spacing.lg),
                )
            }
        }

        val shareLabel = stringResource(R.string.shorts_share)
        val shareTitle = stringResource(R.string.shorts_share_post_by, item.author.name ?: item.author.username)

        Row(
            modifier = Modifier
                .align(Alignment.BottomCenter)
                .fillMaxWidth()
                .padding(start = Spacing.lg, end = Spacing.sm, bottom = Spacing.lg),
            verticalAlignment = Alignment.Bottom,
        ) {
            Column(modifier = Modifier.weight(1f)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Row(
                        modifier = Modifier.clickable(onClick = onAuthorClick).weight(1f, fill = false),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Avatar(url = item.author.avatarUrl, name = item.author.username, size = 40.dp)
                        Text(
                            text = "@${item.author.username}",
                            color = Color.White,
                            fontWeight = FontWeight.Bold,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                            modifier = Modifier.padding(start = Spacing.md),
                        )
                        VerifiedBadge(badgeType = item.author.badgeType)
                    }
                    if (!isOwnItem) {
                        Spacer(modifier = Modifier.width(Spacing.sm))
                        OutlinedButton(onClick = onFollow, contentPadding = PaddingValues(horizontal = Spacing.md, vertical = 2.dp)) {
                            Text(
                                text = stringResource(if (item.viewerState.followsAuthor) R.string.action_following else R.string.action_follow),
                                color = Color.White,
                                style = MaterialTheme.typography.labelSmall,
                            )
                        }
                    }
                }
                if (item.caption.isNotBlank()) {
                    Text(
                        text = item.caption,
                        color = Color.White,
                        style = MaterialTheme.typography.bodyMedium,
                        maxLines = 3,
                        overflow = TextOverflow.Ellipsis,
                        modifier = Modifier.padding(start = 40.dp + Spacing.md, top = Spacing.xs),
                    )
                }
                Text(
                    text = if (item.reason == "popular") stringResource(R.string.discover_reason_popular) else stringResource(R.string.discover_reason_recent),
                    color = Color.White.copy(alpha = 0.7f),
                    style = MaterialTheme.typography.labelSmall,
                    modifier = Modifier
                        .padding(start = 40.dp + Spacing.md, top = Spacing.xs)
                        .clickable(onClick = onExplainReason),
                )
            }

            Spacer(modifier = Modifier.width(Spacing.sm))

            Column(
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.spacedBy(Spacing.sm),
            ) {
                DiscoverActionButton(
                    icon = if (item.viewerState.liked) Icons.Filled.Favorite else Icons.Filled.FavoriteBorder,
                    tint = if (item.viewerState.liked) ZrpRed else Color.White,
                    count = item.stats.likes,
                    contentDescription = stringResource(R.string.shorts_like),
                    onClick = onLike,
                )
                if (item.commentsEnabled) {
                    DiscoverActionButton(
                        icon = Icons.Filled.ChatBubbleOutline,
                        tint = Color.White,
                        count = item.stats.comments,
                        contentDescription = stringResource(R.string.discover_comments),
                        onClick = onComment,
                    )
                }
                DiscoverActionButton(
                    icon = Icons.Filled.Repeat,
                    tint = if (item.viewerState.reposted) ZrpGreen else Color.White,
                    count = item.stats.reposts,
                    contentDescription = stringResource(R.string.shorts_repost),
                    onClick = onRepost,
                )
                DiscoverActionButton(
                    icon = if (item.viewerState.saved) Icons.Filled.Bookmark else Icons.Filled.BookmarkBorder,
                    tint = if (item.viewerState.saved) ZrpRed else Color.White,
                    count = item.stats.saves,
                    contentDescription = stringResource(R.string.action_bookmark),
                    onClick = onSave,
                )
                DiscoverActionButton(
                    icon = Icons.Filled.Share,
                    tint = Color.White,
                    count = null,
                    contentDescription = shareLabel,
                    onClick = {
                        val sendIntent = Intent(Intent.ACTION_SEND).apply {
                            type = "text/plain"
                            putExtra(Intent.EXTRA_TEXT, "https://zrp.one/post/${item.id}")
                        }
                        context.startActivity(Intent.createChooser(sendIntent, shareTitle))
                    },
                )
                Box {
                    DiscoverActionButton(
                        icon = Icons.Filled.MoreVert,
                        tint = Color.White,
                        count = null,
                        contentDescription = stringResource(R.string.discover_more),
                        onClick = { menuOpen = true },
                    )
                    DropdownMenu(expanded = menuOpen, onDismissRequest = { menuOpen = false }) {
                        DropdownMenuItem(
                            text = { Text(stringResource(R.string.discover_not_interested)) },
                            onClick = { menuOpen = false; onNotInterested() },
                        )
                        if (!isOwnItem) {
                            DropdownMenuItem(
                                text = { Text(stringResource(R.string.report_modal_title)) },
                                onClick = { menuOpen = false; onReport() },
                            )
                            DropdownMenuItem(
                                text = { Text(stringResource(R.string.discover_mute_creator)) },
                                onClick = { menuOpen = false; onMute() },
                            )
                            DropdownMenuItem(
                                text = { Text(stringResource(R.string.discover_block_creator)) },
                                onClick = { menuOpen = false; onBlock() },
                            )
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun DiscoverActionButton(
    icon: ImageVector,
    tint: Color,
    count: Int?,
    contentDescription: String,
    onClick: () -> Unit,
) {
    Column(
        modifier = Modifier
            .sizeIn(minWidth = TouchTarget.min, minHeight = TouchTarget.min)
            .clickable(onClick = onClick, onClickLabel = contentDescription)
            .padding(vertical = Spacing.xs),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        Icon(icon, contentDescription = contentDescription, tint = tint, modifier = Modifier.size(IconSize.lg))
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
 * Same ExoPlayer shape as ShortsScreen's own ShortVideoPlayer, plus real
 * position reporting for Discover's own watch-event pipeline
 * (onPlaying/onProgress - see DiscoverViewModel.onPlaybackStarted/
 * onPlaybackProgress). Polled every 250ms while active rather than
 * relying on a fixed-interval player callback ExoPlayer doesn't expose
 * (unlike a browser's own `timeupdate`), matching how coarse web's own
 * interval-driven reporting already is.
 */
@OptIn(UnstableApi::class)
@Composable
private fun DiscoverVideoPlayer(
    url: String,
    playing: Boolean,
    muted: Boolean,
    onTap: () -> Unit,
    onPlaying: () -> Unit,
    onProgress: (Long, Long) -> Unit,
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

            override fun onIsPlayingChanged(isPlaying: Boolean) {
                if (isPlaying) onPlaying()
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
        while (isActive && playing) {
            val duration = exoPlayer.duration
            if (duration > 0) onProgress(exoPlayer.currentPosition, duration)
            delay(250)
        }
    }

    LaunchedEffect(muted) {
        exoPlayer.volume = if (muted) 0f else 1f
    }

    Box(
        modifier = modifier.pointerInput(Unit) {
            detectTapGestures(onTap = { onTap() })
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
