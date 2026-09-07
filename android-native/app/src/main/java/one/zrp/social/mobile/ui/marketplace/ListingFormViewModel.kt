package one.zrp.social.mobile.ui.marketplace

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
import one.zrp.social.mobile.data.MarketplaceRepository
import one.zrp.social.mobile.data.MediaUploadRepository

data class PickedFile(val uri: Uri, val fileName: String, val mimeType: String, val size: Long)

data class ListingFormUiState(
    val isLoadingExisting: Boolean = false,
    val notAllowed: Boolean = false,
    val category: String = "",
    val title: String = "",
    val description: String = "",
    val priceOnRequest: Boolean = false,
    val price: String = "",
    val currency: String = "USD",
    val location: String = "",
    val imageUrls: List<String> = emptyList(),
    val isUploadingImage: Boolean = false,
    val videoUrl: String? = null,
    val isUploadingVideo: Boolean = false,
    val isSubmitting: Boolean = false,
    val error: String? = null,
)

/**
 * Shared by both Create Listing and Edit Listing - the same real
 * shape src/components/ListingForm.tsx already shares between
 * NewListingPage (POST /listings) and EditListingPage (PUT
 * /listings/{id}), including the exact same category-required/photo-
 * required client-side checks (everything else is left to the
 * server's own validation, matching ListingForm.tsx's own reliance on
 * plain HTML `required` inputs for the rest). Photos and video upload
 * through the real "listingMedia" UploadThing slug, one file per call
 * (this app's MediaUploadRepository only ever uploads a single file
 * per call) rather than web's own batched multi-file startUpload -
 * functionally equivalent, matching the same native simplification
 * already used for Music Studio's track/cover uploads.
 */
