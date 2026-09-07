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

data class HistoryUiState(
    val isLoading: Boolean = true,
    val tracks: List<MusicTrack> = emptyList(),
)

/**
 * The same real GET /music/library src/app/music/history/page.tsx
 * uses - deduped to one row per track (first, i.e. most recent, listen
 * wins) and cross-referenced against the same response's own `likes`
 * to mark each track's real liked state, matching that page's own
 * dedup loop exactly.
 */
class HistoryViewModel(private val repository: MusicRepository) : ViewModel() {
    private val _state = MutableStateFlow(HistoryUiState())
    val state: StateFlow<HistoryUiState> = _state.asStateFlow()

    init {
        load()
    }

    private fun load() {
        viewModelScope.launch {
            _state.update { it.copy(isLoading = true) }
            repository.getLibrary()
                .onSuccess { library ->
                    val likedIds = library.likes.map { it.track.id }.toSet()
                    val seen = HashSet<String>()
                    val recent = mutableListOf<MusicTrack>()
                    for (entry in library.history) {
                        val track = entry.track
                        if (!seen.add(track.id)) continue
                        recent.add(track.copy(liked = track.id in likedIds))
                    }
                    _state.update { it.copy(tracks = recent, isLoading = false) }
                }
                .onFailure { _state.update { it.copy(isLoading = false) } }
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
        _state.update { state -> state.copy(tracks = state.tracks.map { if (it.id == trackId) transform(it) else it }) }
    }
}

class HistoryViewModelFactory(private val repository: MusicRepository) : ViewModelProvider.Factory {
    @Suppress("UNCHECKED_CAST")
    override fun <T : ViewModel> create(modelClass: Class<T>): T {
        return HistoryViewModel(repository) as T
    }
}
