package one.zrp.social.mobile.ui.music

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.Favorite
import androidx.compose.material.icons.filled.FavoriteBorder
import androidx.compose.material.icons.filled.MusicNote
import androidx.compose.material.icons.filled.Pause
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material.icons.filled.VerifiedUser
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import coil.compose.AsyncImage
import one.zrp.social.mobile.R
import one.zrp.social.mobile.data.MusicRepository
import one.zrp.social.mobile.network.MusicTrack
import one.zrp.social.mobile.ui.theme.ZrpRed

/**
 * ZRP Music - real tracks, real playback, real likes. Reached from the
 * Search tab's Discover section rather than a bottom-nav tab, matching
 * how the website itself treats Music as one of several destinations
 * beyond the core social loop (see ZrpDestination's own KDoc).
 * Playback stops when this screen is left - see MusicViewModel's KDoc.
 */
@Composable
fun MusicScreen(onBack: () -> Unit) {
    val viewModel: MusicViewModel = viewModel(
        factory = remember { MusicViewModelFactory(MusicRepository()) },
    )
    val state by viewModel.state.collectAsState()

    Column(modifier = Modifier.fillMaxSize()) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 8.dp, vertical = 4.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            IconButton(onClick = onBack) {
                Icon(Icons.Filled.ArrowBack, contentDescription = "Back")
            }
            Text(
                text = stringResource(R.string.music_title),
                style = MaterialTheme.typography.titleMedium,
                modifier = Modifier.padding(start = 4.dp),
            )
        }
        HorizontalDivider()

        Box(
            modifier = Modifier
                .weight(1f)
                .fillMaxWidth(),
        ) {
            val hasAnyTracks = state.trending.isNotEmpty() ||
                state.newReleases.isNotEmpty() ||
                state.recentlyPlayed.isNotEmpty() ||
                state.likedPreview.isNotEmpty()

            when {
                state.isLoading -> {
                    Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                        CircularProgressIndicator()
                    }
                }
                !hasAnyTracks -> {
                    Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                        // "No tracks available yet." stays English-only on purpose -
                        // the website's own music.shell.emptyTitle/emptyBody point the
                        // user at Music Studio to upload the first track, a flow this
                        // app doesn't expose, so reusing that copy verbatim would be
                        // misleading here.
                        Text(
                            text = state.error ?: "No tracks available yet.",
                            color = if (state.error != null) {
                                MaterialTheme.colorScheme.error
                            } else {
                                MaterialTheme.colorScheme.onSurfaceVariant
                            },
                            modifier = Modifier.padding(24.dp),
                        )
                    }
                }
                else -> {
                    LazyColumn(modifier = Modifier.fillMaxSize()) {
                        if (state.trending.isNotEmpty()) {
                            item {
                                MusicSection(
                                    title = stringResource(R.string.music_trending),
                                    tracks = state.trending,
                                    currentTrackId = state.currentTrack?.id,
                                    onTrackClick = { viewModel.onTrackClick(it) },
                                )
                            }
                        }
                        if (state.recentlyPlayed.isNotEmpty()) {
                            item {
                                MusicSection(
                                    title = stringResource(R.string.music_recently_played),
                                    tracks = state.recentlyPlayed,
                                    currentTrackId = state.currentTrack?.id,
                                    onTrackClick = { viewModel.onTrackClick(it) },
                                )
                            }
                        }
                        if (state.newReleases.isNotEmpty()) {
                            item {
                                MusicSection(
                                    title = stringResource(R.string.music_new_releases),
                                    tracks = state.newReleases,
                                    currentTrackId = state.currentTrack?.id,
                                    onTrackClick = { viewModel.onTrackClick(it) },
                                )
                            }
                        }
                        if (state.likedPreview.isNotEmpty()) {
                            item {
                                MusicSection(
                                    title = stringResource(R.string.music_liked),
                                    tracks = state.likedPreview,
                                    currentTrackId = state.currentTrack?.id,
                                    onTrackClick = { viewModel.onTrackClick(it) },
                                )
                            }
                        }
                    }
                }
            }
        }

        val currentTrack = state.currentTrack
        if (currentTrack != null) {
            MiniPlayerBar(
                track = currentTrack,
                isPlaying = state.isPlaying,
                isBuffering = state.isBuffering,
                positionMs = state.positionMs,
                durationMs = state.durationMs,
                onTogglePlayPause = { viewModel.togglePlayPause() },
                onLikeClick = { viewModel.toggleLike(currentTrack) },
            )
        }
    }
}