class ListingFormViewModel(
    private val editingListingId: String?,
    private val repository: MarketplaceRepository,
    private val mediaUploadRepository: MediaUploadRepository = MediaUploadRepository(),
) : ViewModel() {
    private val _state = MutableStateFlow(ListingFormUiState(isLoadingExisting = editingListingId != null))
    val state: StateFlow<ListingFormUiState> = _state.asStateFlow()

    val isEditMode: Boolean get() = editingListingId != null

    init {
        if (editingListingId != null) loadExisting(editingListingId)
    }

    private fun loadExisting(id: String) {
        viewModelScope.launch {
            val ownUserId = repository.getOwnUserId().getOrNull()
            repository.getListing(id)
                .onSuccess { listing ->
                    if (ownUserId != listing.seller.id) {
                        _state.update { it.copy(isLoadingExisting = false, notAllowed = true) }
                        return@onSuccess
                    }
                    _state.update {
                        it.copy(
                            isLoadingExisting = false,
                            category = listing.category,
                            title = listing.title,
                            description = listing.description,
                            priceOnRequest = listing.priceOnRequest,
                            price = listing.price?.toString() ?: "",
                            currency = listing.currency,
                            location = listing.location ?: "",
                            imageUrls = listing.imageUrls,
                            videoUrl = listing.videoUrl,
                        )
                    }
                }
                .onFailure {
                    _state.update { it.copy(isLoadingExisting = false, notAllowed = true) }
                }
        }
    }

    fun onCategoryChange(category: String) {
        _state.update { it.copy(category = category) }
    }

    fun onTitleChange(title: String) {
        _state.update { it.copy(title = title) }
    }

    fun onDescriptionChange(description: String) {
        _state.update { it.copy(description = description) }
    }

    fun onPriceOnRequestChange(priceOnRequest: Boolean) {
        _state.update { it.copy(priceOnRequest = priceOnRequest) }
    }

    fun onPriceChange(price: String) {
        _state.update { it.copy(price = price) }
    }

    fun onCurrencyChange(currency: String) {
        _state.update { it.copy(currency = currency) }
    }

    fun onLocationChange(location: String) {
        _state.update { it.copy(location = location) }
    }

    fun onImagePicked(contentResolver: ContentResolver, picked: PickedFile) {
        _state.update { it.copy(isUploadingImage = true, error = null) }
        viewModelScope.launch {
            mediaUploadRepository.upload(
                slug = "listingMedia",
                contentResolver = contentResolver,
                uri = picked.uri,
                fileName = picked.fileName,
                mimeType = picked.mimeType,
                size = picked.size,
                onProgress = {},
            ).onSuccess { uploaded ->
                _state.update { it.copy(isUploadingImage = false, imageUrls = it.imageUrls + uploaded.url) }
            }.onFailure { error ->
                _state.update { it.copy(isUploadingImage = false, error = error.message) }
            }
        }
    }

    fun onRemoveImage(index: Int) {
        _state.update { it.copy(imageUrls = it.imageUrls.filterIndexed { i, _ -> i != index }) }
    }

    fun onVideoPicked(contentResolver: ContentResolver, picked: PickedFile) {
        _state.update { it.copy(isUploadingVideo = true, error = null) }
        viewModelScope.launch {
            mediaUploadRepository.upload(
                slug = "listingMedia",
                contentResolver = contentResolver,
                uri = picked.uri,
                fileName = picked.fileName,
                mimeType = picked.mimeType,
                size = picked.size,
                onProgress = {},
            ).onSuccess { uploaded ->
                _state.update { it.copy(isUploadingVideo = false, videoUrl = uploaded.url) }
            }.onFailure { error ->
                _state.update { it.copy(isUploadingVideo = false, error = error.message) }
            }
        }
    }

    fun onRemoveVideo() {
        _state.update { it.copy(videoUrl = null) }
    }

    fun submit(onSuccess: (listingId: String) -> Unit) {
        val s = _state.value
        if (s.category.isBlank()) {
            _state.update { it.copy(error = categoryRequiredError) }
            return
        }
        if (s.imageUrls.isEmpty()) {
            _state.update { it.copy(error = photoRequiredError) }
            return
        }

        _state.update { it.copy(isSubmitting = true, error = null) }
        viewModelScope.launch {
            val priceValue = if (s.priceOnRequest) null else s.price.toDoubleOrNull()
            val id = editingListingId
            val result = if (id != null) {
                repository.updateListing(
                    id = id,
                    category = s.category,
                    title = s.title.trim(),
                    description = s.description.trim(),
                    priceOnRequest = s.priceOnRequest,
                    price = priceValue,
                    currency = s.currency,
                    location = s.location.trim().ifEmpty { null },
                    imageUrls = s.imageUrls,
                    videoUrl = s.videoUrl,
                )
            } else {
                repository.createListing(
                    category = s.category,
                    title = s.title.trim(),
                    description = s.description.trim(),
                    priceOnRequest = s.priceOnRequest,
                    price = priceValue,
                    currency = s.currency,
                    location = s.location.trim().ifEmpty { null },
                    imageUrls = s.imageUrls,
                    videoUrl = s.videoUrl,
                )
            }
            result.onSuccess { listing ->
                _state.update { it.copy(isSubmitting = false) }
                onSuccess(listing.id)
            }.onFailure { error ->
                val fallback = if (id != null) updateFailedError else createFailedError
                _state.update { it.copy(isSubmitting = false, error = error.message ?: fallback) }
            }
        }
    }

    // The ViewModel layer can't resolve Android string resources
    // (established codebase convention) - these two client-side checks
    // mirror ListingForm.tsx's own errCategoryRequired/errPhotoRequired
    // exactly, so the Screen swaps in the real translated string for
    // this sentinel rather than showing English literally.
    companion object {
        const val categoryRequiredError = "categoryRequired"
        const val photoRequiredError = "photoRequired"
        const val createFailedError = "createFailed"
        const val updateFailedError = "updateFailed"
    }
}

class ListingFormViewModelFactory(
    private val editingListingId: String?,
    private val repository: MarketplaceRepository,
) : ViewModelProvider.Factory {
    @Suppress("UNCHECKED_CAST")
    override fun <T : ViewModel> create(modelClass: Class<T>): T {
        return ListingFormViewModel(editingListingId, repository) as T
    }
}
