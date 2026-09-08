package one.zrp.social.mobile.ui.settings

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import one.zrp.social.mobile.data.ApiKeysLoadOutcome
import one.zrp.social.mobile.data.ApiKeysRepository
import one.zrp.social.mobile.network.ApiClient
import one.zrp.social.mobile.network.ApiKeyItem

data class ApiKeysToast(val type: ToastType, val title: String, val description: String? = null)

data class ApiKeysUiState(
    val isLoading: Boolean = true,
    // Same real shape as TeamUiState's own isEligible/ineligibleMessage -
    // GET /api/api-keys's own 403 for a non-Business/Enterprise plan.
    val isEligible: Boolean = true,
    val ineligibleMessage: String? = null,
    val loadError: String? = null,
    val keys: List<ApiKeyItem> = emptyList(),
    val plan: String = "free",
    val showCreateDialog: Boolean = false,
    val keyName: String = "",
    // Days until expiry - 0 means "never expires", matching the
    // website's own <select> value exactly (30/90/365/0).
    val expiresInDays: Int = 365,
    val isSubmitting: Boolean = false,
    // The real plaintext key, shown exactly once right after creation -
    // never persisted, never re-fetchable (the server only ever stores
    // its hash), cleared the moment the user dismisses this dialog.
    val newPlainKey: String? = null,
    val revokeTarget: ApiKeyItem? = null,
    val showRevokeDialog: Boolean = false,
    val toast: ApiKeysToast? = null,
)

/**
 * Backs the real API Keys screen (src/app/settings/api-keys/page.tsx) -
 * Business/Enterprise accounts generate bearer tokens for the real
 * GET /api/external/me and /api/external/me/posts routes. See
 * ApiKeysApi's own KDoc for the full GET/POST/DELETE contract.
 *
 * The website's own "Upgrade to Business or Enterprise" button is
 * deliberately not reproduced here, the same real reason
 * TeamViewModel's own KDoc documents for its identical ineligible-plan
 * screen (native-payment-policy.ts).
 */
class ApiKeysViewModel(private val repository: ApiKeysRepository) : ViewModel() {
    private val _state = MutableStateFlow(ApiKeysUiState())
    val state: StateFlow<ApiKeysUiState> = _state.asStateFlow()

    private var toastJob: Job? = null

    init {
        viewModelScope.launch {
            runCatching { ApiClient.authApi.getSession().user?.plan }
                .getOrNull()
                ?.let { plan -> _state.update { it.copy(plan = plan) } }
        }
        load()
    }

    fun refresh() = load()

    private fun load() {
        _state.update { it.copy(isLoading = true, loadError = null) }
        viewModelScope.launch {
            repository.getApiKeys()
                .onSuccess { outcome ->
                    when (outcome) {
                        is ApiKeysLoadOutcome.Eligible -> _state.update {
                            it.copy(isLoading = false, isEligible = true, keys = outcome.response.keys)
                        }
                        is ApiKeysLoadOutcome.Ineligible -> _state.update {
                            it.copy(isLoading = false, isEligible = false, ineligibleMessage = outcome.message)
                        }
                    }
                }
                .onFailure { error ->
                    _state.update { it.copy(isLoading = false, loadError = error.message) }
                }
        }
    }

    fun openCreateDialog() = _state.update { it.copy(showCreateDialog = true, keyName = "", expiresInDays = 365) }

    fun dismissCreateDialog() = _state.update { it.copy(showCreateDialog = false) }

    fun onKeyNameChange(name: String) = _state.update { it.copy(keyName = name) }

    fun onExpiresInDaysChange(days: Int) = _state.update { it.copy(expiresInDays = days) }

    fun createKey() {
        val name = _state.value.keyName.trim()
        if (name.isEmpty() || _state.value.isSubmitting) return

        _state.update { it.copy(isSubmitting = true) }
        viewModelScope.launch {
            repository.createApiKey(name, _state.value.expiresInDays)
                .onSuccess { response ->
                    _state.update {
                        it.copy(
                            isSubmitting = false,
                            showCreateDialog = false,
                            keyName = "",
                            expiresInDays = 365,
                            newPlainKey = response.plainKey,
                        )
                    }
                    load()
                }
                .onFailure { error ->
                    _state.update { it.copy(isSubmitting = false) }
                    showToast(ApiKeysToast(ToastType.ERROR, "error", error.message))
                }
        }
    }

    fun dismissNewKeyDialog() = _state.update { it.copy(newPlainKey = null) }

    fun openRevokeDialog(key: ApiKeyItem) = _state.update { it.copy(revokeTarget = key, showRevokeDialog = true) }

    fun dismissRevokeDialog() = _state.update { it.copy(revokeTarget = null, showRevokeDialog = false) }

    fun confirmRevokeKey() {
        val target = _state.value.revokeTarget ?: return
        viewModelScope.launch {
            repository.revokeApiKey(target.id)
                .onSuccess {
                    _state.update { it.copy(showRevokeDialog = false, revokeTarget = null) }
                    showToast(ApiKeysToast(ToastType.SUCCESS, "revoked"))
                    load()
                }
                .onFailure { error -> showToast(ApiKeysToast(ToastType.ERROR, "error", error.message)) }
        }
    }

    // Matches the website's own showToast: a 5-second auto-dismiss.
    private fun showToast(toast: ApiKeysToast) {
        toastJob?.cancel()
        _state.update { it.copy(toast = toast) }
        toastJob = viewModelScope.launch {
            delay(5000)
            _state.update { it.copy(toast = null) }
        }
    }

    fun dismissToast() {
        toastJob?.cancel()
        _state.update { it.copy(toast = null) }
    }
}

class ApiKeysViewModelFactory(private val repository: ApiKeysRepository) : ViewModelProvider.Factory {
    @Suppress("UNCHECKED_CAST")
    override fun <T : ViewModel> create(modelClass: Class<T>): T {
        return ApiKeysViewModel(repository) as T
    }
}
