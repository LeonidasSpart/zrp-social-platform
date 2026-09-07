package one.zrp.social.mobile.ui.music

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.HorizontalDivider
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
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import one.zrp.social.mobile.R
import one.zrp.social.mobile.data.MusicRepository
import one.zrp.social.mobile.ui.theme.Spacing

/**
 * The same real GET /music/library likes src/app/music/liked/page.tsx
 * uses, reusing the shared TrackRow (showAlbum = true, matching that
 * page's own TrackList props) and PlayAllShuffleRow.
 */
@Composable
fun LikedScreen(player: MusicPlayerViewModel, onBack: () -> Unit) {
    val viewModel: LikedViewModel = viewModel(
        factory = remember { LikedViewModelFactory(MusicRepository()) },
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
                text = stringResource(R.string.music_nav_liked_title),
                style = MaterialTheme.typography.titleMedium,
                modifier = Modifier
                    .padding(start = 4.dp)
                    .weight(1f),
            )
            if (state.tracks.isNotEmpty()) {
                PlayAllShuffleRow(
                    enabled = true,
                    onPlayAll = { player.playAll(state.tracks) },
                    onShuffle = { player.shuffleAll(state.tracks) },
                )
            }
        }
        HorizontalDivider()

        when {
            state.isLoading -> {
                Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    CircularProgressIndicator()
                }
            }
            state.tracks.isEmpty() -> {
                TrackListEmptyState(
                    title = stringResource(R.string.music_liked_empty_title),
                    body = stringResource(R.string.music_liked_empty_body),
                    modifier = Modifier.padding(top = Spacing.xxl),
                )
            }
            else -> {
                LazyColumn(modifier = Modifier.fillMaxSize()) {
                    itemsIndexed(state.tracks, key = { _, t -> t.id }) { index, track ->
                        TrackRow(
                            track = track,
                            list = state.tracks,
                            index = index,
                            player = player,
                            onLike = { viewModel.unlike(track, player) },
                            showArtist = true,
                            showAlbum = true,
                        )
                    }
                }
            }
        }
    }
}
