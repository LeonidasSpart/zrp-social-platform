package one.zrp.social.mobile.ui.admin

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import one.zrp.social.mobile.data.AdminRepository
import one.zrp.social.mobile.network.AdminPaymentRequest

data class AdminPaymentsUiState(
    val isLoading: Boolean = true,
    val payments: List<AdminPaymentRequest> = emptyList(),
    val updatingId: String? = null,
    val pendingVerifyId: String? = null,
    val error: String? = null,
)

/**
 * Ported from src/app/admin/payments/page.tsx - the manual payment
 * queue: a user files a PaymentRequest with the plan they paid for and
 * the transaction id they paid with, and verifying it here is what
 * actually moves them onto that plan server-side.
 *
 * The route lists pending rows only and takes no status or page
 * parameter (see AdminApi's own note), so this screen has neither
 * filter chips nor a pager - the queue is whatever is still waiting.
 *
 * Verifying grants paid access and can't be undone from here, so it
 * always goes through pendingVerifyId - the confirm dialog - rather
 * than firing straight off the row button.
 */
class AdminPaymentsViewModel(private val repository: AdminRepository) : ViewModel() {
    private val _state = MutableStateFlow(AdminPaymentsUiState())
    val state: StateFlow<AdminPaymentsUiState> = _state.asStateFlow()

    fun load() {
        _state.update { it.copy(isLoading = true, error = null) }
        viewModelScope.launch {
            repository.getPendingPayments()
                .onSuccess { payments -> _state.update { it.copy(isLoading = false, payments = payments) } }
                .onFailure { error -> _state.update { it.copy(isLoading = false, error = error.message) } }
        }
    }

    fun requestVerify(paymentId: String) = _state.update { it.copy(pendingVerifyId = paymentId) }
    fun cancelVerify() = _state.update { it.copy(pendingVerifyId = null) }

    fun confirmVerify() {
        val paymentId = _state.value.pendingVerifyId ?: return
        _state.update { it.copy(pendingVerifyId = null, updatingId = paymentId, error = null) }
        viewModelScope.launch {
            repository.verifyPayment(paymentId)
                .onSuccess {
                    _state.update { it.copy(updatingId = null) }
                    load()
                }
                .onFailure { error -> _state.update { it.copy(updatingId = null, error = error.message) } }
        }
    }

    fun consumeError() = _state.update { it.copy(error = null) }
}

class AdminPaymentsViewModelFactory(private val repository: AdminRepository) : ViewModelProvider.Factory {
    @Suppress("UNCHECKED_CAST")
    override fun <T : ViewModel> create(modelClass: Class<T>): T = AdminPaymentsViewModel(repository) as T
}
