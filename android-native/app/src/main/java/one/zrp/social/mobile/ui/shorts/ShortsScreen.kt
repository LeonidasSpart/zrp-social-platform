package one.zrp.social.mobile.ui.shorts

import android.content.Intent
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.pager.VerticalPager
import androidx.compose.foundation.pager.rememberPagerState
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.ChatBubbleOutline
import androidx.compose.material.icons.filled.Favorite
import androidx.compose.material.icons.filled.FavoriteBorder
import androidx.compose.material.icons.filled.Repeat
import androidx.compose.material.icons.filled.Share
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
import androidx.compose.runtime.remember
import androidx.compose.runtime.snapshotFlow
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.media3.common.MediaItem
import androidx.media3.common.Player
import androidx.media3.common.util.UnstableApi
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.ui.AspectRatioFrameLayout
import androidx.media3.ui.PlayerView
import one.zrp.social.mobile.R
import one.zrp.social.mobile.data.PostsRepository
import one.zrp.social.mobile.network.Post
import one.zrp.social.mobile.ui.components.Avatar
import one.zrp.social.mobile.ui.components.VerifiedBadge
import one.zrp.social.mobile.ui.theme.ZrpRed
import one.zrp.social.mobile.util.formatCount

/**
 * ZRP Shorts - ported from shorts/page.tsx: a full-screen vertical
 * video feed against the same real GET /api/videos (filtered video
 * posts, same Post shape and cursor pagination as every other feed)
 * and like/repost/comment interaction model PostCard already uses
 * elsewhere. "Post a Short" (upload) is a later phase, the same
 * staged-deferral every other feature epic in this app used for its
 * own phase 1.
 */
@Composable
fun ShortsScreen(onBack: () -> Unit, onOpenComments: (String) -> Unit, onAuthorClick: (String) -> Unit) {
    val viewModel: ShortsViewModel = viewModel(
        factory = remember { ShortsViewModelFactory(PostsRepository()) },
    )
    val state by viewModel.state.collectAsState()
    val pagerState = rememberPagerState(pageCount = { state.posts.size })

    LaunchedEffect(pagerState) {
        snapshotFlow { pagerState.currentPage }.collect { page -> viewModel.setCurrentIndex(page) }
    }

    Box(modifier = Modifier.fillMaxSize().background(Color.Black)) {
        if (state.isLoading) {
            Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                CircularProgressIndicator(color = Color.White)
            }
        } else if (state.posts.isEmpty()) {
            Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                Text(text = stringResource(R.string.shorts_no_shorts_yet), color = Color.White, modifier = Modifier.padding(32.dp))
            }
        } else {
            VerticalPager(state = pagerState, modifier = Modifier.fillMaxSize()) { page ->
                val post = state.posts[page]
                ShortItem(
                    post = post,
                    isActive = page == pagerState.currentPage,
                    muted = state.muted,
                    onToggleMuted = viewModel::toggleMuted,
                    onLike = { viewModel.toggleLike(post.id) },
                    onRepost = { viewModel.toggleRepost(post.id) },
                    onComment = { onOpenComments(post.id) },
                    onAuthorClick = { onAuthorClick(post.author.username) },
                )
            }
        }

        IconButton(
            onClick = onBack,
            modifier = Modifier
                .align(Alignment.TopStart)
                .statusBarsPadding()
                .padding(8.dp),
        ) {
            Icon(Icons.Filled.ArrowBack, contentDescription = stringResource(R.string.shorts_back), tint = Color.White)
        }
    }
}

