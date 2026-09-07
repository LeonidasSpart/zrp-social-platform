package one.zrp.social.mobile.ui.music

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import one.zrp.social.mobile.data.MusicRepository
import one.zrp.social.mobile.network.MusicGenre
import one.zrp.social.mobile.network.MusicTrack

data class DiscoverUiState(
    val query: String = "",
    val activeGenre: String? = null,
    val genres: List<MusicGenre> = emptyList(),
    val tracks: List<MusicTrack> = emptyList(),
    val isLoading: Boolean = true,
)

/**
 * The same real GET /music/genres + GET /music/tracks
 * src/app/music/discover/page.tsx uses. A genre chip and the search box
 * both drive the exact same `q` param on the wire (that page has no
 * separate genre filter param) - picking a genre clears the typed
 * query and vice versa, matching that page's own setActiveGenre/setQ
 * pair. [initialGenre] lets the Home screen's own Genres section
 * deep-link straight into a pre-filtered Discover, mirroring that
 * page's own `useSearchParams().get("genre")` initial state.
 */
class DiscoverViewModel(
    private val repository: MusicRepository,
    initialGenre: String?,
) : ViewModel() {
    private val _state = MutableStateFlow(DiscoverUiState(activeGenre = initialGenre))
    val state: StateFlow<DiscoverUiState> = _state.asStateFlow()

    private var searchJob: Job? = null

    init {
        loadGenres()
        search()
    }

    private fun loadGenres() {
        viewModelScope.launch {
            repository.getGenres().onSuccess { genres -> _state.update { it.copy(genres = genres) } }
        }
    }

    fun onQueryChange(query: String) {
        _state.update { it.copy(query = query, activeGenre = null) }
        debounceSearch()
    }

    fun onGenreSelect(genre: String?) {
        _state.update { it.copy(activeGenre = genre, query = "") }
        debounceSearch()
    }

    private fun debounceSearch() {
        searchJob?.cancel()
        searchJob = viewModelScope.launch {
            delay(250)
            search()
        }
    }

    private fun search() {
        viewModelScope.launch {
            _state.update { it.copy(isLoading = true) }
            val term = (_state.value.activeGenre ?: _state.value.query).trim()
            repository.searchTracks(term.takeIf { it.isNotEmpty() })
                .onSuccess { tracks -> _state.update { it.copy(tracks = tracks, isLoading = false) } }
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

class DiscoverViewModelFactory(
    private val repository: MusicRepository,
    private val initialGenre: String?,
) : ViewModelProvider.Factory {
    @Suppress("UNCHECKED_CAST")
    override fun <T : ViewModel> create(modelClass: Class<T>): T {
        return DiscoverViewModel(repository, initialGenre) as T
    }
}
