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
import one.zrp.social.mobile.network.MusicAlbumSummary

data class AlbumsUiState(
    val query: String = "",
    val albums: List<MusicAlbumSummary> = emptyList(),
    val isLoading: Boolean = true,
)

/**
 * The same real GET /music/albums search src/app/music/albums/
 * page.tsx uses - debounced the same 250ms that page's own useEffect
 * does.
 */
class AlbumsViewModel(private val repository: MusicRepository) : ViewModel() {
    private val _state = MutableStateFlow(AlbumsUiState())
    val state: StateFlow<AlbumsUiState> = _state.asStateFlow()

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
            repository.getAlbums(_state.value.query)
                .onSuccess { albums -> _state.update { it.copy(albums = albums, isLoading = false) } }
                .onFailure { _state.update { it.copy(isLoading = false) } }
        }
    }
}

class AlbumsViewModelFactory(private val repository: MusicRepository) : ViewModelProvider.Factory {
    @Suppress("UNCHECKED_CAST")
    override fun <T : ViewModel> create(modelClass: Class<T>): T {
        return AlbumsViewModel(repository) as T
    }
}