@Composable
private fun MusicSection(
    title: String,
    tracks: List<MusicTrack>,
    currentTrackId: String?,
    onTrackClick: (MusicTrack) -> Unit,
) {
    Column {
        Text(
            text = title,
            style = MaterialTheme.typography.titleMedium,
            fontWeight = FontWeight.Bold,
            modifier = Modifier.padding(horizontal = 16.dp, vertical = 8.dp),
        )
        LazyRow(
            contentPadding = PaddingValues(horizontal = 16.dp),
            horizontalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            items(tracks, key = { it.id }) { track ->
                TrackCard(
                    track = track,
                    isCurrent = track.id == currentTrackId,
                    onClick = { onTrackClick(track) },
                )
            }
        }
    }
}

@Composable
private fun TrackCard(track: MusicTrack, isCurrent: Boolean, onClick: () -> Unit) {
    Column(
        modifier = Modifier
            .width(120.dp)
            .clickable(onClick = onClick),
    ) {
        Box(
            modifier = Modifier
                .size(120.dp)
                .clip(RoundedCornerShape(8.dp)),
        ) {
            if (track.coverUrl != null) {
                AsyncImage(
                    model = track.coverUrl,
                    contentDescription = track.title,
                    contentScale = ContentScale.Crop,
                    modifier = Modifier.fillMaxSize(),
                )
            } else {
                Icon(
                    imageVector = Icons.Filled.MusicNote,
                    contentDescription = track.title,
                    modifier = Modifier.fillMaxSize(),
                )
            }
        }

        Text(
            text = track.title,
            style = MaterialTheme.typography.bodyMedium,
            fontWeight = if (isCurrent) FontWeight.Bold else FontWeight.Normal,
            color = if (isCurrent) ZrpRed else Color.Unspecified,
            maxLines = 1,
            modifier = Modifier.padding(top = 6.dp),
        )
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text(
                text = track.artist.displayName,
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                maxLines = 1,
                modifier = Modifier.weight(1f, fill = false),
            )
            if (track.artist.verified) {
                Icon(
                    imageVector = Icons.Filled.VerifiedUser,
                    contentDescription = stringResource(R.string.music_verified_artist),
                    tint = ZrpRed,
                    modifier = Modifier
                        .padding(start = 3.dp)
                        .size(12.dp),
                )
            }
        }
    }
}

@Composable
private fun MiniPlayerBar(
    track: MusicTrack,
    isPlaying: Boolean,
    isBuffering: Boolean,
    positionMs: Long,
    durationMs: Long,
    onTogglePlayPause: () -> Unit,
    onLikeClick: () -> Unit,
) {
    Column(modifier = Modifier.fillMaxWidth()) {
        val progress = if (durationMs > 0) (positionMs.toFloat() / durationMs.toFloat()).coerceIn(0f, 1f) else 0f
        LinearProgressIndicator(
            progress = { progress },
            modifier = Modifier
                .fillMaxWidth()
                .height(2.dp),
            color = ZrpRed,
            trackColor = MaterialTheme.colorScheme.surfaceContainerHigh,
        )

        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(12.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Box(
                modifier = Modifier
                    .size(48.dp)
                    .clip(RoundedCornerShape(6.dp)),
            ) {
                if (track.coverUrl != null) {
                    AsyncImage(
                        model = track.coverUrl,
                        contentDescription = track.title,
                        contentScale = ContentScale.Crop,
                        modifier = Modifier.fillMaxSize(),
                    )
                } else {
                    Icon(
                        imageVector = Icons.Filled.MusicNote,
                        contentDescription = track.title,
                        modifier = Modifier.fillMaxSize(),
                    )
                }
            }

            Spacer(modifier = Modifier.width(12.dp))

            Column(modifier = Modifier.weight(1f)) {
                Text(text = track.title, style = MaterialTheme.typography.titleSmall, maxLines = 1)
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(
                        text = track.artist.displayName,
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        maxLines = 1,
                        modifier = Modifier.weight(1f, fill = false),
                    )
                    if (track.artist.verified) {
                        Icon(
                            imageVector = Icons.Filled.VerifiedUser,
                            contentDescription = stringResource(R.string.music_verified_artist),
                            tint = ZrpRed,
                            modifier = Modifier
                                .padding(start = 3.dp)
                                .size(11.dp),
                        )
                    }
                }
            }

            IconButton(onClick = onLikeClick) {
                Icon(
                    imageVector = if (track.liked) Icons.Filled.Favorite else Icons.Filled.FavoriteBorder,
                    contentDescription = stringResource(if (track.liked) R.string.music_unlike else R.string.music_like),
                    tint = if (track.liked) ZrpRed else MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }

            IconButton(onClick = onTogglePlayPause, enabled = !isBuffering) {
                if (isBuffering) {
                    CircularProgressIndicator(modifier = Modifier.size(20.dp), strokeWidth = 2.dp)
                } else {
                    Icon(
                        imageVector = if (isPlaying) Icons.Filled.Pause else Icons.Filled.PlayArrow,
                        contentDescription = stringResource(if (isPlaying) R.string.music_pause else R.string.music_play),
                        tint = ZrpRed,
                    )
                }
            }
        }
    }
}
