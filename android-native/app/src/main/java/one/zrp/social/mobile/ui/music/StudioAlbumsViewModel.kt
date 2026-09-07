package one.zrp.social.mobile.ui.music

import android.content.ContentResolver
import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import one.zrp.social.mobile.data.MediaUploadRepository
import one.zrp.social.mobile.data.MusicRepository
import one.zrp.social.mobile.network.MusicAlbumSummary
import one.zrp.social.mobile.network.MusicArtistRef
import one.zrp.social.mobile.network.MusicTrack
import one.zrp.social.mobile.network.MusicTrackCount

data class StudioAlbumsUiState(
    val isLoading: Boolean = true,
    val albums: List<MusicAlbumSummary> = emptyList(),
    val tracks: List<MusicTrack> = emptyList(),

    // Create-album modal
    val isCreateModalOpen: Boolean = false,
    val createTitle: String = "",
    val createDescription: String = "",
    val createReleaseDate: String = "",
    val createCoverUrl: String? = null,
    val isCreateCoverUploading: Boolean = false,
    val isSavingCreate: Boolean = false,
    val createError: String? = null,
    val createTitleRequired: Boolean = false,

    // Manage-album modal (metadata edit + track membership/reorder)
    val managingAlbum: MusicAlbumSummary? = null,
    val editTitle: String = "",
    val editDescription: String = "",
    val editReleaseDate: String = "",
    val editCoverUrl: String? = null,
    val isEditCoverUploading: Boolean = false,
    val isSavingEdit: Boolean = false,
    val editError: String? = null,
    val editTitleRequired: Boolean = false,
    val isReordering: Boolean = false,

    // Delete confirm
    val deletingAlbum: MusicAlbumSummary? = null,
    val isDeleting: Boolean = false,

    val message: String? = null,
)

/**
 * Music Studio's Albums tab (Studio phase C) - the same real GET/POST
 * /music/albums, PATCH/DELETE /music/albums/{id}, POST
 * /music/albums/{id}/reorder MusicStudio.tsx's own AlbumsTab/
 * CreateAlbumModal/ManageAlbumModal use. Adding or removing a track from
 * an album, and setting its position within one, both go through the
 * same real PATCH /music/tracks/{id} the Tracks tab's own edit flow
 * uses (albumId + trackNumber), matching MusicStudio.tsx's own
 * addTrack()/removeTrack()/move() exactly.
 *
 * The same deliberate improvement as TracksViewModel's own publish():
 * MusicStudio.tsx's CreateAlbumModal.create() always re-upserts the
 * artist row with an empty body, which - because that upsert's own
 * update clause sets every field unconditionally - silently wipes an
 * already-saved bio/avatar/banner back to null on every single album
 * created. This checks for an existing profile first and only touches
 * the artist row when one doesn't exist yet.
 */
