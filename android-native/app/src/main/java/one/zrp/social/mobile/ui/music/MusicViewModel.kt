package one.zrp.social.mobile.ui.music

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import one.zrp.social.mobile.data.MusicRepository
import one.zrp.social.mobile.network.MusicAlbumSummary
import one.zrp.social.mobile.network.MusicArtistSummary
import one.zrp.social.mobile.network.MusicPlaylistSummary
import one.zrp.social.mobile.network.MusicTrack

data class MusicUiState(
    val isLoading: Boolean = true,
    val trending: List<MusicTrack> = emptyList(),
    val newReleases: List<MusicTrack> = emptyList(),
    val recentlyPlayed: List<MusicTrack> = emptyList(),
    val likedPreview: List<MusicTrack> = emptyList(),
    val latestAlbums: List<MusicAlbumSummary> = emptyList(),
    val popularArtists: List<MusicArtistSummary> = emptyList(),
    val yourPlaylists: List<MusicPlaylistSummary> = emptyList(),
    val error: String? = null,
)

/**
 * Backs the native Music home screen's own data (the real GET
 * /music/home sections) - playback itself now lives in the shared
 * MusicPlayerViewModel (hoisted above ZrpNavHost) rather than here, so
 * it survives navigating to other Music screens instead of stopping
 * when this one is left. Each section here mirrors MusicShell.tsx's
 * own real per-track click behavior exactly: clicking any track row
 * clears the queue and re-seeds it with the rest of that same visible
 * section, not just an explicit "Play All" button's own behavior.
 */
class MusicViewModel(private val repository: MusicRepository, private val player: MusicPlayerViewModel) : ViewModel() {
    private val _state = MutableStateFlow(MusicUiState())
    val state: StateFlow<MusicUiState> = _state.asStateFlow()

    init {
        load()
    }

    private fun load() {
        viewModelScope.launch {
            _state.update { it.copy(isLoading = true, error = null) }
            repository.getHome()
                .onSuccess { home ->
                    _state.update {
                        it.copy(
                            trending = home.trending,
                            newReleases = home.newReleases,
                            recentlyPlayed = home.recentlyPlayed,
                            likedPreview = home.likedPreview,
                            latestAlbums = home.latestAlbums,
                            popularArtists = home.popularArtists,
                            yourPlaylists = home.yourPlaylists,
                            isLoading = false,
                        )
                    }
                }
                .onFailure { error ->
                    _state.update { it.copy(isLoading = false, error = error.message ?: "Couldn't load ZRP Music.") }
                }
        }
    }

    fun onTrackClick(track: MusicTrack, section: List<MusicTrack>) {
        player.playFromList(track, section)
    }

    fun toggleLike(track: MusicTrack) {
        val wasLiked = track.liked

        fun updated(t: MusicTrack) = if (t.id == track.id) t.copy(liked = !wasLiked) else t
        _state.update {
            it.copy(
                trending = it.trending.map(::updated),
                newReleases = it.newReleases.map(::updated),
                recentlyPlayed = it.recentlyPlayed.map(::updated),
                likedPreview = it.likedPreview.map(::updated),
            )
        }

        viewModelScope.launch {
            val nowLiked = player.toggleLike(track)
            if (nowLiked != !wasLiked) {
                fun reverted(t: MusicTrack) = if (t.id == track.id) t.copy(liked = nowLiked) else t
                _state.update {
                    it.copy(
                        trending = it.trending.map(::reverted),
                        newReleases = it.newReleases.map(::reverted),
                        recentlyPlayed = it.recentlyPlayed.map(::reverted),
                        likedPreview = it.likedPreview.map(::reverted),
                    )
                }
            }
        }
    }
}
