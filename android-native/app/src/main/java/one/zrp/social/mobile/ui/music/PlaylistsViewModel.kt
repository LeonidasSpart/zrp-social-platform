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
import one.zrp.social.mobile.network.MusicPlaylistListItem

data class PlaylistsUiState(
    val isLoading: Boolean = true,
    val playlists: List<MusicPlaylistListItem> = emptyList(),
    val isCreating: Boolean = false,
    val newPlaylistName: String = "",
    val isSavingNewPlaylist: Boolean = false,
)

/** The same real GET/POST /music/playlists src/app/music/playlists/page.tsx uses. */
class PlaylistsViewModel(private val repository: MusicRepository) : ViewModel() {
    private val _state = MutableStateFlow(PlaylistsUiState())
    val state: StateFlow<PlaylistsUiState> = _state.asStateFlow()

    init {
        load()
    }

    private fun load() {
        viewModelScope.launch {
            _state.update { it.copy(isLoading = true) }
            repository.getPlaylists()
                .onSuccess { playlists -> _state.update { it.copy(playlists = playlists, isLoading = false) } }
                .onFailure { _state.update { it.copy(isLoading = false) } }
        }
    }

    fun onStartCreating() = _state.update { it.copy(isCreating = true) }

    fun onCancelCreating() = _state.update { it.copy(isCreating = false, newPlaylistName = "") }

    fun onNewPlaylistNameChange(name: String) = _state.update { it.copy(newPlaylistName = name) }

    fun createPlaylist() {
        val name = _state.value.newPlaylistName.trim()
        if (name.isEmpty() || _state.value.isSavingNewPlaylist) return
        _state.update { it.copy(isSavingNewPlaylist = true) }
        viewModelScope.launch {
            repository.createPlaylist(name)
                .onSuccess {
                    _state.update { it.copy(isSavingNewPlaylist = false, isCreating = false, newPlaylistName = "") }
                    load()
                }
                .onFailure { _state.update { it.copy(isSavingNewPlaylist = false) } }
        }
    }
}

class PlaylistsViewModelFactory(private val repository: MusicRepository) : ViewModelProvider.Factory {
    @Suppress("UNCHECKED_CAST")
    override fun <T : ViewModel> create(modelClass: Class<T>): T {
        return PlaylistsViewModel(repository) as T
    }
}
