package one.zrp.social.mobile.ui.music

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.MusicNote
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import coil.compose.AsyncImage
import one.zrp.social.mobile.R
import one.zrp.social.mobile.network.MusicTrack
import one.zrp.social.mobile.ui.theme.Spacing

/**
 * The native Queue screen - matches the website's own /music/queue
 * page exactly in that there is no server-side queue at all (see
 * MusicPlayerViewModel's own KDoc): both read straight from the shared
 * player's in-memory current track + upcoming queue, reset on process
 * death exactly like the website's own queue resets on a page reload.
 */
@Composable
fun MusicQueueScreen(player: MusicPlayerViewModel, onBack: () -> Unit) {
    val state by player.state.collectAsState()

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
                text = stringResource(R.string.music_queue_title),
                style = MaterialTheme.typography.titleMedium,
                modifier = Modifier
                    .padding(start = 4.dp)
                    .weight(1f),
            )
            if (state.queue.isNotEmpty()) {
                TextButton(onClick = { player.clearQueue() }) {
                    Text(stringResource(R.string.music_queue_clear_queue))
                }
            }
        }
        HorizontalDivider()

        val currentTrack = state.currentTrack
        Box(modifier = Modifier.weight(1f).fillMaxWidth()) {
            if (currentTrack == null && state.queue.isEmpty()) {
                Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    Column(horizontalAlignment = Alignment.CenterHorizontally) {
                        Text(
                            text = stringResource(R.string.music_queue_empty_title),
                            style = MaterialTheme.typography.titleMedium,
                        )
                        Text(
                            text = stringResource(R.string.music_queue_empty_body),
                            style = MaterialTheme.typography.bodyMedium,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            modifier = Modifier.padding(top = Spacing.xs),
                        )
                    }
                }
            } else {
                LazyColumn(modifier = Modifier.fillMaxSize()) {
                    if (currentTrack != null) {
                        item {
                            Text(
                                text = stringResource(R.string.music_queue_now_playing),
                                style = MaterialTheme.typography.labelLarge,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                                modifier = Modifier.padding(horizontal = Spacing.lg, vertical = Spacing.sm),
                            )
                        }
                        item {
                            MiniPlayerBar(
                                track = currentTrack,
                                isPlaying = state.isPlaying,
                                isBuffering = state.isBuffering,
                                positionMs = state.positionMs,
                                durationMs = state.durationMs,
                                onTogglePlayPause = { player.togglePlayPause() },
                                onLikeClick = { /* Liking from the queue's own Now Playing row
                                                  isn't a real affordance on the website's queue
                                                  page either - only its persistent player bar
                                                  (not shown on native's own Queue screen) has a
                                                  like button there. */ },
                            )
                        }
                        item { HorizontalDivider() }
                    }

                    if (state.queue.isNotEmpty()) {
                        item {
                            Text(
                                text = stringResource(R.string.music_queue_up_next, state.queue.size),
                                style = MaterialTheme.typography.labelLarge,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                                modifier = Modifier.padding(horizontal = Spacing.lg, vertical = Spacing.sm),
                            )
                        }
                        items(state.queue, key = { it.id }) { track ->
                            QueueRow(
                                track = track,
                                onPlayNow = { player.playFromQueue(track) },
                                onRemove = { player.removeFromQueue(track) },
                            )
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun QueueRow(track: MusicTrack, onPlayNow: () -> Unit, onRemove: () -> Unit) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onPlayNow)
            .padding(horizontal = Spacing.lg, vertical = Spacing.sm),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(
            modifier = Modifier
                .size(44.dp)
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
                Icon(imageVector = Icons.Filled.MusicNote, contentDescription = track.title, modifier = Modifier.fillMaxSize())
            }
        }

        Column(modifier = Modifier.weight(1f).padding(start = Spacing.sm)) {
            Text(text = track.title, style = MaterialTheme.typography.bodyLarge, maxLines = 1, overflow = TextOverflow.Ellipsis)
            Text(
                text = track.artist.displayName,
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
        }

        IconButton(onClick = onPlayNow) {
            Icon(
                imageVector = Icons.Filled.PlayArrow,
                contentDescription = stringResource(R.string.music_queue_play_now_aria, track.title),
            )
        }
        IconButton(onClick = onRemove) {
            Icon(
                imageVector = Icons.Filled.Close,
                contentDescription = stringResource(R.string.music_queue_remove_aria, track.title),
            )
        }
    }
}
