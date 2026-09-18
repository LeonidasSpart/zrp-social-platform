package one.zrp.social.mobile.ui.pricing

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import one.zrp.social.mobile.network.ApiClient
import one.zrp.social.mobile.network.CreateUpgradeRequest

/**
 * Backs the "Request manual approval instead" flow on [PricingScreen] -
 * web's own UpgradeRequestModal.tsx, ported. This is not a payment: it
 * only ever writes a row (POST /upgrade-requests) that an admin later
 * approves or denies, matching the same manual/admin-reviewed path the
 * website offers alongside its crypto checkout. No wallet, no on-chain
 * transaction, nothing NativeRestrictedPaymentFeature blocks natively.
 */
data class UpgradeRequestDialogState(
    val isOpen: Boolean = false,
    val plan: String? = null,
    val paymentMethod: String = "bank",
    val note: String = "",
    val isSubmitting: Boolean = false,
    val error: String? = null,
    val success: Boolean = false,
)

class PricingViewModel : ViewModel() {

    private val _state = MutableStateFlow(UpgradeRequestDialogState())
    val state: StateFlow<UpgradeRequestDialogState> = _state.asStateFlow()

    fun openRequestDialog(plan: String) {
        _state.value = UpgradeRequestDialogState(isOpen = true, plan = plan)
    }

    fun dismissRequestDialog() {
        _state.value = UpgradeRequestDialogState()
    }

    fun setPaymentMethod(method: String) {
        _state.update { it.copy(paymentMethod = method) }
    }

    fun setNote(note: String) {
        _state.update { it.copy(note = note) }
    }

    fun submit() {
        val current = _state.value
        val plan = current.plan ?: return
        _state.update { it.copy(isSubmitting = true, error = null) }
        viewModelScope.launch {
            runCatching {
                ApiClient.upgradeRequestApi.createUpgradeRequest(
                    CreateUpgradeRequest(
                        requestedPlan = plan,
                        paymentMethod = current.paymentMethod,
                        message = current.note.ifBlank { null },
                    )
                )
            }.onSuccess {
                _state.update { it.copy(isSubmitting = false, success = true) }
            }.onFailure { error ->
                _state.update { it.copy(isSubmitting = false, error = error.message ?: error.toString()) }
            }
        }
    }
}
