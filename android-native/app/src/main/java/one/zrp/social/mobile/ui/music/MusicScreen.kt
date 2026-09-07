package one.zrp.social.mobile.ui.music

import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.rememberScrollState
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
import androidx.compose.material.icons.filled.Album
import androidx.compose.material.icons.filled.CloudUpload
import androidx.compose.material.icons.filled.Explore
import androidx.compose.material.icons.filled.History
import androidx.compose.material.icons.filled.ListAlt
import androidx.compose.material.icons.filled.People
import androidx.compose.material.icons.filled.QueueMusic
import androidx.compose.material.icons.filled.VerifiedUser
import androidx.compose.material3.AssistChip
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
import androidx.compose.ui.res.pluralStringResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import coil.compose.AsyncImage
import one.zrp.social.mobile.R
import one.zrp.social.mobile.data.MusicRepository
import one.zrp.social.mobile.network.MusicAlbumSummary
import one.zrp.social.mobile.network.MusicArtistSummary
import one.zrp.social.mobile.network.MusicGenre
import one.zrp.social.mobile.network.MusicPlaylistSummary
import one.zrp.social.mobile.network.MusicTrack
import one.zrp.social.mobile.ui.components.Avatar
import one.zrp.social.mobile.ui.theme.Spacing
import one.zrp.social.mobile.ui.theme.ZrpRed

/**
 * ZRP Music - real tracks, real playback, real likes. Reached from the
 * Search tab's Discover section rather than a bottom-nav tab, matching
 * how the website itself treats Music as one of several destinations
 * beyond the core social loop (see ZrpDestination's own KDoc). Playback
 * itself is owned by [player] (hoisted above ZrpNavHost), not this
 * screen, so it keeps running when this screen is left for Queue or any
 * other Music screen.
 */
