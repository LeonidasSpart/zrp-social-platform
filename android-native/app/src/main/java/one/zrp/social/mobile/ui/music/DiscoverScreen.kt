package one.zrp.social.mobile.ui.music

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.FilterChip
import androidx.compose.material3.HorizontalDivider
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
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import one.zrp.social.mobile.R
import one.zrp.social.mobile.data.MusicRepository
import one.zrp.social.mobile.network.MusicGenre
import one.zrp.social.mobile.ui.theme.Spacing
import one.zrp.social.mobile.ui.theme.ZrpRed

/**
 * The same real GET /music/genres + GET /music/tracks search
 * src/app/music/discover/page.tsx uses - genre chips and the search
 * field both drive that page's own single `q` param, reached either
 * from the Music home screen's own Discover quick-nav tile or a
 * Genres chip (deep-linking straight into that genre via
 * [initialGenre], the native equivalent of that page's own
 * `?genre=` query param).
 */
@Composable
fun DiscoverScreen(
    player: MusicPlayerViewModel,
    initialGenre: String?,
    onBack: () -> Unit,
) {
    val viewModel: DiscoverViewModel = viewModel(
        factory = remember(initialGenre) { DiscoverViewModelFactory(MusicRepository(), initialGenre) },
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
                Icon(Icons.Filled.ArrowBack, contentDescription = stringResource(R.string.nav_back))
            }
            Text(
                text = stringResource(R.string.music_nav_discover_title),
                style = MaterialTheme.typography.titleMedium,
                modifier = Modifier.padding(start = 4.dp),
            )
        }
        OutlinedTextField(
            value = state.query,
            onValueChange = viewModel::onQueryChange,
            placeholder = { Text(stringResource(R.string.music_discover_search_placeholder)) },
            singleLine = true,
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 16.dp, vertical = 8.dp),
        )
        HorizontalDivider()

        LazyColumn(
            contentPadding = PaddingValues(bottom = Spacing.lg),
            modifier = Modifier.fillMaxSize(),
        ) {
            if (state.genres.isNotEmpty()) {
                item {
                    Column(modifier = Modifier.padding(horizontal = Spacing.lg, vertical = Spacing.sm)) {
                        Text(
                            text = stringResource(R.string.music_discover_browse_by_genre),
                            style = MaterialTheme.typography.labelSmall,
                            fontWeight = FontWeight.Bold,
                            color = ZrpRed,
                        )
                        GenreChipsRow(
                            genres = state.genres,
                            activeGenre = state.activeGenre,
                            onSelect = viewModel::onGenreSelect,
                            modifier = Modifier.padding(top = Spacing.sm),
                        )
                    }
                }
            }

            item {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = Spacing.lg, vertical = Spacing.sm),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    // Captured into a local val first - smart-casting
                    // state.activeGenre directly from String? to String
                    // fails to compile since it's read through a
                    // Compose State delegate's getter, not a plain val.
                    val activeGenre = state.activeGenre
                    val heading = when {
                        activeGenre != null -> activeGenre
                        state.query.isNotBlank() -> stringResource(R.string.music_discover_results_for, state.query)
                        else -> stringResource(R.string.music_discover_all_tracks)
                    }
                    Text(
                        text = heading,
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.Black,
                        modifier = Modifier.weight(1f),
                    )
                    PlayAllShuffleRow(
                        enabled = state.tracks.isNotEmpty(),
                        onPlayAll = { player.playAll(state.tracks) },
                        onShuffle = { player.shuffleAll(state.tracks) },
                    )
                }
            }

            when {
                state.isLoading -> {
                    item {
                        Box(modifier = Modifier.fillMaxWidth().padding(Spacing.xl), contentAlignment = Alignment.Center) {
                            CircularProgressIndicator()
                        }
                    }
                }
                state.tracks.isEmpty() -> {
                    item {
                        TrackListEmptyState(
                            title = stringResource(R.string.music_discover_no_tracks_title),
                            body = stringResource(R.string.music_discover_no_tracks_body),
                        )
                    }
                }
                else -> {
                    itemsIndexed(state.tracks, key = { _, t -> t.id }) { index, track ->
                        TrackRow(
                            track = track,
                            list = state.tracks,
                            index = index,
                            player = player,
                            onLike = { viewModel.toggleLike(track, player) },
                            showArtist = true,
                            showAlbum = true,
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun GenreChipsRow(
    genres: List<MusicGenre>,
    activeGenre: String?,
    onSelect: (String?) -> Unit,
    modifier: Modifier = Modifier,
) {
    LazyRow(horizontalArrangement = Arrangement.spacedBy(Spacing.sm), modifier = modifier) {
        item {
            FilterChip(
                selected = activeGenre == null,
                onClick = { onSelect(null) },
                label = { Text(stringResource(R.string.music_discover_all)) },
            )
        }
        itemsIndexed(genres, key = { _, g -> g.genre }) { _, genre ->
            FilterChip(
                selected = activeGenre == genre.genre,
                onClick = { onSelect(genre.genre) },
                label = { Text("${genre.genre} (${genre.count})") },
            )
        }
    }
}