@OptIn(UnstableApi::class)
@Composable
private fun ShortItem(
    post: Post,
    isActive: Boolean,
    muted: Boolean,
    onToggleMuted: () -> Unit,
    onLike: () -> Unit,
    onRepost: () -> Unit,
    onComment: () -> Unit,
    onAuthorClick: () -> Unit,
) {
    val context = LocalContext.current
    val videoUrl = post.imageUrl
    Box(modifier = Modifier.fillMaxSize()) {
        if (videoUrl != null) {
            ShortVideoPlayer(
                url = videoUrl,
                playing = isActive,
                muted = muted,
                onToggleMuted = onToggleMuted,
                modifier = Modifier.fillMaxSize(),
            )
        }

        val shareLabel = stringResource(R.string.shorts_share)
        val shareTitle = stringResource(R.string.shorts_share_post_by, post.author.name ?: post.author.username)
        Column(
            modifier = Modifier
                .align(Alignment.CenterEnd)
                .padding(end = 12.dp, bottom = 90.dp)
                .navigationBarsPadding(),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(20.dp),
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
                tint = if (post.reposted == true) Color(0xFF22C55E) else Color.White,
                count = post._count.reposts,
                contentDescription = stringResource(R.string.shorts_repost),
                onClick = onRepost,
            )
            IconButton(
                onClick = {
                    val sendIntent = Intent(Intent.ACTION_SEND).apply {
                        type = "text/plain"
                        putExtra(Intent.EXTRA_TEXT, "https://zrp.one/post/${post.id}")
                    }
                    context.startActivity(Intent.createChooser(sendIntent, shareTitle))
                },
            ) {
                Icon(Icons.Filled.Share, contentDescription = shareLabel, tint = Color.White, modifier = Modifier.size(28.dp))
            }
            IconButton(onClick = onToggleMuted) {
                Icon(
                    if (muted) Icons.Filled.VolumeOff else Icons.Filled.VolumeUp,
                    contentDescription = stringResource(if (muted) R.string.shorts_unmute else R.string.shorts_mute),
                    tint = Color.White,
                    modifier = Modifier.size(28.dp),
                )
            }
        }

        Row(
            modifier = Modifier
                .align(Alignment.BottomStart)
                .fillMaxWidth(0.75f)
                .padding(start = 16.dp, end = 12.dp, bottom = 24.dp)
                .navigationBarsPadding()
                .clickable(onClick = onAuthorClick),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Avatar(url = post.author.avatarUrl, name = post.author.username, size = 40.dp)
            Column(modifier = Modifier.padding(start = 10.dp)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(
                        text = "@${post.author.username}",
                        color = Color.White,
                        fontWeight = FontWeight.Bold,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                    VerifiedBadge(badgeType = post.author.badgeType, modifier = Modifier.padding(start = 4.dp))
                }
                if (post.content.isNotBlank()) {
                    Text(
                        text = post.content,
                        color = Color.White,
                        maxLines = 2,
                        overflow = TextOverflow.Ellipsis,
                        modifier = Modifier.padding(top = 2.dp),
                    )
                }
            }
        }
    }
}

@Composable
private fun ShortActionButton(icon: ImageVector, tint: Color, count: Int, contentDescription: String, onClick: () -> Unit) {
    Column(horizontalAlignment = Alignment.CenterHorizontally) {
        IconButton(onClick = onClick) {
            Icon(icon, contentDescription = contentDescription, tint = tint, modifier = Modifier.size(32.dp))
        }
        Text(text = formatCount(count), color = Color.White, style = MaterialTheme.typography.labelSmall, fontWeight = FontWeight.Bold)
    }
}

/** Looping, fill-screen ExoPlayer for one Short - same player-lifecycle shape as StoryViewerScreen's own StoryVideoPlayer. */
@OptIn(UnstableApi::class)
@Composable
private fun ShortVideoPlayer(url: String, playing: Boolean, muted: Boolean, onToggleMuted: () -> Unit, modifier: Modifier = Modifier) {
    val context = LocalContext.current
    val exoPlayer = remember(url) {
        ExoPlayer.Builder(context).build().apply {
            setMediaItem(MediaItem.fromUri(url))
            repeatMode = Player.REPEAT_MODE_ONE
            prepare()
        }
    }

    DisposableEffect(exoPlayer) {
        onDispose { exoPlayer.release() }
    }

    LaunchedEffect(playing) {
        exoPlayer.playWhenReady = playing
    }

    LaunchedEffect(muted) {
        exoPlayer.volume = if (muted) 0f else 1f
    }

    Box(modifier = modifier.clickable(onClick = onToggleMuted)) {
        AndroidView(
            modifier = Modifier.fillMaxSize(),
            factory = {
                PlayerView(context).apply {
                    player = exoPlayer
                    useController = false
                    resizeMode = AspectRatioFrameLayout.RESIZE_MODE_ZOOM
                }
            },
        )
    }
}