class StudioAlbumsViewModel(
    private val repository: MusicRepository,
    private val mediaUploadRepository: MediaUploadRepository = MediaUploadRepository(),
) : ViewModel() {
    private val _state = MutableStateFlow(StudioAlbumsUiState())
    val state: StateFlow<StudioAlbumsUiState> = _state.asStateFlow()

    init {
        loadAlbums()
        loadTracks()
    }

    private fun loadAlbums() {
        viewModelScope.launch {
            _state.update { it.copy(isLoading = true) }
            repository.getMyAlbums()
                .onSuccess { albums -> _state.update { it.copy(albums = albums, isLoading = false) } }
                .onFailure { _state.update { it.copy(isLoading = false) } }
        }
    }

    private fun loadTracks() {
        viewModelScope.launch {
            repository.getMyTracks().onSuccess { tracks -> _state.update { it.copy(tracks = tracks) } }
        }
    }

    fun consumeMessage() {
        _state.update { it.copy(message = null) }
    }

    // ── Create ──────────────────────────────────────────────────────
    fun onOpenCreate() {
        _state.update {
            it.copy(
                isCreateModalOpen = true,
                createTitle = "",
                createDescription = "",
                createReleaseDate = "",
                createCoverUrl = null,
                createError = null,
                createTitleRequired = false,
            )
        }
    }

    fun onCloseCreate() {
        _state.update { it.copy(isCreateModalOpen = false) }
    }

    fun onCreateTitleChange(title: String) {
        _state.update { it.copy(createTitle = title, createTitleRequired = false) }
    }

    fun onCreateDescriptionChange(description: String) {
        _state.update { it.copy(createDescription = description) }
    }

    fun onCreateReleaseDateChange(date: String) {
        _state.update { it.copy(createReleaseDate = date) }
    }

    fun onCreateCoverPicked(contentResolver: ContentResolver, picked: PickedFile) {
        _state.update { it.copy(isCreateCoverUploading = true, createError = null) }
        viewModelScope.launch {
            mediaUploadRepository.upload(
                slug = "musicTrack",
                contentResolver = contentResolver,
                uri = picked.uri,
                fileName = picked.fileName,
                mimeType = picked.mimeType,
                size = picked.size,
                onProgress = {},
            ).onSuccess { uploaded ->
                _state.update { it.copy(isCreateCoverUploading = false, createCoverUrl = uploaded.url) }
            }.onFailure { error ->
                _state.update { it.copy(isCreateCoverUploading = false, createError = error.message) }
            }
        }
    }

    fun createAlbum() {
        val s = _state.value
        if (s.createTitle.isBlank()) {
            _state.update { it.copy(createTitleRequired = true) }
            return
        }
        _state.update { it.copy(isSavingCreate = true, createError = null) }
        viewModelScope.launch {
            val existingProfile = repository.getMyArtistProfile().getOrNull()
            val artistRef: MusicArtistRef
            val artistId: String
            if (existingProfile != null) {
                artistId = existingProfile.id
                artistRef = MusicArtistRef(existingProfile.id, existingProfile.displayName, existingProfile.avatarUrl)
            } else {
                val created = repository.saveArtistProfile(
                    displayName = null,
                    bio = null,
                    avatarUrl = null,
                    bannerUrl = null,
                ).getOrElse { error ->
                    _state.update { it.copy(isSavingCreate = false, createError = error.message) }
                    return@launch
                }
                artistId = created.id
                artistRef = MusicArtistRef(created.id, created.displayName, created.avatarUrl)
            }

            val current = _state.value
            repository.createAlbum(
                artistId = artistId,
                title = current.createTitle.trim(),
                description = current.createDescription.trim().ifEmpty { null },
                coverUrl = current.createCoverUrl,
                coverKey = null,
                releaseDate = current.createReleaseDate.ifEmpty { null },
            ).onSuccess { created ->
                val summary = MusicAlbumSummary(
                    id = created.id,
                    title = created.title,
                    coverUrl = created.coverUrl,
                    artist = artistRef,
                    totalDurationSec = 0,
                    _count = MusicTrackCount(0),
                    description = created.description,
                    coverKey = created.coverKey,
                    releaseDate = created.releaseDate,
                )
                _state.update {
                    it.copy(
                        isSavingCreate = false,
                        isCreateModalOpen = false,
                        albums = listOf(summary) + it.albums,
                        message = "created",
                    )
                }
            }.onFailure { error ->
                _state.update { it.copy(isSavingCreate = false, createError = error.message) }
            }
        }
    }

    // ── Manage (metadata + track membership/reorder) ───────────────
    fun onStartManage(album: MusicAlbumSummary) {
        _state.update {
            it.copy(
                managingAlbum = album,
                editTitle = album.title,
                editDescription = album.description ?: "",
                editReleaseDate = album.releaseDate?.take(10) ?: "",
                editCoverUrl = album.coverUrl,
                editError = null,
                editTitleRequired = false,
            )
        }
    }

    fun onCancelManage() {
        _state.update { it.copy(managingAlbum = null) }
    }

    fun onEditTitleChange(title: String) {
        _state.update { it.copy(editTitle = title, editTitleRequired = false) }
    }

    fun onEditDescriptionChange(description: String) {
        _state.update { it.copy(editDescription = description) }
    }

    fun onEditReleaseDateChange(date: String) {
        _state.update { it.copy(editReleaseDate = date) }
    }

    fun onEditCoverPicked(contentResolver: ContentResolver, picked: PickedFile) {
        _state.update { it.copy(isEditCoverUploading = true, editError = null) }
        viewModelScope.launch {
            mediaUploadRepository.upload(
                slug = "musicTrack",
                contentResolver = contentResolver,
                uri = picked.uri,
                fileName = picked.fileName,
                mimeType = picked.mimeType,
                size = picked.size,
                onProgress = {},
            ).onSuccess { uploaded ->
                _state.update { it.copy(isEditCoverUploading = false, editCoverUrl = uploaded.url) }
            }.onFailure { error ->
                _state.update { it.copy(isEditCoverUploading = false, editError = error.message) }
            }
        }
    }

    fun saveAlbumMetadata() {
        val album = _state.value.managingAlbum ?: return
        if (_state.value.editTitle.isBlank()) {
            _state.update { it.copy(editTitleRequired = true) }
            return
        }
        _state.update { it.copy(isSavingEdit = true, editError = null) }
        viewModelScope.launch {
            val s = _state.value
            repository.updateAlbum(
                id = album.id,
                title = s.editTitle.trim(),
                description = s.editDescription.trim().ifEmpty { null },
                coverUrl = s.editCoverUrl,
                coverKey = null,
                releaseDate = s.editReleaseDate.ifEmpty { null },
            ).onSuccess { updated ->
                _state.update { current ->
                    current.copy(
                        isSavingEdit = false,
                        managingAlbum = updated,
                        albums = current.albums.map { if (it.id == updated.id) updated else it },
                    )
                }
            }.onFailure { error ->
                _state.update { it.copy(isSavingEdit = false, editError = error.message) }
            }
        }
    }

    fun addTrackToAlbum(track: MusicTrack) {
        val album = _state.value.managingAlbum ?: return
        val nextPosition = _state.value.tracks.count { it.albumId == album.id } + 1
        viewModelScope.launch {
            repository.updateTrack(id = track.id, albumId = album.id, trackNumber = nextPosition).onSuccess {
                loadTracks()
                loadAlbums()
            }
        }
    }

    fun removeTrackFromAlbum(track: MusicTrack) {
        viewModelScope.launch {
            repository.updateTrack(id = track.id, albumId = null).onSuccess {
                loadTracks()
                loadAlbums()
            }
        }
    }

    fun moveTrack(index: Int, direction: Int) {
        val album = _state.value.managingAlbum ?: return
        val albumTracks = _state.value.tracks
            .filter { it.albumId == album.id }
            .sortedBy { it.trackNumber ?: Int.MAX_VALUE }
        val target = index + direction
        if (target < 0 || target >= albumTracks.size) return

        val reordered = albumTracks.toMutableList()
        val moved = reordered.removeAt(index)
        reordered.add(target, moved)
        val renumbered = reordered.mapIndexed { i, tr -> tr.copy(trackNumber = i + 1) }

        _state.update { s ->
            s.copy(
                tracks = s.tracks.map { t -> renumbered.find { it.id == t.id } ?: t },
                isReordering = true,
            )
        }
        viewModelScope.launch {
            repository.reorderAlbumTracks(album.id, renumbered.map { it.id })
            _state.update { it.copy(isReordering = false) }
        }
    }

    // ── Delete ───────────────────────────────────────────────────────
    fun onStartDelete(album: MusicAlbumSummary) {
        _state.update { it.copy(deletingAlbum = album) }
    }

    fun onCancelDelete() {
        _state.update { it.copy(deletingAlbum = null) }
    }

    fun confirmDeleteAlbum() {
        val album = _state.value.deletingAlbum ?: return
        _state.update { it.copy(isDeleting = true) }
        viewModelScope.launch {
            repository.deleteAlbum(album.id).onSuccess {
                _state.update { current ->
                    current.copy(
                        isDeleting = false,
                        deletingAlbum = null,
                        albums = current.albums.filterNot { it.id == album.id },
                        // Matches the server's own DELETE route: tracks in
                        // the album are unassigned, never deleted.
                        tracks = current.tracks.map { if (it.albumId == album.id) it.copy(albumId = null, trackNumber = null) else it },
                        message = "deleted",
                    )
                }
            }.onFailure { error ->
                _state.update { it.copy(isDeleting = false, editError = error.message) }
            }
        }
    }
}

class StudioAlbumsViewModelFactory(private val repository: MusicRepository) : ViewModelProvider.Factory {
    @Suppress("UNCHECKED_CAST")
    override fun <T : ViewModel> create(modelClass: Class<T>): T {
        return StudioAlbumsViewModel(repository) as T
    }
}
