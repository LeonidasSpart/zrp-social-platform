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
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Album
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
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
import one.zrp.social.mobile.ui.theme.Spacing

/**
 * The same real GET /music/albums/{id} src/app/music/albums/[id]/
 * page.tsx renders: hero (cover, title, artist link, release date,
 * track count, total duration, Play all/Shuffle), then every published
 * track in that album.
 */
@Composable
fun AlbumDetailScreen(albumId: String, player: MusicPlayerViewModel, onBack: () -> Unit, onArtistClick: (String) -> Unit) {
    val viewModel: AlbumDetailViewModel = viewModel(
        factory = remember(albumId) { AlbumDetailViewModelFactory(MusicRepository(), albumId) },
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
                text = state.album?.title ?: "",
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
            state.notFound || state.album == null -> {
                Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    Text(
                        text = stringResource(R.string.music_album_detail_not_found),
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }
            else -> {
                val album = state.album!!
                LazyColumn(modifier = Modifier.fillMaxSize()) {
                    item {
                        Column(modifier = Modifier.padding(Spacing.lg), horizontalAlignment = Alignment.CenterHorizontally) {
                            Box(
                                modifier = Modifier
                                    .size(180.dp)
                                    .clip(RoundedCornerShape(12.dp)),
                            ) {
                                if (album.coverUrl != null) {
                                    AsyncImage(
                                        model = album.coverUrl,
                                        contentDescription = album.title,
                                        contentScale = ContentScale.Crop,
                                        modifier = Modifier.fillMaxSize(),
                                    )
                                } else {
                                    Icon(imageVector = Icons.Filled.Album, contentDescription = album.title, modifier = Modifier.fillMaxSize())
                                }
                            }

                            Text(
                                text = stringResource(R.string.music_album_detail_eyebrow),
                                style = MaterialTheme.typography.labelMedium,
                                color = MaterialTheme.colorScheme.primary,
                                modifier = Modifier.padding(top = Spacing.md),
                            )
                            Text(text = album.title, style = MaterialTheme.typography.headlineSmall)
                            Text(
                                text = album.artist.displayName,
                                style = MaterialTheme.typography.bodyMedium,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                                modifier = Modifier
                                    .padding(top = Spacing.xs)
                                    .clickable { onArtistClick(album.artist.id) },
                            )
                            album.description?.let {
                                Text(
                                    text = it,
                                    style = MaterialTheme.typography.bodyMedium,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                                    modifier = Modifier.padding(top = Spacing.xs),
                                )
                            }

                            // Composable calls (pluralStringResource,
                            // formatTotalDuration) can't run inside a
                            // plain buildString {} lambda - each piece
                            // is resolved as its own composable call
                            // first, then joined as plain strings.
                            val trackCountText = if (album.tracks.isNotEmpty()) {
                                pluralStringResource(R.plurals.music_count_tracks, album.tracks.size, album.tracks.size)
                            } else {
                                null
                            }
                            val totalDurationSec = sumDurationSec(album.tracks)
                            val durationText = if (totalDurationSec > 0) formatTotalDuration(totalDurationSec) else null
                            val trackCountAndDuration = listOfNotNull(trackCountText, durationText).joinToString(" • ")
                            if (trackCountAndDuration.isNotEmpty()) {
                                Text(
                                    text = trackCountAndDuration,
                                    style = MaterialTheme.typography.labelSmall,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                                    modifier = Modifier.padding(top = Spacing.xs),
                                )
                            }

                            PlayAllShuffleRow(
                                enabled = album.tracks.isNotEmpty(),
                                onPlayAll = { player.playAll(album.tracks) },
                                onShuffle = { player.shuffleAll(album.tracks) },
                                modifier = Modifier.padding(top = Spacing.md),
                            )
                        }
                    }

                    if (album.tracks.isEmpty()) {
                        item { TrackListEmptyState(title = stringResource(R.string.music_album_detail_no_tracks)) }
                    } else {
                        itemsIndexed(album.tracks, key = { _, t -> t.id }) { index, track ->
                            TrackRow(
                                track = track,
                                list = album.tracks,
                                index = index,
                                player = player,
                                onLike = { viewModel.toggleLike(track, player) },
                                showArtist = false,
                            )
                        }
                    }
                }
            }
        }
    }
}
