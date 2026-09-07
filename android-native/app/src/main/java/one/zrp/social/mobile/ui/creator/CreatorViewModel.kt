package one.zrp.social.mobile.ui.creator

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import one.zrp.social.mobile.data.CreatorRepository
import one.zrp.social.mobile.network.CreatorAudienceSection
import one.zrp.social.mobile.network.CreatorContentSection
import one.zrp.social.mobile.network.CreatorDashboardStats
import one.zrp.social.mobile.network.CreatorPremiumPost
import one.zrp.social.mobile.network.CreatorProfile
import one.zrp.social.mobile.network.CreatorTip

enum class CreatorTab { OVERVIEW, CONTENT, AUDIENCE }

/** Mirrors handleWithdraw's own client-side checks, in the same order. */
sealed class CreatorWithdrawError {
    object InvalidAmount : CreatorWithdrawError()
    object InvalidWallet : CreatorWithdrawError()
    object InsufficientBalance : CreatorWithdrawError()
    data class ServerError(val detail: String) : CreatorWithdrawError()
}

data class CreatorUiState(
    val isLoading: Boolean = true,
    // False only once GET /api/creator/profile itself has answered
    // "not eligible" (a free/pro plan) - distinct from isLoading, since
    // that state has its own dedicated screen (an upgrade prompt), not
    // a loading spinner or a generic error.
    val isEligible: Boolean = true,
    val ineligibleMessage: String? = null,
    val loadError: String? = null,
    val profile: CreatorProfile? = null,
    val stats: CreatorDashboardStats? = null,
    val recentTips: List<CreatorTip> = emptyList(),
    val premiumPosts: List<CreatorPremiumPost> = emptyList(),
    val activeTab: CreatorTab = CreatorTab.OVERVIEW,
    val studioLoading: Boolean = true,
    val content: CreatorContentSection? = null,
    val audience: CreatorAudienceSection? = null,
    val studioError: Boolean = false,
    val settingsError: String? = null,
    val showWithdrawDialog: Boolean = false,
    val withdrawAmount: String = "",
    val withdrawWalletAddress: String = "",
    val isWithdrawing: Boolean = false,
    val withdrawError: CreatorWithdrawError? = null,
)

/**
 * ZRP Creator Studio - ported from dashboard/page.tsx (earnings
 * overview + monetisation settings + withdraw) and
 * ContentPerformanceTab.tsx/AudienceGrowthTab.tsx (the "content"/
 * "audience" tabs, backed by GET /api/creator/studio).
 *
 * Loads GET /api/creator/profile first (which both checks
 * Business/Enterprise eligibility and auto-provisions the profile row)
 * rather than racing dashboard/studio the way the website's own
 * useEffect does - dashboard/page.tsx's fetchDashboard() has an
 * `if (!profile)` "enable monetisation" branch that's actually dead
 * code on the website itself (GET /api/creator/dashboard 404s rather
 * than ever returning `{profile: null}`, and that 404 is caught by the
 * error branch checked earlier in the same component), so this isn't
 * copying an unreachable web code path, just the two real, reachable
 * outcomes: eligible (queue dashboard + studio) or not (show why).
 */
class CreatorViewModel(private val repository: CreatorRepository) : ViewModel() {
    private val _state = MutableStateFlow(CreatorUiState())
    val state: StateFlow<CreatorUiState> = _state.asStateFlow()

    init {
        load()
    }

    private fun load() {
        _state.update { it.copy(isLoading = true, loadError = null) }
        viewModelScope.launch {
            repository.getProfile()
                .onSuccess { resp ->
                    if (!resp.isEligible || resp.profile == null) {
                        _state.update {
                            it.copy(isLoading = false, isEligible = false, ineligibleMessage = resp.message)
                        }
                        return@onSuccess
                    }
                    _state.update { it.copy(isEligible = true, profile = resp.profile) }
                    loadDashboard()
                    loadStudio()
                }
                .onFailure { error ->
                    _state.update { it.copy(isLoading = false, loadError = error.message) }
                }
        }
    }

