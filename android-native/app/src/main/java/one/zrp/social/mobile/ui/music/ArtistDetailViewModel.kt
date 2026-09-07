package one.zrp.social.mobile.ui.music

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import one.zrp.social.mobile.data.MusicRepository
import one.zrp.social.mobile.network.MusicArtistDetail
import one.zrp.social.mobile.network.MusicTrack

data class ArtistDetailUiState(
    val isLoading: Boolean = true,
    val artist: MusicArtistDetail? = null,
    val isFollowBusy: Boolean = false,
    val notFound: Boolean = false,
)

/**
 * The same real GET /music/artists/{id} src/app/music/artists/[id]/
 * page.tsx uses. Owner-only affordances (Edit Profile, per-track
 * delete, the Studio deep links) aren't wired up yet - see
 * MusicArtistDetail's own KDoc.
 */
class ArtistDetailViewModel(private val repository: MusicRepository, private val artistId: String) : ViewModel() {
    private val _state = MutableStateFlow(ArtistDetailUiState())
    val state: StateFlow<ArtistDetailUiState> = _state.asStateFlow()

    init {
        load()
    }

    private fun load() {
        viewModelScope.launch {
            _state.update { it.copy(isLoading = true) }
            repository.getArtistDetail(artistId)
                .onSuccess { artist -> _state.update { it.copy(isLoading = false, artist = artist) } }
                .onFailure { _state.update { it.copy(isLoading = false, notFound = true) } }
        }
    }

    fun toggleFollow() {
        val artist = _state.value.artist ?: return
        if (_state.value.isFollowBusy) return
        _state.update { it.copy(isFollowBusy = true) }
        viewModelScope.launch {
            repository.toggleArtistFollow(artistId)
                .onSuccess { following ->
                    _state.update {
                        val current = it.artist ?: return@update it
                        val delta = if (following) 1 else -1
                        it.copy(
                            isFollowBusy = false,
                            artist = current.copy(
                                isFollowing = following,
                                _count = current._count.copy(followers = current._count.followers + delta),
                            ),
                        )
                    }
                }
                .onFailure { _state.update { it.copy(isFollowBusy = false) } }
        }
    }

    fun toggleLike(track: MusicTrack, player: MusicPlayerViewModel) {
        val wasLiked = track.liked
        updateTrack(track.id) { it.copy(liked = !wasLiked) }
        viewModelScope.launch {
            val nowLiked = player.toggleLike(track)
            if (nowLiked != !wasLiked) {
                updateTrack(track.id) { it.copy(liked = nowLiked) }
            }
        }
    }

    private fun updateTrack(trackId: String, transform: (MusicTrack) -> MusicTrack) {
        _state.update { state ->
            val artist = state.artist ?: return@update state
            state.copy(artist = artist.copy(tracks = artist.tracks.map { if (it.id == trackId) transform(it) else it }))
        }
    }
}

class ArtistDetailViewModelFactory(
    private val repository: MusicRepository,
    private val artistId: String,
) : ViewModelProvider.Factory {
    @Suppress("UNCHECKED_CAST")
    override fun <T : ViewModel> create(modelClass: Class<T>): T {
        return ArtistDetailViewModel(repository, artistId) as T
    }
}
