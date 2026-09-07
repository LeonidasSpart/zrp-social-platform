package one.zrp.social.mobile.ui.music

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.ListAlt
import androidx.compose.material.icons.filled.Add
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
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
import androidx.compose.ui.res.pluralStringResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import coil.compose.AsyncImage
import one.zrp.social.mobile.R
import one.zrp.social.mobile.data.MusicRepository
import one.zrp.social.mobile.network.MusicPlaylistListItem
import one.zrp.social.mobile.ui.theme.ZrpRed

/**
 * The same real GET/POST /music/playlists src/app/music/playlists/
 * page.tsx uses: a 2-column grid of the signed-in user's own
 * playlists, with the same cover fallback chain (playlist's own cover,
 * else its first track's cover, else that track's album cover) and an
 * inline create-playlist form.
 */
@Composable
fun PlaylistsScreen(onBack: () -> Unit, onPlaylistClick: (String) -> Unit) {
    val viewModel: PlaylistsViewModel = viewModel(
        factory = remember { PlaylistsViewModelFactory(MusicRepository()) },
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
                text = stringResource(R.string.music_playlists_title),
                style = MaterialTheme.typography.titleMedium,
                modifier = Modifier
                    .padding(start = 4.dp)
                    .weight(1f),
            )
            if (!state.isCreating) {
                Button(
                    onClick = viewModel::onStartCreating,
                    colors = ButtonDefaults.buttonColors(containerColor = ZrpRed),
                ) {
                    Icon(Icons.Filled.Add, contentDescription = null, modifier = Modifier.size(18.dp))
                    Text(stringResource(R.string.music_playlists_new_playlist), modifier = Modifier.padding(start = 4.dp))
                }
            }
        }

        if (state.isCreating) {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 16.dp, vertical = 8.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                OutlinedTextField(
                    value = state.newPlaylistName,
                    onValueChange = viewModel::onNewPlaylistNameChange,
                    placeholder = { Text(stringResource(R.string.music_playlists_name_placeholder)) },
                    singleLine = true,
                    modifier = Modifier.weight(1f),
                )
                Button(
                    onClick = viewModel::createPlaylist,
                    enabled = !state.isSavingNewPlaylist && state.newPlaylistName.isNotBlank(),
                    colors = ButtonDefaults.buttonColors(containerColor = ZrpRed),
                    modifier = Modifier.padding(start = 8.dp),
                ) {
                    if (state.isSavingNewPlaylist) {
                        CircularProgressIndicator(modifier = Modifier.size(16.dp), strokeWidth = 2.dp, color = Color.White)
                    } else {
                        Text(stringResource(R.string.music_playlists_create))
                    }
                }
                IconButton(onClick = viewModel::onCancelCreating) {
                    Icon(Icons.Filled.Close, contentDescription = stringResource(R.string.music_playlists_cancel_aria))
                }
            }
        }

        when {
            state.isLoading -> {
                Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    CircularProgressIndicator()
                }
            }
            state.playlists.isEmpty() -> {
                Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    Column(horizontalAlignment = Alignment.CenterHorizontally) {
                        Icon(
                            imageVector = Icons.Filled.ListAlt,
                            contentDescription = null,
                            tint = MaterialTheme.colorScheme.onSurfaceVariant,
                            modifier = Modifier.size(40.dp),
                        )
                        Text(
                            text = stringResource(R.string.music_playlists_empty_title),
                            style = MaterialTheme.typography.titleMedium,
                            modifier = Modifier.padding(top = 12.dp),
                        )
                        Text(
                            text = stringResource(R.string.music_playlists_empty_body),
                            style = MaterialTheme.typography.bodyMedium,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            modifier = Modifier.padding(top = 4.dp),
                        )
                    }
                }
            }
            else -> {
                LazyVerticalGrid(
                    columns = GridCells.Fixed(2),
                    contentPadding = PaddingValues(16.dp),
                    horizontalArrangement = Arrangement.spacedBy(12.dp),
                    verticalArrangement = Arrangement.spacedBy(16.dp),
                    modifier = Modifier.fillMaxSize(),
                ) {
                    items(state.playlists, key = { it.id }) { playlist ->
                        PlaylistCard(playlist = playlist, onClick = { onPlaylistClick(playlist.id) })
                    }
                }
            }
        }
    }
}

@Composable
private fun PlaylistCard(playlist: MusicPlaylistListItem, onClick: () -> Unit) {
    val cover = playlist.coverUrl
        ?: playlist.tracks.firstOrNull()?.track?.coverUrl
        ?: playlist.tracks.firstOrNull()?.track?.album?.coverUrl

    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onClick),
    ) {
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .aspectRatio(1f)
                .clip(RoundedCornerShape(8.dp)),
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
            text = playlist.name,
            style = MaterialTheme.typography.bodyLarge,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
            modifier = Modifier.padding(top = 6.dp),
        )
        Text(
            text = pluralStringResource(R.plurals.music_count_tracks, playlist.tracks.size, playlist.tracks.size),
            style = MaterialTheme.typography.labelSmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
}
