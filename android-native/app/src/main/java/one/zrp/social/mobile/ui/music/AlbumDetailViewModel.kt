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
import one.zrp.social.mobile.network.MusicAlbumDetail
import one.zrp.social.mobile.network.MusicTrack

data class AlbumDetailUiState(
    val isLoading: Boolean = true,
    val album: MusicAlbumDetail? = null,
    val notFound: Boolean = false,
)

/** The same real GET /music/albums/{id} src/app/music/albums/[id]/page.tsx uses. */
class AlbumDetailViewModel(private val repository: MusicRepository, private val albumId: String) : ViewModel() {
    private val _state = MutableStateFlow(AlbumDetailUiState())
    val state: StateFlow<AlbumDetailUiState> = _state.asStateFlow()

    init {
        load()
    }

    private fun load() {
        viewModelScope.launch {
            _state.update { it.copy(isLoading = true) }
            repository.getAlbumDetail(albumId)
                .onSuccess { album -> _state.update { it.copy(isLoading = false, album = album) } }
                .onFailure { _state.update { it.copy(isLoading = false, notFound = true) } }
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
            val album = state.album ?: return@update state
            state.copy(album = album.copy(tracks = album.tracks.map { if (it.id == trackId) transform(it) else it }))
        }
    }
}

class AlbumDetailViewModelFactory(
    private val repository: MusicRepository,
    private val albumId: String,
) : ViewModelProvider.Factory {
    @Suppress("UNCHECKED_CAST")
    override fun <T : ViewModel> create(modelClass: Class<T>): T {
        return AlbumDetailViewModel(repository, albumId) as T
    }
}
