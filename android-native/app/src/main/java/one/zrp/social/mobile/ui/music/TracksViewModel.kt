package one.zrp.social.mobile.ui.music

import android.content.ContentResolver
import android.media.MediaMetadataRetriever
import android.net.Uri
import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import one.zrp.social.mobile.data.MediaUploadRepository
import one.zrp.social.mobile.data.MusicRepository
import one.zrp.social.mobile.network.MusicAlbumSummary
import one.zrp.social.mobile.network.MusicTrack

data class PickedFile(val uri: Uri, val fileName: String, val mimeType: String, val size: Long)

data class TracksUiState(
    val isLoading: Boolean = true,
    val tracks: List<MusicTrack> = emptyList(),
    val albums: List<MusicAlbumSummary> = emptyList(),
    // Null while the artist-profile lookup is still in flight; false
    // only once confirmed absent. The upload form's own artist-name
    // field is shown only then - once a profile exists it's ignored,
    // see StudioViewModel-adjacent publish() KDoc for why.
    val hasArtistProfile: Boolean? = null,

    // Upload form
    val artistNameOverride: String = "",
    val title: String = "",
    val genre: String = "",
    val explicit: Boolean = false,
    val audioPick: PickedFile? = null,
    val durationSec: Int? = null,
    val coverPick: PickedFile? = null,
    val isPublishing: Boolean = false,
    val publishError: String? = null,
    // Set once that step's real upload has actually succeeded, so a
    // retry after a later failure never re-uploads the same (possibly
    // large, slow-on-mobile) file - the same real risk
    // MusicStudio.tsx's own PendingUpload protects against, just
    // tracked per-file here instead of as one combined object, since
    // this screen uploads audio and cover as two separate real
    // UploadThing calls rather than one batched one.
    val pendingAudioUrl: String? = null,
    val pendingCoverUrl: String? = null,

    // Edit modal
    val editingTrack: MusicTrack? = null,
    val editTitle: String = "",
    val editDescription: String = "",
    val editGenre: String = "",
    val editExplicit: Boolean = false,
    val editAlbumId: String? = null,
    val editCoverUrl: String? = null,
    val isEditCoverUploading: Boolean = false,
    val isSavingEdit: Boolean = false,
    val editError: String? = null,
    val editTitleRequired: Boolean = false,

    // Delete confirm
    val deletingTrack: MusicTrack? = null,
    val isDeleting: Boolean = false,

    val message: String? = null,
)

/**
 * Music Studio's Tracks tab (Studio phase B) - the same real POST
 * /music/tracks, GET /music/tracks?mine=true, PATCH/DELETE
 * /music/tracks/{id} MusicStudio.tsx's own TracksTab/EditTrackModal
 * use, and the same real "musicTrack" UploadThing slug for both audio
 * and cover art.
 *
 * One deliberate improvement over the real web flow: MusicStudio.tsx's
 * own publish() always re-upserts the artist row with only a
 * displayName, which - because that upsert's own update clause sets
 * every field unconditionally - silently wipes an already-saved bio/
 * avatar/banner back to null on every single track published. This
 * checks for an existing profile first and only touches the artist row
 * (via the same real POST /music/artists) when one doesn't exist yet,
 * so a Creator-status user with no artist profile can still bootstrap
 * one at publish time, but publishing never again clobbers a profile
 * that's already been filled in via the Artist Profile tab.
 */
