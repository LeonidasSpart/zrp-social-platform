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
import one.zrp.social.mobile.network.MusicPlaylistDetail
import one.zrp.social.mobile.network.MusicTrack

data class PlaylistDetailUiState(
    val isLoading: Boolean = true,
    val playlist: MusicPlaylistDetail? = null,
    val notFound: Boolean = false,
    val isEditingName: Boolean = false,
    val nameDraft: String = "",
    val isDeleted: Boolean = false,
)

/**
 * The same real GET /music/playlists/{id} src/app/music/playlists/
 * [id]/page.tsx uses. Reordering optimistically swaps two rows locally
 * (matching that page's own move()) before confirming with the real
 * POST .../reorder, rather than waiting on a round trip for every tap.
 */
class PlaylistDetailViewModel(private val repository: MusicRepository, private val playlistId: String) : ViewModel() {
    private val _state = MutableStateFlow(PlaylistDetailUiState())
    val state: StateFlow<PlaylistDetailUiState> = _state.asStateFlow()

    init {
        load()
    }

    private fun load() {
        viewModelScope.launch {
            _state.update { it.copy(isLoading = true) }
            repository.getPlaylistDetail(playlistId)
                .onSuccess { playlist -> _state.update { it.copy(isLoading = false, playlist = playlist) } }
                .onFailure { _state.update { it.copy(isLoading = false, notFound = true) } }
        }
    }

    fun onStartEditingName() {
        val playlist = _state.value.playlist ?: return
        _state.update { it.copy(isEditingName = true, nameDraft = playlist.name) }
    }

    fun onNameDraftChange(name: String) = _state.update { it.copy(nameDraft = name) }

    fun onCancelEditingName() = _state.update { it.copy(isEditingName = false) }

    fun saveName() {
        val playlist = _state.value.playlist ?: return
        val newName = _state.value.nameDraft.trim()
        if (newName.isEmpty()) {
            _state.update { it.copy(isEditingName = false) }
            return
        }
        _state.update { it.copy(isEditingName = false, playlist = playlist.copy(name = newName)) }
        viewModelScope.launch {
            repository.renamePlaylist(playlistId, newName)
        }
    }

    fun deletePlaylist() {
        viewModelScope.launch {
            repository.deletePlaylist(playlistId).onSuccess {
                _state.update { it.copy(isDeleted = true) }
            }
        }
    }

    fun removeTrack(trackId: String) {
        val playlist = _state.value.playlist ?: return
        _state.update { it.copy(playlist = playlist.copy(tracks = playlist.tracks.filterNot { it.track.id == trackId })) }
        viewModelScope.launch {
            repository.removeTrackFromPlaylist(playlistId, trackId).onFailure { load() }
        }
    }

    // Matches page.tsx's own move(): swap two adjacent rows locally,
    // then confirm with the real reorder call using the full, now-
    // reordered list of MusicPlaylistTrackRow ids (not track ids).
    fun moveTrack(index: Int, direction: Int) {
        val playlist = _state.value.playlist ?: return
        val target = index + direction
        if (target < 0 || target >= playlist.tracks.size) return

        val reordered = playlist.tracks.toMutableList()
        val tmp = reordered[index]
        reordered[index] = reordered[target]
        reordered[target] = tmp
        _state.update { it.copy(playlist = playlist.copy(tracks = reordered)) }

        viewModelScope.launch {
            repository.reorderPlaylist(playlistId, reordered.map { it.id })
        }
    }

    fun toggleLike(track: MusicTrack, player: MusicPlayerViewModel) {
        val wasLiked = track.liked
        updateTrackLiked(track.id, !wasLiked)
        viewModelScope.launch {
            val nowLiked = player.toggleLike(track)
            if (nowLiked != !wasLiked) updateTrackLiked(track.id, nowLiked)
        }
    }

    private fun updateTrackLiked(trackId: String, liked: Boolean) {
        _state.update { state ->
            val playlist = state.playlist ?: return@update state
            state.copy(
                playlist = playlist.copy(
                    tracks = playlist.tracks.map { row ->
                        if (row.track.id == trackId) row.copy(track = row.track.copy(liked = liked)) else row
                    },
                ),
            )
        }
    }
}

class PlaylistDetailViewModelFactory(
    private val repository: MusicRepository,
    private val playlistId: String,
) : ViewModelProvider.Factory {
    @Suppress("UNCHECKED_CAST")
    override fun <T : ViewModel> create(modelClass: Class<T>): T {
        return PlaylistDetailViewModel(repository, playlistId) as T
    }
}
