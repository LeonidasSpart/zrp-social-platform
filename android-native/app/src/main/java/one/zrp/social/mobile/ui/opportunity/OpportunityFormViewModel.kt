package one.zrp.social.mobile.ui.opportunity

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import one.zrp.social.mobile.data.OpportunityRepository

data class OpportunityFormUiState(
    val isLoadingExisting: Boolean = false,
    val notAllowed: Boolean = false,
    val type: String = "JOB",
    val title: String = "",
    val organizationName: String = "",
    val description: String = "",
    val location: String = "",
    // "" or "YYYY-MM-DD" - matches web's own <input type="date"> value
    // exactly, sent to the server verbatim.
    val deadline: String = "",
    val remote: Boolean = false,
    val isPaid: Boolean = true,
    val compensationInfo: String = "",
    val skillInput: String = "",
    val skills: List<String> = emptyList(),
    val externalUrl: String = "",
    val isSubmitting: Boolean = false,
    val error: String? = null,
)

/**
 * Shared by both Create and Edit Opportunity - CreateOpportunityPage.tsx
 * and EditOpportunityListingPage.tsx are two separate web pages (no
 * shared component, unlike ListingForm.tsx for Marketplace) but post the
 * exact same fields, so one ViewModel parameterized by a nullable
 * editingListingId covers both, matching this codebase's own
 * ListingFormViewModel precedent.
 */
class OpportunityFormViewModel(
    private val editingListingId: String?,
    private val repository: OpportunityRepository,
) : ViewModel() {
    private val _state = MutableStateFlow(OpportunityFormUiState(isLoadingExisting = editingListingId != null))
    val state: StateFlow<OpportunityFormUiState> = _state.asStateFlow()

    val isEditMode: Boolean get() = editingListingId != null

    init {
        if (editingListingId != null) loadExisting(editingListingId)
    }

    private fun loadExisting(id: String) {
        viewModelScope.launch {
            val ownUserId = repository.getOwnUserId().getOrNull()
            repository.getListing(id)
                .onSuccess { listing ->
                    if (ownUserId != listing.posterId) {
                        _state.update { it.copy(isLoadingExisting = false, notAllowed = true) }
                        return@onSuccess
                    }
                    _state.update {
                        it.copy(
                            isLoadingExisting = false,
                            type = listing.type,
                            title = listing.title,
                            organizationName = listing.organizationName ?: "",
                            description = listing.description,
                            location = listing.location ?: "",
                            deadline = listing.deadline?.take(10) ?: "",
                            remote = listing.remote,
                            isPaid = listing.isPaid,
                            compensationInfo = listing.compensationInfo ?: "",
                            skills = listing.skills,
                            externalUrl = listing.externalUrl ?: "",
                        )
                    }
                }
                .onFailure { _state.update { it.copy(isLoadingExisting = false, notAllowed = true) } }
        }
    }

    fun onTypeChange(type: String) {
        _state.update { it.copy(type = type) }
    }

    fun onTitleChange(title: String) {
        _state.update { it.copy(title = title) }
    }

    fun onOrganizationChange(value: String) {
        _state.update { it.copy(organizationName = value) }
    }

    fun onDescriptionChange(value: String) {
        _state.update { it.copy(description = value) }
    }

    fun onLocationChange(value: String) {
        _state.update { it.copy(location = value) }
    }

    fun onDeadlineChange(value: String) {
        _state.update { it.copy(deadline = value) }
    }

    fun onRemoteToggle(value: Boolean) {
        _state.update { it.copy(remote = value) }
    }

    fun onIsPaidToggle(value: Boolean) {
        _state.update { it.copy(isPaid = value) }
    }

    fun onCompensationChange(value: String) {
        _state.update { it.copy(compensationInfo = value) }
    }

    fun onSkillInputChange(value: String) {
        _state.update { it.copy(skillInput = value) }
    }

    fun onAddSkill() {
        val value = _state.value.skillInput.trim().lowercase()
        _state.update {
            if (value.isNotEmpty() && value !in it.skills && it.skills.size < 20) {
                it.copy(skills = it.skills + value, skillInput = "")
            } else {
                it.copy(skillInput = "")
            }
        }
    }

    fun onRemoveSkill(skill: String) {
        _state.update { it.copy(skills = it.skills.filterNot { s -> s == skill }) }
    }

    fun onExternalUrlChange(value: String) {
        _state.update { it.copy(externalUrl = value) }
    }

    fun submit(onSuccess: (listingId: String) -> Unit) {
        val s = _state.value
        if (s.title.isBlank()) {
            _state.update { it.copy(error = titleRequiredError) }
            return
        }
        if (s.description.isBlank()) {
            _state.update { it.copy(error = descriptionRequiredError) }
            return
        }

        _state.update { it.copy(isSubmitting = true, error = null) }
        viewModelScope.launch {
            val id = editingListingId
            val result = if (id != null) {
                repository.updateListing(
                    id = id,
                    type = s.type,
                    title = s.title.trim(),
                    description = s.description.trim(),
                    organizationName = s.organizationName.trim().ifEmpty { null },
                    skills = s.skills,
                    location = s.location.trim().ifEmpty { null },
                    remote = s.remote,
                    isPaid = s.isPaid,
                    compensationInfo = s.compensationInfo.trim().ifEmpty { null },
                    externalUrl = s.externalUrl.trim().ifEmpty { null },
                    deadline = s.deadline.ifEmpty { null },
                )
            } else {
                repository.createListing(
                    type = s.type,
                    title = s.title.trim(),
                    description = s.description.trim(),
                    organizationName = s.organizationName.trim().ifEmpty { null },
                    skills = s.skills,
                    location = s.location.trim().ifEmpty { null },
                    remote = s.remote,
                    isPaid = s.isPaid,
                    compensationInfo = s.compensationInfo.trim().ifEmpty { null },
                    externalUrl = s.externalUrl.trim().ifEmpty { null },
                    deadline = s.deadline.ifEmpty { null },
                )
            }
            val fallback = if (id != null) updateFailedError else createFailedError
            result.onSuccess { listing ->
                _state.update { it.copy(isSubmitting = false) }
                onSuccess(listing.id)
            }.onFailure { error ->
                _state.update { it.copy(isSubmitting = false, error = error.message ?: fallback) }
            }
        }
    }

    companion object {
        const val titleRequiredError = "titleRequired"
        const val descriptionRequiredError = "descriptionRequired"
        const val createFailedError = "createFailed"
        const val updateFailedError = "updateFailed"
    }
}

class OpportunityFormViewModelFactory(
    private val editingListingId: String?,
    private val repository: OpportunityRepository,
) : ViewModelProvider.Factory {
    @Suppress("UNCHECKED_CAST")
    override fun <T : ViewModel> create(modelClass: Class<T>): T = OpportunityFormViewModel(editingListingId, repository) as T
}
