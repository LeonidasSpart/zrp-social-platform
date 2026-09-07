package one.zrp.social.mobile.ui.music

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
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.ArrowDropDown
import androidx.compose.material.icons.filled.ArrowDropUp
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material.icons.filled.ListAlt
import androidx.compose.material.icons.filled.MusicNote
import androidx.compose.material.icons.filled.QueueMusic
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.pluralStringResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import coil.compose.AsyncImage
import one.zrp.social.mobile.R
import one.zrp.social.mobile.data.MusicRepository
import one.zrp.social.mobile.network.MusicPlaylistTrackRow
import one.zrp.social.mobile.ui.theme.Spacing
import one.zrp.social.mobile.ui.theme.ZrpRed

/**
 * The same real GET /music/playlists/{id} src/app/music/playlists/
 * [id]/page.tsx renders: hero (cover from the first track, public/
 * private label, inline-editable name for the owner, real track-count
 * + duration, Play/Shuffle, owner-only Delete), then every track with
 * owner-only move-up/move-down/remove. Note the real page's own Play
 * button says "Play" here, not "Play all" like Artist/Album detail's
 * own buttons - matched as-is rather than made falsely consistent.
 */
@Composable
fun PlaylistDetailScreen(playlistId: String, player: MusicPlayerViewModel, onBack: () -> Unit) {
    val viewModel: PlaylistDetailViewModel = viewModel(
        factory = remember(playlistId) { PlaylistDetailViewModelFactory(MusicRepository(), playlistId) },
    )
    val state by viewModel.state.collectAsState()
    var showDeleteConfirm by remember { mutableStateOf(false) }

    LaunchedEffect(state.isDeleted) {
        if (state.isDeleted) onBack()
    }

    Column(modifier = Modifier.fillMaxSize()) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 8.dp, vertical = 4.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            IconButton(onClick = onBack) {
                Icon(Icons.Filled.ArrowBack, contentDescription = stringResource(R.string.music_playlist_detail_back_to_playlists))
            }
            Text(
                text = state.playlist?.name ?: "",
                style = MaterialTheme.typography.titleMedium,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.padding(start = 4.dp),
            )
        }

        when {
            state.isLoading -> {
                Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    CircularProgressIndicator()
                }
            }
            state.notFound || state.playlist == null -> {
                Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    Text(
                        text = stringResource(R.string.music_playlist_detail_not_found),
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }
            else -> {
                val playlist = state.playlist!!
                val cover = playlist.tracks.firstOrNull()?.track?.coverUrl ?: playlist.tracks.firstOrNull()?.track?.album?.coverUrl
                val playlistDurationSec = sumDurationSec(playlist.tracks.map { it.track })

                LazyColumn(modifier = Modifier.fillMaxSize()) {
                    item {
                        Column(modifier = Modifier.padding(Spacing.lg), horizontalAlignment = Alignment.CenterHorizontally) {
                            Box(
                                modifier = Modifier
                                    .size(160.dp)
                                    .clip(RoundedCornerShape(12.dp)),
                            ) {
                                if (cover != null) {
                                    AsyncImage(
                                        model = cover,
                                        contentDescription = playlist.name,
                                        contentScale = ContentScale.Crop,
                                        modifier = Modifier.fillMaxSize(),
                                    )
                                } else {
                                    Icon(imageVector = Icons.Filled.ListAlt, contentDescription = playlist.name, modifier = Modifier.fillMaxSize())
                                }
                            }

                            Text(
                                text = stringResource(
                                    if (playlist.isPublic) R.string.music_playlist_detail_public else R.string.music_playlist_detail_private,
                                ),
                                style = MaterialTheme.typography.labelMedium,
                                color = MaterialTheme.colorScheme.primary,
                                modifier = Modifier.padding(top = Spacing.md),
                            )

                            if (state.isEditingName) {
                                Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.padding(top = Spacing.xs)) {
                                    OutlinedTextField(
                                        value = state.nameDraft,
                                        onValueChange = viewModel::onNameDraftChange,
                                        singleLine = true,
                                        modifier = Modifier.weight(1f, fill = false),
                                    )
                                    IconButton(onClick = viewModel::saveName) {
                                        Icon(Icons.Filled.Check, contentDescription = stringResource(R.string.music_playlist_detail_save_aria), tint = ZrpRed)
                                    }
                                    IconButton(onClick = viewModel::onCancelEditingName) {
                                        Icon(Icons.Filled.Close, contentDescription = stringResource(R.string.music_playlists_cancel_aria))
                                    }
                                }
                            } else {
                                Row(verticalAlignment = Alignment.CenterVertically) {
                                    Text(text = playlist.name, style = MaterialTheme.typography.headlineSmall)
                                    if (playlist.isOwner) {
                                        IconButton(onClick = viewModel::onStartEditingName) {
                                            Icon(
                                                Icons.Filled.Edit,
                                                contentDescription = stringResource(R.string.music_playlist_detail_rename_aria),
                                                tint = MaterialTheme.colorScheme.onSurfaceVariant,
                                                modifier = Modifier.size(18.dp),
                                            )
                                        }
                                    }
                                }
                            }

                            val trackCountText = pluralStringResource(R.plurals.music_count_tracks, playlist.tracks.size, playlist.tracks.size)
                            val durationText = if (playlistDurationSec > 0) formatTotalDuration(playlistDurationSec) else null
                            Text(
                                text = listOfNotNull(trackCountText, durationText).joinToString(" • "),
                                style = MaterialTheme.typography.labelSmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                                modifier = Modifier.padding(top = Spacing.xs),
                            )

                            Row(modifier = Modifier.padding(top = Spacing.md)) {
                                PlayAllShuffleRow(
                                    enabled = playlist.tracks.isNotEmpty(),
                                    onPlayAll = { player.playAll(playlist.tracks.map { it.track }) },
                                    onShuffle = { player.shuffleAll(playlist.tracks.map { it.track }) },
                                    playLabelRes = R.string.music_play,
                                )
                                if (playlist.isOwner) {
                                    Spacer(modifier = Modifier.width(Spacing.sm))
                                    OutlinedButton(
                                        onClick = { showDeleteConfirm = true },
                                        colors = ButtonDefaults.outlinedButtonColors(contentColor = MaterialTheme.colorScheme.error),
                                    ) {
                                        Icon(Icons.Filled.Delete, contentDescription = null, modifier = Modifier.size(16.dp))
                                        Text(stringResource(R.string.music_playlist_detail_delete), modifier = Modifier.padding(start = 4.dp))
                                    }
                                }
                            }
                        }
                    }

                    if (playlist.tracks.isEmpty()) {
                        item {
                            Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = Modifier.fillMaxWidth().padding(Spacing.lg)) {
                                Text(
                                    text = stringResource(R.string.music_playlist_detail_empty_title),
                                    style = MaterialTheme.typography.titleMedium,
                                )
                                Text(
                                    text = stringResource(R.string.music_playlist_detail_empty_body),
                                    style = MaterialTheme.typography.bodyMedium,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                                    modifier = Modifier.padding(top = Spacing.xs),
                                )
                            }
                        }
                    } else {
                        itemsIndexed(playlist.tracks, key = { _, row -> row.id }) { index, row ->
                            PlaylistTrackRowView(
                                row = row,
                                isFirst = index == 0,
                                isLast = index == playlist.tracks.lastIndex,
                                isOwner = playlist.isOwner,
                                onPlay = { player.playFromList(row.track, playlist.tracks.map { it.track }) },
                                onAddToQueue = { player.addToQueue(row.track) },
                                onMoveUp = { viewModel.moveTrack(index, -1) },
                                onMoveDown = { viewModel.moveTrack(index, 1) },
                                onRemove = { viewModel.removeTrack(row.track.id) },
                            )
                        }
                    }
                }
            }
        }
    }

    if (showDeleteConfirm) {
        val playlistName = state.playlist?.name ?: ""
        AlertDialog(
            onDismissRequest = { showDeleteConfirm = false },
            title = { Text(stringResource(R.string.music_playlist_detail_delete)) },
            text = { Text(stringResource(R.string.music_playlist_detail_delete_confirm, playlistName)) },
            confirmButton = {
                TextButton(
                    onClick = {
                        showDeleteConfirm = false
                        viewModel.deletePlaylist()
                    },
                ) {
                    Text(stringResource(R.string.music_playlist_detail_delete), color = MaterialTheme.colorScheme.error)
                }
            },
            dismissButton = {
                TextButton(onClick = { showDeleteConfirm = false }) {
                    Text(stringResource(R.string.music_playlists_cancel_aria))
                }
            },
        )
    }
}

