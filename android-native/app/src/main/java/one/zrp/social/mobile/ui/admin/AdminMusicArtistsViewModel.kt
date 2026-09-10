package one.zrp.social.mobile.ui.admin

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import one.zrp.social.mobile.data.AdminRepository
import one.zrp.social.mobile.network.AdminMusicArtist

data class AdminMusicArtistsUiState(
    val isLoading: Boolean = true,
    val statusFilter: String = "all",
    val search: String = "",
    val artists: List<AdminMusicArtist> = emptyList(),
    val page: Int = 1,
    val totalPages: Int = 1,
    val busyArtistId: String? = null,
    val pendingDeleteArtistId: String? = null,
    val error: String? = null,
)

/**
 * Ported from src/app/admin/music/page.tsx - the ZRP Music artist
 * roster: the verified badge on an artist profile, and removing an
 * artist outright. Deleting is deliberately far more destructive than
 * anything else in this admin surface: MusicTrack/MusicAlbum/MusicFollow
 * all cascade off MusicArtist in the schema, so it takes the whole
 * catalogue (and its storage objects) with it - which is exactly why it
 * sits behind a confirm dialog naming the artist, matching the
 * website's own confirm().
 *
 * Verifying is not a toggle server-side - the route takes the desired
 * state, so unverifying is the same call with verified = false.
 */
class AdminMusicArtistsViewModel(private val repository: AdminRepository) : ViewModel() {
    private val _state = MutableStateFlow(AdminMusicArtistsUiState())
    val state: StateFlow<AdminMusicArtistsUiState> = _state.asStateFlow()

    fun load() {
        val s = _state.value
        _state.update { it.copy(isLoading = true, error = null) }
        viewModelScope.launch {
            repository.getMusicArtists(s.statusFilter, s.search.trim().ifBlank { null }, s.page)
                .onSuccess { response ->
                    _state.update {
                        it.copy(isLoading = false, artists = response.artists, totalPages = response.totalPages)
                    }
                }
                .onFailure { error -> _state.update { it.copy(isLoading = false, error = error.message) } }
        }
    }

    fun setStatusFilter(status: String) {
        if (status == _state.value.statusFilter) return
        _state.update { it.copy(statusFilter = status, page = 1) }
        load()
    }

    fun setSearch(value: String) = _state.update { it.copy(search = value) }

    fun submitSearch() {
        _state.update { it.copy(page = 1) }
        load()
    }

    fun setPage(page: Int) {
        if (page < 1 || page > _state.value.totalPages) return
        _state.update { it.copy(page = page) }
        load()
    }

    fun setVerified(artistId: String, verified: Boolean) {
        _state.update { it.copy(busyArtistId = artistId, error = null) }
        viewModelScope.launch {
            repository.setMusicArtistVerified(artistId, verified)
                .onSuccess {
                    _state.update { it.copy(busyArtistId = null) }
                    load()
                }
                .onFailure { error -> _state.update { it.copy(busyArtistId = null, error = error.message) } }
        }
    }

    fun requestDelete(artistId: String) = _state.update { it.copy(pendingDeleteArtistId = artistId) }
    fun cancelDelete() = _state.update { it.copy(pendingDeleteArtistId = null) }

    fun confirmDelete() {
        val artistId = _state.value.pendingDeleteArtistId ?: return
        _state.update { it.copy(pendingDeleteArtistId = null, busyArtistId = artistId, error = null) }
        viewModelScope.launch {
            repository.deleteMusicArtist(artistId)
                .onSuccess {
                    _state.update { current ->
                        current.copy(
                            busyArtistId = null,
                            artists = current.artists.filterNot { it.id == artistId },
                        )
                    }
                }
                .onFailure { error -> _state.update { it.copy(busyArtistId = null, error = error.message) } }
        }
    }

    fun consumeError() = _state.update { it.copy(error = null) }
}

class AdminMusicArtistsViewModelFactory(private val repository: AdminRepository) : ViewModelProvider.Factory {
    @Suppress("UNCHECKED_CAST")
    override fun <T : ViewModel> create(modelClass: Class<T>): T = AdminMusicArtistsViewModel(repository) as T
}
