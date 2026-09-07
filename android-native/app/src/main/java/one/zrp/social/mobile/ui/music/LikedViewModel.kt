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
import one.zrp.social.mobile.network.MusicTrack

data class LikedUiState(
    val isLoading: Boolean = true,
    val tracks: List<MusicTrack> = emptyList(),
)

/**
 * The same real GET /music/library likes src/app/music/liked/page.tsx
 * uses. Unlike waits for the real toggle call to actually resolve to
 * "no longer liked" before removing the row - matching that page's own
 * unlike() (no optimistic removal), since reverting a track back into
 * the list after an optimistic remove is a much more jarring correction
 * than the plain heart-icon revert used elsewhere.
 */
class LikedViewModel(private val repository: MusicRepository) : ViewModel() {
    private val _state = MutableStateFlow(LikedUiState())
    val state: StateFlow<LikedUiState> = _state.asStateFlow()

    init {
        load()
    }

    private fun load() {
        viewModelScope.launch {
            _state.update { it.copy(isLoading = true) }
            repository.getLibrary()
                .onSuccess { library ->
                    val liked = library.likes.map { it.track.copy(liked = true) }
                    _state.update { it.copy(tracks = liked, isLoading = false) }
                }
                .onFailure { _state.update { it.copy(isLoading = false) } }
        }
    }

    fun unlike(track: MusicTrack, player: MusicPlayerViewModel) {
        viewModelScope.launch {
            val nowLiked = player.toggleLike(track)
            if (!nowLiked) {
                _state.update { it.copy(tracks = it.tracks.filterNot { t -> t.id == track.id }) }
            }
        }
    }
}

class LikedViewModelFactory(private val repository: MusicRepository) : ViewModelProvider.Factory {
    @Suppress("UNCHECKED_CAST")
    override fun <T : ViewModel> create(modelClass: Class<T>): T {
        return LikedViewModel(repository) as T
    }
}
