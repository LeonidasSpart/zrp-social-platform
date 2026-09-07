package one.zrp.social.mobile.ui.opportunity

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
import one.zrp.social.mobile.data.OpportunityRepository
import one.zrp.social.mobile.network.OpportunityDetail

data class PickedResumeFile(val uri: Uri, val fileName: String, val mimeType: String, val size: Long)

data class OpportunityDetailUiState(
    val isLoading: Boolean = true,
    val notFound: Boolean = false,
    val listing: OpportunityDetail? = null,
    val ownUserId: String? = null,
    val saved: Boolean = false,
    val applied: Boolean = false,
    val justApplied: Boolean = false,
    val isApplyOpen: Boolean = false,
    val coverNote: String = "",
    val resumeUrl: String? = null,
    val resumeName: String? = null,
    val isUploadingResume: Boolean = false,
    val isSubmittingApply: Boolean = false,
    val applyError: String? = null,
    val isReportOpen: Boolean = false,
    val isReportSubmitting: Boolean = false,
    val reportError: String? = null,
    val reportSent: Boolean = false,
)

/**
 * A single opportunity listing - the same real GET /opportunity/{id},
 * POST/DELETE /opportunity/{id}/save, POST /opportunity/{id}/apply, and
 * POST /reports (with opportunityId) routes OpportunityListingPage uses.
 */
class OpportunityDetailViewModel(
    private val listingId: String,
    private val repository: OpportunityRepository,
    private val mediaUploadRepository: MediaUploadRepository = MediaUploadRepository(),
) : ViewModel() {
    private val _state = MutableStateFlow(OpportunityDetailUiState())
    val state: StateFlow<OpportunityDetailUiState> = _state.asStateFlow()

    init {
        load()
        viewModelScope.launch {
            repository.getOwnUserId().onSuccess { id -> _state.update { it.copy(ownUserId = id) } }
        }
    }

    private fun load() {
        _state.update { it.copy(isLoading = true, notFound = false) }
        viewModelScope.launch {
            repository.getListing(listingId)
                .onSuccess { listing ->
                    _state.update { it.copy(isLoading = false, listing = listing, applied = listing.alreadyApplied) }
                }
                .onFailure { _state.update { it.copy(isLoading = false, notFound = true) } }
        }
    }

    fun toggleSave() {
        val wasSaved = _state.value.saved
        _state.update { it.copy(saved = !wasSaved) }
        viewModelScope.launch {
            repository.setSaved(listingId, !wasSaved).onFailure {
                _state.update { it.copy(saved = wasSaved) }
            }
        }
    }

    fun onOpenApply() {
        _state.update { it.copy(isApplyOpen = true, applyError = null) }
    }

    fun onCancelApply() {
        _state.update { it.copy(isApplyOpen = false) }
    }

    fun onCoverNoteChange(value: String) {
        _state.update { it.copy(coverNote = value) }
    }

    fun onResumePicked(contentResolver: ContentResolver, picked: PickedResumeFile) {
        _state.update { it.copy(isUploadingResume = true, applyError = null) }
        viewModelScope.launch {
            mediaUploadRepository.upload(
                slug = "chatFile",
                contentResolver = contentResolver,
                uri = picked.uri,
                fileName = picked.fileName,
                mimeType = picked.mimeType,
                size = picked.size,
                onProgress = {},
            ).onSuccess { uploaded ->
                _state.update { it.copy(isUploadingResume = false, resumeUrl = uploaded.url, resumeName = picked.fileName) }
            }.onFailure { error ->
                _state.update { it.copy(isUploadingResume = false, applyError = error.message ?: resumeUploadFailedError) }
            }
        }
    }

    fun submitApply() {
        _state.update { it.copy(isSubmittingApply = true, applyError = null) }
        viewModelScope.launch {
            val s = _state.value
            repository.apply(listingId, coverNote = s.coverNote.trim().ifEmpty { null }, resumeUrl = s.resumeUrl)
                .onSuccess {
                    _state.update {
                        it.copy(isSubmittingApply = false, isApplyOpen = false, applied = true, justApplied = true)
                    }
                }
                .onFailure { error ->
                    _state.update { it.copy(isSubmittingApply = false, applyError = error.message ?: applyFailedError) }
                }
        }
    }

    fun onOpenReport() {
        _state.update { it.copy(isReportOpen = true, reportError = null) }
    }

    fun onCancelReport() {
        _state.update { it.copy(isReportOpen = false) }
    }

    fun submitReport(reason: String, details: String?) {
        _state.update { it.copy(isReportSubmitting = true, reportError = null) }
        viewModelScope.launch {
            repository.reportOpportunity(listingId, reason, details)
                .onSuccess {
                    _state.update { it.copy(isReportSubmitting = false, isReportOpen = false, reportSent = true) }
                }
                .onFailure { error -> _state.update { it.copy(isReportSubmitting = false, reportError = error.message) } }
        }
    }

    companion object {
        const val applyFailedError = "applyFailed"
        const val resumeUploadFailedError = "resumeUploadFailed"
    }
}

class OpportunityDetailViewModelFactory(
    private val listingId: String,
    private val repository: OpportunityRepository,
) : ViewModelProvider.Factory {
    @Suppress("UNCHECKED_CAST")
    override fun <T : ViewModel> create(modelClass: Class<T>): T = OpportunityDetailViewModel(listingId, repository) as T
}