    private fun loadDashboard() {
        viewModelScope.launch {
            repository.getDashboard()
                .onSuccess { resp ->
                    _state.update {
                        it.copy(
                            isLoading = false,
                            profile = resp.profile,
                            stats = resp.stats,
                            recentTips = resp.recentTips,
                            premiumPosts = resp.premiumPosts,
                        )
                    }
                }
                .onFailure { error ->
                    _state.update { it.copy(isLoading = false, loadError = error.message) }
                }
        }
    }

    private fun loadStudio() {
        _state.update { it.copy(studioLoading = true, studioError = false) }
        viewModelScope.launch {
            repository.getStudio()
                .onSuccess { resp -> _state.update { it.copy(studioLoading = false, content = resp.content, audience = resp.audience) } }
                .onFailure { _state.update { it.copy(studioLoading = false, studioError = true) } }
        }
    }

    fun setTab(tab: CreatorTab) = _state.update { it.copy(activeTab = tab) }

    fun setTipsEnabled(enabled: Boolean) {
        viewModelScope.launch {
            repository.updateProfile(tipsEnabled = enabled)
                .onSuccess { profile -> _state.update { it.copy(profile = profile, settingsError = null) } }
                .onFailure { error -> _state.update { it.copy(settingsError = error.message) } }
        }
    }

    fun setPremiumPostsEnabled(enabled: Boolean) {
        viewModelScope.launch {
            repository.updateProfile(premiumPostsEnabled = enabled)
                .onSuccess { profile -> _state.update { it.copy(profile = profile, settingsError = null) } }
                .onFailure { error -> _state.update { it.copy(settingsError = error.message) } }
        }
    }

    fun dismissSettingsError() = _state.update { it.copy(settingsError = null) }

    fun openWithdrawDialog() {
        _state.update { it.copy(showWithdrawDialog = true, withdrawAmount = "", withdrawWalletAddress = "", withdrawError = null) }
    }

    fun closeWithdrawDialog() {
        if (_state.value.isWithdrawing) return
        _state.update { it.copy(showWithdrawDialog = false) }
    }

    fun onWithdrawAmountChange(value: String) = _state.update { it.copy(withdrawAmount = value, withdrawError = null) }

    fun onWithdrawWalletChange(value: String) = _state.update { it.copy(withdrawWalletAddress = value, withdrawError = null) }

    fun submitWithdraw() {
        val s = _state.value
        if (s.isWithdrawing) return

        val amount = s.withdrawAmount.toDoubleOrNull()
        if (amount == null || amount <= 0) {
            _state.update { it.copy(withdrawError = CreatorWithdrawError.InvalidAmount) }
            return
        }
        // Matches handleWithdraw's own `walletAddress.length < 32` sanity check.
        if (s.withdrawWalletAddress.length < 32) {
            _state.update { it.copy(withdrawError = CreatorWithdrawError.InvalidWallet) }
            return
        }
        if (amount > (s.profile?.balance ?: 0.0)) {
            _state.update { it.copy(withdrawError = CreatorWithdrawError.InsufficientBalance) }
            return
        }

        _state.update { it.copy(isWithdrawing = true, withdrawError = null) }
        viewModelScope.launch {
            repository.withdraw(amount, s.withdrawWalletAddress)
                .onSuccess {
                    _state.update {
                        it.copy(isWithdrawing = false, showWithdrawDialog = false, withdrawAmount = "", withdrawWalletAddress = "")
                    }
                    loadDashboard()
                }
                .onFailure { error ->
                    _state.update {
                        it.copy(
                            isWithdrawing = false,
                            withdrawError = CreatorWithdrawError.ServerError(error.message ?: "Couldn't submit the withdrawal."),
                        )
                    }
                }
        }
    }
}

class CreatorViewModelFactory(private val repository: CreatorRepository) : ViewModelProvider.Factory {
    @Suppress("UNCHECKED_CAST")
    override fun <T : ViewModel> create(modelClass: Class<T>): T = CreatorViewModel(repository) as T
}
