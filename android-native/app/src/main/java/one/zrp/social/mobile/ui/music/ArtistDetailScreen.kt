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
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Album
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.VerifiedUser
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
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
import one.zrp.social.mobile.network.MusicArtistAlbumRef
import one.zrp.social.mobile.ui.components.Avatar
import one.zrp.social.mobile.ui.theme.Spacing
import one.zrp.social.mobile.ui.theme.ZrpRed

/**
 * The same real GET /music/artists/{id} src/app/music/artists/[id]/
 * page.tsx renders: hero (avatar, verified badge, track/follower
 * counts, Play all/Shuffle/Follow), an Albums row, a Singles list
 * (tracks with no album), then every published track. Web shows the
 * same tracks in both Singles and the full Tracks section when they
 * have no album - matched here rather than "simplified" away, since
 * that's the real, confirmed behavior.
 */
@Composable
fun ArtistDetailScreen(artistId: String, player: MusicPlayerViewModel, onBack: () -> Unit, onAlbumClick: (String) -> Unit) {
    val viewModel: ArtistDetailViewModel = viewModel(
        factory = remember(artistId) { ArtistDetailViewModelFactory(MusicRepository(), artistId) },
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
                text = state.artist?.displayName ?: "",
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
            state.notFound || state.artist == null -> {
                Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    Text(
                        text = stringResource(R.string.music_artist_detail_not_found),
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }
            else -> {
                val artist = state.artist!!
                val singles = artist.tracks.filter { it.album == null }

                LazyColumn(modifier = Modifier.fillMaxSize()) {
                    item {
                        Column(modifier = Modifier.padding(Spacing.lg), horizontalAlignment = Alignment.CenterHorizontally) {
                            Avatar(url = artist.avatarUrl, name = artist.displayName, size = 100.dp)
                            Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.padding(top = Spacing.sm)) {
                                Text(text = artist.displayName, style = MaterialTheme.typography.headlineSmall)
                                if (artist.verified) {
                                    Icon(
                                        imageVector = Icons.Filled.VerifiedUser,
                                        contentDescription = stringResource(R.string.music_verified_artist),
                                        tint = ZrpRed,
                                        modifier = Modifier.padding(start = Spacing.xs).size(18.dp),
                                    )
                                }
                            }
                            artist.bio?.let {
                                Text(
                                    text = it,
                                    style = MaterialTheme.typography.bodyMedium,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                                    modifier = Modifier.padding(top = Spacing.xs),
                                )
                            }
                            Text(
                                text = pluralStringResource(R.plurals.music_count_tracks, artist._count.tracks, artist._count.tracks) +
                                    " · " +
                                    pluralStringResource(R.plurals.music_count_followers, artist._count.followers, artist._count.followers),
                                style = MaterialTheme.typography.labelMedium,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                                modifier = Modifier.padding(top = Spacing.xs),
                            )

                            Row(modifier = Modifier.padding(top = Spacing.md)) {
                                PlayAllShuffleRow(
                                    enabled = artist.tracks.isNotEmpty(),
                                    onPlayAll = { player.playAll(artist.tracks) },
                                    onShuffle = { player.shuffleAll(artist.tracks) },
                                )
                                if (!artist.isOwner) {
                                    Spacer(modifier = Modifier.width(Spacing.sm))
                                    OutlinedButton(
                                        onClick = viewModel::toggleFollow,
                                        enabled = !state.isFollowBusy,
                                        colors = if (artist.isFollowing) {
                                            ButtonDefaults.outlinedButtonColors(contentColor = ZrpRed)
                                        } else {
                                            ButtonDefaults.outlinedButtonColors()
                                        },
                                    ) {
                                        Text(
                                            stringResource(
                                                if (artist.isFollowing) R.string.music_artist_detail_following else R.string.music_artist_detail_follow,
                                            ),
                                        )
                                    }
                                }
                            }
                        }
                    }

                    if (artist.albums.isNotEmpty()) {
                        item {
                            Text(
                                text = stringResource(R.string.music_artist_detail_albums_heading),
                                style = MaterialTheme.typography.titleMedium,
                                modifier = Modifier.padding(horizontal = Spacing.lg, vertical = Spacing.sm),
                            )
                        }
                        item {
                            LazyRow(
                                contentPadding = PaddingValues(horizontal = Spacing.lg),
                                horizontalArrangement = Arrangement.spacedBy(Spacing.sm),
                            ) {
                                items(artist.albums, key = { it.id }) { album ->
                                    ArtistAlbumCard(album = album, onClick = { onAlbumClick(album.id) })
                                }
                            }
                        }
                    }

                    if (singles.isNotEmpty()) {
                        item {
                            Text(
                                text = stringResource(R.string.music_artist_detail_singles_heading),
                                style = MaterialTheme.typography.titleMedium,
                                modifier = Modifier.padding(horizontal = Spacing.lg, vertical = Spacing.sm),
                            )
                        }
                        itemsIndexed(singles, key = { _, t -> "single-${t.id}" }) { index, track ->
                            TrackRow(
                                track = track,
                                list = singles,
                                index = index,
                                player = player,
                                onLike = { viewModel.toggleLike(track, player) },
                                showArtist = false,
                            )
                        }
                    }

                    item {
                        Text(
                            text = stringResource(R.string.music_artist_detail_tracks_heading),
                            style = MaterialTheme.typography.titleMedium,
                            modifier = Modifier.padding(horizontal = Spacing.lg, vertical = Spacing.sm),
                        )
                    }
                    if (artist.tracks.isEmpty()) {
                        item { TrackListEmptyState(title = stringResource(R.string.music_artist_detail_no_tracks)) }
                    } else {
                        itemsIndexed(artist.tracks, key = { _, t -> "track-${t.id}" }) { index, track ->
                            TrackRow(
                                track = track,
                                list = artist.tracks,
                                index = index,
                                player = player,
                                onLike = { viewModel.toggleLike(track, player) },
                                showArtist = false,
                                showAlbum = true,
                                onAlbumClick = onAlbumClick,
                            )
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun ArtistAlbumCard(album: MusicArtistAlbumRef, onClick: () -> Unit) {
    Column(
        modifier = Modifier
            .width(130.dp)
            .clickable(onClick = onClick),
    ) {
        Box(
            modifier = Modifier
                .size(130.dp)
                .clip(RoundedCornerShape(8.dp)),
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
            text = album.title,
            style = MaterialTheme.typography.bodyMedium,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
            modifier = Modifier.padding(top = Spacing.xs),
        )
        Text(
            text = pluralStringResource(R.plurals.music_count_tracks, album._count.tracks, album._count.tracks),
            style = MaterialTheme.typography.labelSmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            maxLines = 1,
        )
    }
}