@Composable
private fun PlaylistTrackRowView(
    row: MusicPlaylistTrackRow,
    isFirst: Boolean,
    isLast: Boolean,
    isOwner: Boolean,
    onPlay: () -> Unit,
    onAddToQueue: () -> Unit,
    onMoveUp: () -> Unit,
    onMoveDown: () -> Unit,
    onRemove: () -> Unit,
) {
    val track = row.track
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = Spacing.lg, vertical = Spacing.sm),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        if (isOwner) {
            Column {
                IconButton(onClick = onMoveUp, enabled = !isFirst, modifier = Modifier.size(20.dp)) {
                    Icon(
                        Icons.Filled.ArrowDropUp,
                        contentDescription = stringResource(R.string.music_playlist_detail_move_up_aria),
                        modifier = Modifier.size(18.dp),
                    )
                }
                IconButton(onClick = onMoveDown, enabled = !isLast, modifier = Modifier.size(20.dp)) {
                    Icon(
                        Icons.Filled.ArrowDropDown,
                        contentDescription = stringResource(R.string.music_playlist_detail_move_down_aria),
                        modifier = Modifier.size(18.dp),
                    )
                }
            }
            Spacer(modifier = Modifier.width(Spacing.xs))
        }

        Box(
            modifier = Modifier
                .size(44.dp)
                .clip(RoundedCornerShape(6.dp))
                .clickable(onClick = onPlay),
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
        }

        Column(modifier = Modifier.weight(1f).padding(horizontal = Spacing.sm)) {
            Text(text = track.title, style = MaterialTheme.typography.bodyLarge, maxLines = 1, overflow = TextOverflow.Ellipsis)
            Text(
                text = track.artist.displayName,
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
        }

        IconButton(onClick = onAddToQueue) {
            Icon(
                imageVector = Icons.Filled.QueueMusic,
                contentDescription = stringResource(R.string.music_common_add_to_queue),
                tint = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
        if (isOwner) {
            IconButton(onClick = onRemove) {
                Icon(
                    imageVector = Icons.Filled.Delete,
                    contentDescription = stringResource(R.string.music_playlist_detail_remove_track_aria, track.title),
                    tint = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
    }
}
