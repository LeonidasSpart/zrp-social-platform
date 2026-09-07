package one.zrp.social.mobile.ui.music

import android.content.ContentResolver
import android.net.Uri
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
import one.zrp.social.mobile.network.MusicAccess

data class StudioUiState(
    val isLoadingAccess: Boolean = true,
    val access: MusicAccess? = null,
    val applyName: String = "",
    val isApplying: Boolean = false,
    val isLoadingProfile: Boolean = false,
    val displayName: String = "",
    val bio: String = "",
    val avatarUrl: String? = null,
    val bannerUrl: String? = null,
    val isAvatarUploading: Boolean = false,
    val isBannerUploading: Boolean = false,
    val isSaving: Boolean = false,
    val error: String? = null,
    val saved: Boolean = false,
)

/**
 * The Music Studio's Artist Profile tab - the first Studio slice
 * natively. Real GET /music/access (same gate MusicStudio.tsx's own
 * !access?.allowed branch uses), real POST /music/artists both to
 * apply (an unverified profile - access.allowed stays false until ZRP
 * staff verifies it, same as web) and to save an already-allowed
 * artist's own profile (one real upsert route on the wire either way).
 * Avatar/banner uploads go through the same real UploadThing protocol
 * (MediaUploadRepository) as the Create tab's own media, just against
 * the "avatar"/"banner" slugs ArtistTab.tsx itself uploads to.
 */
class StudioViewModel(
    private val repository: MusicRepository,
    private val mediaUploadRepository: MediaUploadRepository = MediaUploadRepository(),
) : ViewModel() {
    private val _state = MutableStateFlow(StudioUiState())
    val state: StateFlow<StudioUiState> = _state.asStateFlow()

    init {
        loadAccess()
    }

    private fun loadAccess() {
        viewModelScope.launch {
            _state.update { it.copy(isLoadingAccess = true) }
            repository.getAccess()
                .onSuccess { access ->
                    _state.update { it.copy(access = access, isLoadingAccess = false) }
                    if (access.allowed) loadProfile()
                }
                .onFailure { _state.update { it.copy(isLoadingAccess = false) } }
        }
    }

    private fun loadProfile() {
        viewModelScope.launch {
            _state.update { it.copy(isLoadingProfile = true) }
            repository.getMyArtistProfile()
                .onSuccess { profile ->
                    _state.update {
                        it.copy(
                            isLoadingProfile = false,
                            displayName = profile?.displayName ?: it.displayName,
                            bio = profile?.bio ?: "",
                            avatarUrl = profile?.avatarUrl,
                            bannerUrl = profile?.bannerUrl,
                        )
                    }
                }
                .onFailure { _state.update { it.copy(isLoadingProfile = false) } }
        }
    }

    fun onApplyNameChange(name: String) {
        _state.update { it.copy(applyName = name) }
    }

    fun applyForArtist() {
        val name = _state.value.applyName.trim()
        if (name.isEmpty() || _state.value.isApplying) return
        _state.update { it.copy(isApplying = true) }
        viewModelScope.launch {
            repository.saveArtistProfile(displayName = name, bio = null, avatarUrl = null, bannerUrl = null)
                .onSuccess {
                    _state.update { it.copy(isApplying = false, applyName = "") }
                    loadAccess()
                }
                .onFailure { error ->
                    _state.update { it.copy(isApplying = false, error = error.message) }
                }
        }
    }

    fun onDisplayNameChange(name: String) {
        _state.update { it.copy(displayName = name) }
    }

    fun onBioChange(bio: String) {
        _state.update { it.copy(bio = bio) }
    }

    fun onAvatarPicked(contentResolver: ContentResolver, uri: Uri, fileName: String, mimeType: String, size: Long) {
        uploadImage(slug = "avatar", contentResolver, uri, fileName, mimeType, size) { url ->
            _state.update { it.copy(avatarUrl = url) }
        }
    }

    fun onBannerPicked(contentResolver: ContentResolver, uri: Uri, fileName: String, mimeType: String, size: Long) {
        uploadImage(slug = "banner", contentResolver, uri, fileName, mimeType, size) { url ->
            _state.update { it.copy(bannerUrl = url) }
        }
    }

    private fun uploadImage(
        slug: String,
        contentResolver: ContentResolver,
        uri: Uri,
        fileName: String,
        mimeType: String,
        size: Long,
        onUrl: (String) -> Unit,
    ) {
        val isAvatar = slug == "avatar"
        _state.update {
            if (isAvatar) it.copy(isAvatarUploading = true, error = null) else it.copy(isBannerUploading = true, error = null)
        }
        viewModelScope.launch {
            mediaUploadRepository.upload(
                slug = slug,
                contentResolver = contentResolver,
                uri = uri,
                fileName = fileName,
                mimeType = mimeType,
                size = size,
                onProgress = {},
            ).onSuccess { uploaded ->
                onUrl(uploaded.url)
                _state.update {
                    if (isAvatar) it.copy(isAvatarUploading = false) else it.copy(isBannerUploading = false)
                }
            }.onFailure { error ->
                _state.update {
                    val next = if (isAvatar) it.copy(isAvatarUploading = false) else it.copy(isBannerUploading = false)
                    next.copy(error = error.message)
                }
            }
        }
    }

    fun save() {
        if (_state.value.isSaving) return
        _state.update { it.copy(isSaving = true, error = null, saved = false) }
        viewModelScope.launch {
            val current = _state.value
            repository.saveArtistProfile(
                displayName = current.displayName.trim().ifEmpty { null },
                bio = current.bio.trim().ifEmpty { null },
                avatarUrl = current.avatarUrl,
                bannerUrl = current.bannerUrl,
            ).onSuccess { profile ->
                _state.update {
                    it.copy(
                        isSaving = false,
                        saved = true,
                        displayName = profile.displayName,
                        bio = profile.bio ?: "",
                        avatarUrl = profile.avatarUrl,
                        bannerUrl = profile.bannerUrl,
                    )
                }
            }.onFailure { error ->
                _state.update { it.copy(isSaving = false, error = error.message) }
            }
        }
    }
}

class StudioViewModelFactory(private val repository: MusicRepository) : ViewModelProvider.Factory {
    @Suppress("UNCHECKED_CAST")
    override fun <T : ViewModel> create(modelClass: Class<T>): T {
        return StudioViewModel(repository) as T
    }
}