@Composable
fun MusicScreen(
    player: MusicPlayerViewModel,
    onBack: () -> Unit,
    onOpenQueue: () -> Unit,
    onOpenArtists: () -> Unit,
    onOpenAlbums: () -> Unit,
    onOpenPlaylists: () -> Unit,
    onOpenDiscover: () -> Unit,
    onOpenLiked: () -> Unit,
    onOpenHistory: () -> Unit,
    onOpenStudio: () -> Unit,
    onArtistClick: (String) -> Unit,
    onAlbumClick: (String) -> Unit,
    onPlaylistClick: (String) -> Unit,
    onGenreClick: (String) -> Unit,
) {
    val viewModel: MusicViewModel = viewModel(
        factory = remember(player) { MusicViewModelFactory(MusicRepository(), player) },
    )
    val state by viewModel.state.collectAsState()
    val playerState by player.state.collectAsState()

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
                text = stringResource(R.string.music_title),
                style = MaterialTheme.typography.titleMedium,
                modifier = Modifier
                    .padding(start = 4.dp)
                    .weight(1f),
            )
            IconButton(onClick = onOpenStudio) {
                Icon(Icons.Filled.CloudUpload, contentDescription = stringResource(R.string.music_shell_studio_label))
            }
            IconButton(onClick = onOpenQueue) {
                Icon(Icons.Filled.QueueMusic, contentDescription = stringResource(R.string.music_nav_queue_title))
            }
        }
        HorizontalDivider()

        Row(
            modifier = Modifier
                .horizontalScroll(rememberScrollState())
                .padding(horizontal = 16.dp, vertical = 8.dp),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            AssistChip(
                onClick = onOpenDiscover,
                leadingIcon = { Icon(Icons.Filled.Explore, contentDescription = null, modifier = Modifier.size(18.dp)) },
                label = { Text(stringResource(R.string.music_nav_discover_title)) },
            )
            AssistChip(
                onClick = onOpenArtists,
                leadingIcon = { Icon(Icons.Filled.People, contentDescription = null, modifier = Modifier.size(18.dp)) },
                label = { Text(stringResource(R.string.music_artists_title)) },
            )
            AssistChip(
                onClick = onOpenAlbums,
                leadingIcon = { Icon(Icons.Filled.Album, contentDescription = null, modifier = Modifier.size(18.dp)) },
                label = { Text(stringResource(R.string.music_albums_title)) },
            )
            AssistChip(
                onClick = onOpenPlaylists,
                leadingIcon = { Icon(Icons.Filled.ListAlt, contentDescription = null, modifier = Modifier.size(18.dp)) },
                label = { Text(stringResource(R.string.music_playlists_title)) },
            )
            AssistChip(
                onClick = onOpenLiked,
                leadingIcon = { Icon(Icons.Filled.Favorite, contentDescription = null, modifier = Modifier.size(18.dp)) },
                label = { Text(stringResource(R.string.music_nav_liked_title)) },
            )
            AssistChip(
                onClick = onOpenHistory,
                leadingIcon = { Icon(Icons.Filled.History, contentDescription = null, modifier = Modifier.size(18.dp)) },
                label = { Text(stringResource(R.string.music_nav_history_title)) },
            )
        }

        Box(
            modifier = Modifier
                .weight(1f)
                .fillMaxWidth(),
        ) {
            val hasAnyContent = state.trending.isNotEmpty() ||
                state.newReleases.isNotEmpty() ||
                state.recentlyPlayed.isNotEmpty() ||
                state.likedPreview.isNotEmpty() ||
                state.latestAlbums.isNotEmpty() ||
                state.popularArtists.isNotEmpty() ||
                state.yourPlaylists.isNotEmpty() ||
                state.genres.isNotEmpty()

            when {
                state.isLoading -> {
                    Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                        CircularProgressIndicator()
                    }
                }
                !hasAnyContent -> {
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
                    // Section order matches MusicShell.tsx's own real
                    // home layout: Recently Played, Trending, Your
                    // Playlists, Liked preview, New Releases, Latest
                    // Albums, Popular Artists, Genres.
                    LazyColumn(modifier = Modifier.fillMaxSize()) {
                        if (state.recentlyPlayed.isNotEmpty()) {
                            item {
                                MusicSection(
                                    title = stringResource(R.string.music_nav_history_title),
                                    tracks = state.recentlyPlayed,
                                    currentTrackId = playerState.currentTrack?.id,
                                    onTrackClick = { viewModel.onTrackClick(it, state.recentlyPlayed) },
                                    onHeaderClick = onOpenHistory,
                                )
                            }
                        }
                        if (state.trending.isNotEmpty()) {
                            item {
                                MusicSection(
                                    title = stringResource(R.string.music_shell_trending_heading),
                                    tracks = state.trending,
                                    currentTrackId = playerState.currentTrack?.id,
                                    onTrackClick = { viewModel.onTrackClick(it, state.trending) },
                                    onHeaderClick = onOpenDiscover,
                                )
                            }
                        }
                        if (state.yourPlaylists.isNotEmpty()) {
                            item {
                                YourPlaylistsSection(
                                    playlists = state.yourPlaylists,
                                    onPlaylistClick = onPlaylistClick,
                                    onHeaderClick = onOpenPlaylists,
                                )
                            }
                        }
                        if (state.likedPreview.isNotEmpty()) {
                            item {
                                MusicSection(
                                    title = stringResource(R.string.music_nav_liked_title),
                                    tracks = state.likedPreview,
                                    currentTrackId = playerState.currentTrack?.id,
                                    onTrackClick = { viewModel.onTrackClick(it, state.likedPreview) },
                                    onHeaderClick = onOpenLiked,
                                )
                            }
                        }
                        if (state.newReleases.isNotEmpty()) {
                            item {
                                MusicSection(
                                    title = stringResource(R.string.music_shell_new_releases_heading),
                                    tracks = state.newReleases,
                                    currentTrackId = playerState.currentTrack?.id,
                                    onTrackClick = { viewModel.onTrackClick(it, state.newReleases) },
                                    onHeaderClick = onOpenDiscover,
                                )
                            }
                        }
                        if (state.latestAlbums.isNotEmpty()) {
                            item {
                                LatestAlbumsSection(albums = state.latestAlbums, onAlbumClick = onAlbumClick, onHeaderClick = onOpenAlbums)
                            }
                        }
                        if (state.popularArtists.isNotEmpty()) {
                            item {
                                PopularArtistsSection(artists = state.popularArtists, onArtistClick = onArtistClick, onHeaderClick = onOpenArtists)
                            }
                        }
                        if (state.genres.isNotEmpty()) {
                            item {
                                GenresSection(genres = state.genres, onGenreClick = onGenreClick)
                            }
                        }
                    }
                }
            }
        }

        val currentTrack = playerState.currentTrack
        if (currentTrack != null) {
            MiniPlayerBar(
                track = currentTrack,
                isPlaying = playerState.isPlaying,
                isBuffering = playerState.isBuffering,
                positionMs = playerState.positionMs,
                durationMs = playerState.durationMs,
                onTogglePlayPause = { player.togglePlayPause() },
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
    onHeaderClick: (() -> Unit)? = null,
) {
    Column {
        SectionHeading(title = title, onClick = onHeaderClick)
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

// The website's own SectionHeading - every real home section's title
// is itself a "see all" link to that section's own full screen (Trending/
// New Releases -> Discover, Recently Played -> History, Liked preview
// -> Liked, Your Playlists -> Playlists, Latest Albums -> Albums,
// Popular Artists -> Artists). Genres is the one section whose real
// heading isn't a link, so it's the one caller that omits onClick.
@Composable
private fun SectionHeading(title: String, onClick: (() -> Unit)?) {
    Text(
        text = title,
        style = MaterialTheme.typography.titleMedium,
        fontWeight = FontWeight.Bold,
        modifier = Modifier
            .let { if (onClick != null) it.clickable(onClick = onClick) else it }
            .padding(horizontal = 16.dp, vertical = 8.dp),
    )
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
private fun LatestAlbumsSection(albums: List<MusicAlbumSummary>, onAlbumClick: (String) -> Unit, onHeaderClick: () -> Unit) {
    Column {
        SectionHeading(title = stringResource(R.string.music_shell_latest_albums_heading), onClick = onHeaderClick)
        LazyRow(
            contentPadding = PaddingValues(horizontal = 16.dp),
            horizontalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            items(albums, key = { it.id }) { album ->
                Column(
                    modifier = Modifier
                        .width(130.dp)
                        .clickable { onAlbumClick(album.id) },
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
                        text = album.artist.displayName +
                            (if (album.totalDurationSec > 0) " • ${formatTotalDuration(album.totalDurationSec)}" else ""),
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                }
            }
        }
    }
}

@Composable
private fun PopularArtistsSection(artists: List<MusicArtistSummary>, onArtistClick: (String) -> Unit, onHeaderClick: () -> Unit) {
    Column {
        SectionHeading(title = stringResource(R.string.music_shell_popular_artists_heading), onClick = onHeaderClick)
        LazyRow(
            contentPadding = PaddingValues(horizontal = 16.dp),
            horizontalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            items(artists, key = { it.id }) { artist ->
                Column(
                    modifier = Modifier
                        .width(96.dp)
                        .clickable { onArtistClick(artist.id) },
                    horizontalAlignment = Alignment.CenterHorizontally,
                ) {
                    Avatar(url = artist.avatarUrl, name = artist.displayName, size = 80.dp)
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text(
                            text = artist.displayName,
                            style = MaterialTheme.typography.bodyMedium,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                            modifier = Modifier.padding(top = 6.dp),
                        )
                        if (artist.verified) {
                            Icon(
                                imageVector = Icons.Filled.VerifiedUser,
                                contentDescription = stringResource(R.string.music_verified_artist),
                                tint = ZrpRed,
                                modifier = Modifier
                                    .padding(start = 3.dp, top = 6.dp)
                                    .size(12.dp),
                            )
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun YourPlaylistsSection(playlists: List<MusicPlaylistSummary>, onPlaylistClick: (String) -> Unit, onHeaderClick: () -> Unit) {
    Column {
        // The real home page reuses music.nav.playlistsTitle
        // ("Playlists") for this section's own heading too, rather
        // than a distinct "Your Playlists" string - matched as-is.
        SectionHeading(title = stringResource(R.string.music_playlists_title), onClick = onHeaderClick)
        LazyRow(
            contentPadding = PaddingValues(horizontal = 16.dp),
            horizontalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            items(playlists, key = { it.id }) { playlist ->
                val cover = playlist.coverUrl
                    ?: playlist.tracks.firstOrNull()?.track?.coverUrl
                    ?: playlist.tracks.firstOrNull()?.track?.album?.coverUrl
                Column(
                    modifier = Modifier
                        .width(130.dp)
                        .clickable { onPlaylistClick(playlist.id) },
                ) {
                    Box(
                        modifier = Modifier
                            .size(130.dp)
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
                        style = MaterialTheme.typography.bodyMedium,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                        modifier = Modifier.padding(top = Spacing.xs),
                    )
                }
            }
        }
    }
}

@Composable
private fun GenresSection(genres: List<MusicGenre>, onGenreClick: (String) -> Unit) {
    Column {
        // Genres is the one home section whose real heading isn't a
        // "see all" link (there's no separate full Genres screen - the
        // chips below already show every genre), so onClick is null.
        SectionHeading(title = stringResource(R.string.music_shell_genres_heading), onClick = null)
        // A horizontally scrolling row rather than the website's own
        // flex-wrap grid - phone width can't show more than a handful
        // of genre chips at once anyway, and every other home section
        // in this screen already scrolls horizontally the same way.
        LazyRow(
            contentPadding = PaddingValues(horizontal = 16.dp),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            items(genres, key = { it.genre }) { genre ->
                AssistChip(
                    onClick = { onGenreClick(genre.genre) },
                    label = { Text("${genre.genre} (${genre.count})") },
                )
            }
        }
    }
}

@Composable
internal fun MiniPlayerBar(
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
