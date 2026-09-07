package one.zrp.social.mobile.ui.aid

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
import one.zrp.social.mobile.data.AidRepository
import one.zrp.social.mobile.data.MediaUploadRepository

data class AidPickedFile(val uri: Uri, val fileName: String, val mimeType: String, val size: Long)

data class AidFormUiState(
    val isCheckingAccess: Boolean = true,
    val isOrganizer: Boolean = false,
    val category: String = "EMERGENCY",
    val needTypes: List<String> = emptyList(),
    val title: String = "",
    val description: String = "",
    val location: String = "",
    val goalAmount: String = "",
    val imageUrls: List<String> = emptyList(),
    val isUploadingImage: Boolean = false,
    val isSubmitting: Boolean = false,
    val error: String? = null,
)

/**
 * Create Campaign - ported from CreateCampaignPage.tsx. Organizer-only
 * (session.user.badgeType === "organization"), same as web's own gate.
 * proofUrls is always sent empty: the real create form never collects
 * proof photos either (CreateCampaignPage.tsx has no such field -
 * proofUrls only ever displays on the detail page from whatever an
 * admin/backend process sets), so this matches the real product rather
 * than building UI the web app itself doesn't have. No edit mode: the
 * real product has no /aid/edit/[id] page.
 */
class AidFormViewModel(
    private val repository: AidRepository,
    private val mediaUploadRepository: MediaUploadRepository = MediaUploadRepository(),
) : ViewModel() {
    private val _state = MutableStateFlow(AidFormUiState())
    val state: StateFlow<AidFormUiState> = _state.asStateFlow()

    init {
        viewModelScope.launch {
            val badgeType = repository.getOwnBadgeType().getOrNull()
            _state.update { it.copy(isCheckingAccess = false, isOrganizer = badgeType == "organization") }
        }
    }

    fun onCategoryChange(category: String) {
        _state.update { it.copy(category = category) }
    }

    fun onToggleNeedType(needType: String) {
        _state.update {
            val updated = if (it.needTypes.contains(needType)) it.needTypes - needType else it.needTypes + needType
            it.copy(needTypes = updated)
        }
    }

    fun onTitleChange(title: String) {
        _state.update { it.copy(title = title) }
    }

    fun onDescriptionChange(description: String) {
        _state.update { it.copy(description = description) }
    }

    fun onLocationChange(location: String) {
        _state.update { it.copy(location = location) }
    }

    fun onGoalAmountChange(goalAmount: String) {
        _state.update { it.copy(goalAmount = goalAmount) }
    }

    fun onImagePicked(contentResolver: ContentResolver, picked: AidPickedFile) {
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
                _state.update { it.copy(isUploadingImage = false, imageUrls = (it.imageUrls + uploaded.url).take(15)) }
            }.onFailure { error ->
                _state.update { it.copy(isUploadingImage = false, error = error.message ?: imageUploadFailedError) }
            }
        }
    }

    fun onRemoveImage(index: Int) {
        _state.update { it.copy(imageUrls = it.imageUrls.filterIndexed { i, _ -> i != index }) }
    }

    fun publish(onSuccess: (campaignId: String) -> Unit) {
        val s = _state.value
        if (s.title.isBlank()) {
            _state.update { it.copy(error = titleRequiredError) }
            return
        }
        if (s.description.isBlank()) {
            _state.update { it.copy(error = descriptionRequiredError) }
            return
        }
        if (s.needTypes.isEmpty()) {
            _state.update { it.copy(error = needTypeRequiredError) }
            return
        }
        val needsMoney = s.needTypes.contains("MONEY")
        val goalAmountValue = s.goalAmount.toDoubleOrNull()
        if (needsMoney && (goalAmountValue == null || goalAmountValue <= 0)) {
            _state.update { it.copy(error = goalAmountRequiredError) }
            return
        }

        _state.update { it.copy(isSubmitting = true, error = null) }
        viewModelScope.launch {
            repository.createCampaign(
                category = s.category,
                needTypes = s.needTypes,
                title = s.title.trim(),
                description = s.description.trim(),
                location = s.location.trim().ifEmpty { null },
                goalAmount = if (needsMoney) goalAmountValue else null,
                imageUrls = s.imageUrls,
                proofUrls = emptyList(),
            ).onSuccess { campaign ->
                _state.update { it.copy(isSubmitting = false) }
                onSuccess(campaign.id)
            }.onFailure { error ->
                _state.update { it.copy(isSubmitting = false, error = error.message ?: createFailedError) }
            }
        }
    }

    companion object {
        const val titleRequiredError = "titleRequired"
        const val descriptionRequiredError = "descriptionRequired"
        const val needTypeRequiredError = "needTypeRequired"
        const val goalAmountRequiredError = "goalAmountRequired"
        const val createFailedError = "createFailed"
        const val imageUploadFailedError = "imageUploadFailed"
    }
}

class AidFormViewModelFactory(
    private val repository: AidRepository,
) : ViewModelProvider.Factory {
    @Suppress("UNCHECKED_CAST")
    override fun <T : ViewModel> create(modelClass: Class<T>): T = AidFormViewModel(repository) as T
}
