package one.zrp.social.mobile.ui.settings

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import one.zrp.social.mobile.data.AppealsRepository
import one.zrp.social.mobile.network.Appeal
import one.zrp.social.mobile.network.EligibleReport

data class AppealsUiState(
    val isLoading: Boolean = true,
    val eligibleReports: List<EligibleReport> = emptyList(),
    val appeals: List<Appeal> = emptyList(),
    val error: String? = null,
    // Which eligible report's inline appeal form is open - null means
    // none, matching page.tsx's own openReportId.
    val openReportId: String? = null,
    val draftMessage: String = "",
    val isSubmitting: Boolean = false,
    val submitError: String? = null,
)

/**
 * Backs the real Moderation Appeals screen (GET/POST /api/appeals) -
 * lets a user appeal a moderation action taken on their own content or
 * account and see the resolution once staff decide. No fake data: an
 * empty eligibleReports list genuinely means nothing is appealable
 * right now, not a loading placeholder.
 */
class AppealsViewModel(private val repository: AppealsRepository) : ViewModel() {
    private val _state = MutableStateFlow(AppealsUiState())
    val state: StateFlow<AppealsUiState> = _state.asStateFlow()

    init { load() }

    fun refresh() = load()

    private fun load() {
        viewModelScope.launch {
            _state.update { it.copy(isLoading = true, error = null) }
            repository.getAppeals()
                .onSuccess { response ->
                    _state.update {
                        it.copy(isLoading = false, eligibleReports = response.eligibleReports, appeals = response.appeals)
                    }
                }
                .onFailure { error ->
                    _state.update { it.copy(isLoading = false, error = error.message) }
                }
        }
    }

    fun openAppealForm(reportId: String) {
        _state.update { it.copy(openReportId = reportId, draftMessage = "", submitError = null) }
    }

    fun cancelAppealForm() {
        _state.update { it.copy(openReportId = null, draftMessage = "", submitError = null) }
    }

    fun onDraftMessageChange(text: String) {
        _state.update { it.copy(draftMessage = text) }
    }

    fun submitAppeal() {
        val reportId = _state.value.openReportId ?: return
        val message = _state.value.draftMessage.trim()
        if (message.isEmpty() || _state.value.isSubmitting) return

        _state.update { it.copy(isSubmitting = true, submitError = null) }
        viewModelScope.launch {
            repository.createAppeal(reportId, message)
                .onSuccess {
                    _state.update { it.copy(isSubmitting = false, openReportId = null, draftMessage = "") }
                    load()
                }
                .onFailure { error ->
                    _state.update { it.copy(isSubmitting = false, submitError = error.message) }
                }
        }
    }
}

class AppealsViewModelFactory(private val repository: AppealsRepository) : ViewModelProvider.Factory {
    @Suppress("UNCHECKED_CAST")
    override fun <T : ViewModel> create(modelClass: Class<T>): T {
        return AppealsViewModel(repository) as T
    }
}
