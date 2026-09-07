package one.zrp.social.mobile.ui.music

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Favorite
import androidx.compose.material.icons.filled.FavoriteBorder
import androidx.compose.material.icons.filled.MusicNote
import androidx.compose.material.icons.filled.Pause
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material.icons.filled.QueueMusic
import androidx.compose.material.icons.filled.QueuePlayNext
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import coil.compose.AsyncImage
import one.zrp.social.mobile.R
import one.zrp.social.mobile.network.MusicTrack
import one.zrp.social.mobile.ui.theme.Spacing
import one.zrp.social.mobile.ui.theme.ZrpRed

/**
 * A single track row - the native equivalent of TrackList.tsx's own
 * per-row markup, reused by every screen that lists real tracks
 * (Artist/Album detail now, Discover/Playlist/Liked/History in later
 * phases) so "click plays it and queues the rest of this same list,
 * like/play-next/add-to-queue" behaves identically everywhere rather
 * than each screen reimplementing it. Deliberately omits TrackList.tsx's
 * own "Add to playlist" menu and owner-only remove button - both need
 * real backing features (Playlists, Music Studio) this phase doesn't
 * have yet.
 */
@Composable
fun TrackRow(
    track: MusicTrack,
    list: List<MusicTrack>,
    index: Int,
    player: MusicPlayerViewModel,
    onLike: (MusicTrack) -> Unit,
    modifier: Modifier = Modifier,
    showIndex: Boolean = true,
    showArtist: Boolean = true,
    showAlbum: Boolean = false,
    onArtistClick: ((String) -> Unit)? = null,
    onAlbumClick: ((String) -> Unit)? = null,
) {
    val playerState by player.state.collectAsState()
    val isCurrent = playerState.currentTrack?.id == track.id
    val isPlaying = isCurrent && playerState.isPlaying

    Row(
        modifier = modifier
            .fillMaxWidth()
            .clickable { player.playFromList(track, list) }
            .background(if (isCurrent) ZrpRed.copy(alpha = 0.06f) else Color.Transparent)
            .padding(horizontal = Spacing.lg, vertical = Spacing.sm),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        if (showIndex) {
            Text(
                text = (index + 1).toString().padStart(2, '0'),
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.width(24.dp),
            )
        }

        Box(
            modifier = Modifier
                .size(44.dp)
                .clip(RoundedCornerShape(6.dp)),
        ) {
            val cover = track.coverUrl ?: track.album?.coverUrl
            if (cover != null) {
                AsyncImage(
                    model = cover,
                    contentDescription = track.title,
                    contentScale = ContentScale.Crop,
                    modifier = Modifier.fillMaxSize(),
                )
            } else {
                Icon(imageVector = Icons.Filled.MusicNote, contentDescription = track.title, modifier = Modifier.fillMaxSize())
            }
            if (isCurrent) {
                Box(
                    modifier = Modifier
                        .fillMaxSize()
                        .background(Color.Black.copy(alpha = 0.35f)),
                    contentAlignment = Alignment.Center,
                ) {
                    Icon(
                        imageVector = if (isPlaying) Icons.Filled.Pause else Icons.Filled.PlayArrow,
                        contentDescription = null,
                        tint = Color.White,
                        modifier = Modifier.size(20.dp),
                    )
                }
            }
        }

        Column(
            modifier = Modifier
                .weight(1f)
                .padding(horizontal = Spacing.sm),
        ) {
            Text(
                text = track.title,
                style = MaterialTheme.typography.bodyLarge,
                color = if (isCurrent) ZrpRed else MaterialTheme.colorScheme.onSurface,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            Row {
                if (showArtist) {
                    Text(
                        text = track.artist.displayName,
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                        modifier = if (onArtistClick != null) {
                            Modifier.clickable { onArtistClick(track.artist.id) }
                        } else {
                            Modifier
                        },
                    )
                }
                if (showAlbum && track.album?.title != null) {
                    Text(
                        text = (if (showArtist) " • " else "") + track.album.title,
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                        modifier = if (onAlbumClick != null) {
                            Modifier.clickable { onAlbumClick(track.album.id) }
                        } else {
                            Modifier
                        },
                    )
                }
            }
        }

        Text(
            text = formatTrackDuration(track.durationSec),
            style = MaterialTheme.typography.labelSmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )

        IconButton(onClick = { onLike(track) }) {
            Icon(
                imageVector = if (track.liked) Icons.Filled.Favorite else Icons.Filled.FavoriteBorder,
                contentDescription = stringResource(if (track.liked) R.string.music_unlike else R.string.music_like),
                tint = if (track.liked) ZrpRed else MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
        IconButton(onClick = { player.playNext(track) }) {
            Icon(
                imageVector = Icons.Filled.QueuePlayNext,
                contentDescription = stringResource(R.string.music_common_play_next),
                tint = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
        IconButton(onClick = { player.addToQueue(track) }) {
            Icon(
                imageVector = Icons.Filled.QueueMusic,
                contentDescription = stringResource(R.string.music_common_add_to_queue),
                tint = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
}

@Composable
fun TrackListEmptyState(title: String, body: String? = null, modifier: Modifier = Modifier) {
    Box(
        modifier = modifier
            .fillMaxWidth()
            .padding(Spacing.lg),
        contentAlignment = Alignment.Center,
    ) {
        if (body != null) {
            Column(horizontalAlignment = Alignment.CenterHorizontally) {
                Text(text = title, color = MaterialTheme.colorScheme.onSurface, fontWeight = FontWeight.Bold)
                Text(
                    text = body,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    style = MaterialTheme.typography.bodySmall,
                    modifier = Modifier.padding(top = Spacing.xs),
                )
            }
        } else {
            Text(text = title, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
}

@Composable
fun PlayAllShuffleRow(
    enabled: Boolean,
    onPlayAll: () -> Unit,
    onShuffle: () -> Unit,
    modifier: Modifier = Modifier,
    // Artist/Album detail's own real buttons say "Play all"
    // (music.common.playAll); the playlist detail page's own real
    // button says just "Play" (music.common.play) for the identical
    // play-the-whole-list action - a genuine inconsistency in the real
    // product, matched here rather than made falsely consistent.
    playLabelRes: Int = R.string.music_common_play_all,
) {
    Row(modifier = modifier) {
        Button(
            onClick = onPlayAll,
            enabled = enabled,
            colors = ButtonDefaults.buttonColors(containerColor = ZrpRed),
        ) {
            Icon(Icons.Filled.PlayArrow, contentDescription = null, modifier = Modifier.size(18.dp))
            Text(stringResource(playLabelRes), modifier = Modifier.padding(start = Spacing.xs))
        }
        Spacer(modifier = Modifier.width(Spacing.sm))
        OutlinedButton(onClick = onShuffle, enabled = enabled) {
            Text(stringResource(R.string.music_common_shuffle))
        }
    }
}
