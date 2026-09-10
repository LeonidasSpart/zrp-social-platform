package one.zrp.social.mobile.ui.admin

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import java.text.SimpleDateFormat
import java.util.Locale
import java.util.TimeZone
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import one.zrp.social.mobile.data.AdminRepository
import one.zrp.social.mobile.network.AdminCharityDisbursement

/** The route's own CAUSES list - anything else is a 400. */
val CHARITY_CAUSES = listOf("orphanages", "schools", "hospitals", "climate")

/**
 * Which required field the form is missing. Kept as a plain enum rather
 * than a message so the ViewModel stays free of resource ids - the
 * screen turns it into localised text.
 */
enum class CharityFormError { BENEFICIARY, CAUSE, AMOUNT, DATE }

data class AdminCharityUiState(
    val isLoading: Boolean = true,
    val disbursements: List<AdminCharityDisbursement> = emptyList(),
    val formExpanded: Boolean = false,
    val beneficiaryName: String = "",
    val cause: String? = null,
    val amount: String = "",
    // The route falls back to "USD" on a blank currency; the form
    // starts on that same default rather than leaving it empty.
    val currency: String = "USD",
    // yyyy-MM-dd, as chosen in the date picker. Deliberately empty
    // until picked: a payout date is part of the record being vouched
    // for, not something to default silently to today.
    val disbursedAt: String = "",
    val note: String = "",
    val proofUrl: String = "",
    val isSubmitting: Boolean = false,
    val formError: CharityFormError? = null,
    val savedRecently: Boolean = false,
    val error: String? = null,
)

private val isoDayFormat = ThreadLocal.withInitial {
    SimpleDateFormat("yyyy-MM-dd", Locale.US).apply {
        timeZone = TimeZone.getTimeZone("UTC")
        isLenient = false
    }
}

/**
 * GET/POST /admin/charity-disbursements (requireAdmin - ADMIN only,
 * since this is financial, publicly-visible data). No web admin page
 * exists for this route, so nothing is being mirrored: the list shows
 * the fields the CharityDisbursement rows actually carry, and the form
 * sends exactly the fields the POST body accepts.
 *
 * These records are real money ZRP sent to a real beneficiary, and they
 * surface publicly on /charity through the transparency endpoint - so
 * the form refuses to submit anything the route itself would reject
 * (missing beneficiary, no cause, a non-positive amount, a missing or
 * future date), and the route's own validation still has the final say
 * on top of that.
 */
class AdminCharityDisbursementsViewModel(private val repository: AdminRepository) : ViewModel() {
    private val _state = MutableStateFlow(AdminCharityUiState())
    val state: StateFlow<AdminCharityUiState> = _state.asStateFlow()

    fun load() {
        _state.update { it.copy(isLoading = true, error = null) }
        viewModelScope.launch {
            repository.getCharityDisbursements()
                .onSuccess { response ->
                    _state.update { it.copy(isLoading = false, disbursements = response.disbursements) }
                }
                .onFailure { error -> _state.update { it.copy(isLoading = false, error = error.message) } }
        }
    }

    fun toggleForm() = _state.update {
        it.copy(formExpanded = !it.formExpanded, formError = null, savedRecently = false)
    }

    fun setBeneficiaryName(value: String) = _state.update { it.copy(beneficiaryName = value, formError = null) }
    fun setCause(value: String) = _state.update { it.copy(cause = value, formError = null) }
    fun setAmount(value: String) = _state.update { it.copy(amount = value, formError = null) }
    fun setCurrency(value: String) = _state.update { it.copy(currency = value, formError = null) }
    fun setDisbursedAt(value: String) = _state.update { it.copy(disbursedAt = value, formError = null) }
    fun setNote(value: String) = _state.update { it.copy(note = value, formError = null) }
    fun setProofUrl(value: String) = _state.update { it.copy(proofUrl = value, formError = null) }

    fun submit() {
        val current = _state.value
        if (current.isSubmitting) return

        val beneficiary = current.beneficiaryName.trim()
        if (beneficiary.isEmpty()) {
            _state.update { it.copy(formError = CharityFormError.BENEFICIARY) }
            return
        }
        val cause = current.cause
        if (cause == null || cause !in CHARITY_CAUSES) {
            _state.update { it.copy(formError = CharityFormError.CAUSE) }
            return
        }
        // A comma decimal separator is what several of this app's
        // locales type on their own keypad, so it is accepted here and
        // normalised before the number is parsed at all.
        val amount = current.amount.trim().replace(',', '.').toDoubleOrNull()
        if (amount == null || !amount.isFinite() || amount <= 0.0) {
            _state.update { it.copy(formError = CharityFormError.AMOUNT) }
            return
        }
        val disbursedAt = current.disbursedAt.trim()
        if (!isValidPastOrTodayDay(disbursedAt)) {
            _state.update { it.copy(formError = CharityFormError.DATE) }
            return
        }

        _state.update { it.copy(isSubmitting = true, formError = null, error = null, savedRecently = false) }
        viewModelScope.launch {
            repository.recordCharityDisbursement(
                beneficiaryName = beneficiary,
                cause = cause,
                amount = amount,
                currency = current.currency.trim(),
                disbursedAt = disbursedAt,
                note = current.note.trim(),
                proofUrl = current.proofUrl.trim(),
            ).onSuccess {
                _state.update {
                    it.copy(
                        isSubmitting = false,
                        formExpanded = false,
                        savedRecently = true,
                        beneficiaryName = "",
                        cause = null,
                        amount = "",
                        currency = "USD",
                        disbursedAt = "",
                        note = "",
                        proofUrl = "",
                    )
                }
                load()
            }.onFailure { error ->
                _state.update { it.copy(isSubmitting = false, error = error.message) }
            }
        }
    }

    fun consumeError() = _state.update { it.copy(error = null) }

    /**
     * The route rejects a date it can't parse or one in the future.
     * Parsing at UTC midnight matches how it reads a bare yyyy-MM-dd,
     * so "today" is always in the past by the time it is compared.
     */
    private fun isValidPastOrTodayDay(day: String): Boolean {
        if (day.isEmpty()) return false
        val parsed = try { isoDayFormat.get()!!.parse(day) } catch (_: Exception) { null } ?: return false
        return parsed.time <= System.currentTimeMillis()
    }
}

class AdminCharityDisbursementsViewModelFactory(
    private val repository: AdminRepository,
) : ViewModelProvider.Factory {
    @Suppress("UNCHECKED_CAST")
    override fun <T : ViewModel> create(modelClass: Class<T>): T =
        AdminCharityDisbursementsViewModel(repository) as T
}