class TracksViewModel(
    private val repository: MusicRepository,
    private val mediaUploadRepository: MediaUploadRepository = MediaUploadRepository(),
) : ViewModel() {
    private val _state = MutableStateFlow(TracksUiState())
    val state: StateFlow<TracksUiState> = _state.asStateFlow()

    init {
        loadTracks()
        loadAlbums()
        checkArtistProfile()
    }

    private fun loadTracks() {
        viewModelScope.launch {
            _state.update { it.copy(isLoading = true) }
            repository.getMyTracks()
                .onSuccess { tracks -> _state.update { it.copy(tracks = tracks, isLoading = false) } }
                .onFailure { _state.update { it.copy(isLoading = false) } }
        }
    }

    private fun loadAlbums() {
        viewModelScope.launch {
            repository.getMyAlbums().onSuccess { albums -> _state.update { it.copy(albums = albums) } }
        }
    }

    private fun checkArtistProfile() {
        viewModelScope.launch {
            repository.getMyArtistProfile().onSuccess { profile ->
                _state.update { it.copy(hasArtistProfile = profile != null) }
            }
        }
    }

    fun onArtistNameChange(name: String) {
        _state.update { it.copy(artistNameOverride = name) }
    }

    fun onTitleChange(title: String) {
        _state.update { it.copy(title = title) }
    }

    fun onGenreChange(genre: String) {
        _state.update { it.copy(genre = genre) }
    }

    fun onExplicitChange(explicit: Boolean) {
        _state.update { it.copy(explicit = explicit) }
    }

    fun onAudioPicked(contentResolver: ContentResolver, picked: PickedFile) {
        _state.update { it.copy(audioPick = picked, durationSec = null, pendingAudioUrl = null, publishError = null) }
        viewModelScope.launch {
            val duration = probeAudioDurationSec(contentResolver, picked.uri)
            _state.update { it.copy(durationSec = duration) }
        }
    }

    fun onCoverPicked(picked: PickedFile) {
        _state.update { it.copy(coverPick = picked, pendingCoverUrl = null, publishError = null) }
    }

    fun discardUpload() {
        _state.update {
            it.copy(
                audioPick = null,
                durationSec = null,
                coverPick = null,
                pendingAudioUrl = null,
                pendingCoverUrl = null,
                publishError = null,
            )
        }
    }

    fun publish(contentResolver: ContentResolver) {
        val snapshot = _state.value
        if (snapshot.isPublishing) return
        if (snapshot.pendingAudioUrl == null && (snapshot.audioPick == null || snapshot.title.isBlank())) return

        _state.update { it.copy(isPublishing = true, publishError = null) }
        viewModelScope.launch {
            var audioUrl = snapshot.pendingAudioUrl
            if (audioUrl == null) {
                val pick = snapshot.audioPick!!
                val uploaded = mediaUploadRepository.upload(
                    slug = "musicTrack",
                    contentResolver = contentResolver,
                    uri = pick.uri,
                    fileName = pick.fileName,
                    mimeType = pick.mimeType,
                    size = pick.size,
                    onProgress = {},
                ).getOrElse { error ->
                    _state.update { it.copy(isPublishing = false, publishError = error.message) }
                    return@launch
                }
                audioUrl = uploaded.url
                _state.update { it.copy(pendingAudioUrl = audioUrl) }
            }

            var coverUrl = _state.value.pendingCoverUrl
            val coverPick = _state.value.coverPick
            if (coverUrl == null && coverPick != null) {
                val uploaded = mediaUploadRepository.upload(
                    slug = "musicTrack",
                    contentResolver = contentResolver,
                    uri = coverPick.uri,
                    fileName = coverPick.fileName,
                    mimeType = coverPick.mimeType,
                    size = coverPick.size,
                    onProgress = {},
                ).getOrElse { error ->
                    _state.update { it.copy(isPublishing = false, publishError = error.message) }
                    return@launch
                }
                coverUrl = uploaded.url
                _state.update { it.copy(pendingCoverUrl = coverUrl) }
            }

            val existingProfile = repository.getMyArtistProfile().getOrNull()
            val artistId = if (existingProfile != null) {
                existingProfile.id
            } else {
                val created = repository.saveArtistProfile(
                    displayName = _state.value.artistNameOverride.trim().ifEmpty { null },
                    bio = null,
                    avatarUrl = null,
                    bannerUrl = null,
                ).getOrElse { error ->
                    _state.update { it.copy(isPublishing = false, publishError = error.message) }
                    return@launch
                }
                _state.update { it.copy(hasArtistProfile = true) }
                created.id
            }

            val current = _state.value
            repository.createTrack(
                title = current.title.trim(),
                genre = current.genre.trim().ifEmpty { null },
                explicit = current.explicit,
                audioUrl = audioUrl,
                audioKey = null,
                coverUrl = coverUrl,
                coverKey = null,
                durationSec = current.durationSec,
                artistId = artistId,
            ).onSuccess {
                _state.update {
                    it.copy(
                        isPublishing = false,
                        title = "",
                        genre = "",
                        explicit = false,
                        audioPick = null,
                        durationSec = null,
                        coverPick = null,
                        pendingAudioUrl = null,
                        pendingCoverUrl = null,
                        message = "published",
                    )
                }
                loadTracks()
            }.onFailure { error ->
                _state.update { it.copy(isPublishing = false, publishError = error.message) }
            }
        }
    }

    fun consumeMessage() {
        _state.update { it.copy(message = null) }
    }

    fun onStartEdit(track: MusicTrack) {
        _state.update {
            it.copy(
                editingTrack = track,
                editTitle = track.title,
                editDescription = track.description ?: "",
                editGenre = track.genre ?: "",
                editExplicit = track.explicit,
                editAlbumId = track.albumId,
                editCoverUrl = track.coverUrl,
                editError = null,
                editTitleRequired = false,
            )
        }
    }

    fun onCancelEdit() {
        _state.update { it.copy(editingTrack = null) }
    }

    fun onEditTitleChange(title: String) {
        _state.update { it.copy(editTitle = title, editTitleRequired = false) }
    }

    fun onEditDescriptionChange(description: String) {
        _state.update { it.copy(editDescription = description) }
    }

    fun onEditGenreChange(genre: String) {
        _state.update { it.copy(editGenre = genre) }
    }

    fun onEditExplicitChange(explicit: Boolean) {
        _state.update { it.copy(editExplicit = explicit) }
    }

    fun onEditAlbumChange(albumId: String?) {
        _state.update { it.copy(editAlbumId = albumId) }
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

    fun saveEdit() {
        val track = _state.value.editingTrack ?: return
        if (_state.value.editTitle.isBlank()) {
            _state.update { it.copy(editTitleRequired = true) }
            return
        }
        _state.update { it.copy(isSavingEdit = true, editError = null, editTitleRequired = false) }
        viewModelScope.launch {
            val s = _state.value
            repository.updateTrack(
                id = track.id,
                title = s.editTitle.trim(),
                description = s.editDescription.trim().ifEmpty { null },
                genre = s.editGenre.trim().ifEmpty { null },
                explicit = s.editExplicit,
                coverUrl = s.editCoverUrl,
                coverKey = null,
                albumId = s.editAlbumId,
            ).onSuccess { updated ->
                _state.update { current ->
                    current.copy(
                        isSavingEdit = false,
                        editingTrack = null,
                        tracks = current.tracks.map { if (it.id == updated.id) updated else it },
                        message = "updated",
                    )
                }
            }.onFailure { error ->
                _state.update { it.copy(isSavingEdit = false, editError = error.message) }
            }
        }
    }

    fun onStartDelete(track: MusicTrack) {
        _state.update { it.copy(deletingTrack = track) }
    }

    fun onCancelDelete() {
        _state.update { it.copy(deletingTrack = null) }
    }

    fun confirmDelete() {
        val track = _state.value.deletingTrack ?: return
        _state.update { it.copy(isDeleting = true) }
        viewModelScope.launch {
            repository.deleteTrack(track.id)
                .onSuccess {
                    _state.update { current ->
                        current.copy(
                            isDeleting = false,
                            deletingTrack = null,
                            tracks = current.tracks.filterNot { it.id == track.id },
                            message = "deleted",
                        )
                    }
                }
                .onFailure { error ->
                    _state.update { it.copy(isDeleting = false, editError = error.message) }
                }
        }
    }
}

// Reads a track's length straight from the picked file before it's
// even uploaded, matching probeAudioDuration's own real reason for
// existing (MusicTrack.durationSec silently never got set otherwise,
// showing "--:--" everywhere regardless of platform). Explicit
// try/finally + release() rather than MediaMetadataRetriever's own
// Closeable/.use{} - that interface was only added in API 29, below
// this app's own minSdk 24, so .use{} would crash at runtime on an
// older device despite compiling fine against a newer SDK.
private suspend fun probeAudioDurationSec(contentResolver: ContentResolver, uri: Uri): Int? = withContext(Dispatchers.IO) {
    runCatching {
        val pfd = contentResolver.openFileDescriptor(uri, "r") ?: return@withContext null
        val retriever = MediaMetadataRetriever()
        try {
            pfd.use { retriever.setDataSource(it.fileDescriptor) }
            val millis = retriever.extractMetadata(MediaMetadataRetriever.METADATA_KEY_DURATION)?.toLongOrNull()
            millis?.let { (it / 1000).toInt() }?.takeIf { it > 0 }
        } finally {
            retriever.release()
        }
    }.getOrNull()
}

class TracksViewModelFactory(private val repository: MusicRepository) : ViewModelProvider.Factory {
    @Suppress("UNCHECKED_CAST")
    override fun <T : ViewModel> create(modelClass: Class<T>): T {
        return TracksViewModel(repository) as T
    }
}
