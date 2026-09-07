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
import one.zrp.social.mobile.network.MusicArtistListItem

data class ArtistsUiState(
    val query: String = "",
    val artists: List<MusicArtistListItem> = emptyList(),
    val isLoading: Boolean = true,
)

/**
 * The same real GET /music/artists search src/app/music/artists/
 * page.tsx uses - debounced the same 250ms that page's own useEffect
 * does.
 */
class ArtistsViewModel(private val repository: MusicRepository) : ViewModel() {
    private val _state = MutableStateFlow(ArtistsUiState())
    val state: StateFlow<ArtistsUiState> = _state.asStateFlow()

    private var searchJob: Job? = null

    init {
        search()
    }

    fun onQueryChange(query: String) {
        _state.update { it.copy(query = query) }
        searchJob?.cancel()
        searchJob = viewModelScope.launch {
            delay(250)
            search()
        }
    }

    private fun search() {
        viewModelScope.launch {
            _state.update { it.copy(isLoading = true) }
            repository.getArtists(_state.value.query)
                .onSuccess { artists -> _state.update { it.copy(artists = artists, isLoading = false) } }
                .onFailure { _state.update { it.copy(isLoading = false) } }
        }
    }
}

class ArtistsViewModelFactory(private val repository: MusicRepository) : ViewModelProvider.Factory {
    @Suppress("UNCHECKED_CAST")
    override fun <T : ViewModel> create(modelClass: Class<T>): T {
        return ArtistsViewModel(repository) as T
    }
}
