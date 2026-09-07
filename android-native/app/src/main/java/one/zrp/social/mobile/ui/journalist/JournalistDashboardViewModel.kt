package one.zrp.social.mobile.ui.journalist

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import one.zrp.social.mobile.data.JournalistRepository
import one.zrp.social.mobile.network.JournalistArticleSummary
import one.zrp.social.mobile.network.JournalistCounts
import one.zrp.social.mobile.network.JournalistProfile

data class JournalistDashboardUiState(
    val isLoading: Boolean = true,
    val loadError: Boolean = false,
    val isJournalist: Boolean = false,
    val profile: JournalistProfile? = null,
    val counts: JournalistCounts? = null,
    val articles: List<JournalistArticleSummary> = emptyList(),
    val outlet: String = "",
    val pitch: String = "",
    val portfolioUrl: String = "",
    val applying: Boolean = false,
    val applyError: String? = null,
)

/**
 * ZRP Journalist - ported from journalist/page.tsx exactly, including
 * its own branching precedence: loading -> apply form (with a
 * REJECTED-specific notice nested inside it, since rejection reverts
 * role away from "JOURNALIST" - see JournalistApi's own KDoc) ->
 * PENDING -> SUSPENDED -> else (VERIFIED) full dashboard.
 *
 * load() is called by the Screen itself (on first composition, and
 * again every time this destination is freshly recomposed after
 * returning from the article editor via popBackStack) rather than
 * from init - navigating to the editor and back keeps this same
 * ViewModel instance alive, so an init-only load would never pick up
 * an article the user just created or edited, unlike the website's
 * own `router.refresh()` after a save. Also called again after a
 * successful application submit, exactly like the web page's own
 * `await load()` inside handleApply.
 */
class JournalistDashboardViewModel(
    private val repository: JournalistRepository,
) : ViewModel() {
    private val _state = MutableStateFlow(JournalistDashboardUiState())
    val state: StateFlow<JournalistDashboardUiState> = _state.asStateFlow()

    fun load() {
        _state.update { it.copy(isLoading = true, loadError = false) }
        viewModelScope.launch {
            repository.getProfile()
                .onSuccess { data ->
                    _state.update {
                        it.copy(
                            isLoading = false,
                            isJournalist = data.isJournalist,
                            profile = data.profile,
                            counts = data.counts,
                            articles = data.recentArticles,
                        )
                    }
                }
                .onFailure {
                    // Non-fatal, matching the website's own load(): the
                    // apply form still renders on a failed fetch. Web's
                    // own catch block never actually displays its error
                    // message either (silently swallowed), which is why
                    // journalist_dash_err_failed_load stays a real,
                    // extracted, but deliberately unused translation -
                    // same as trust_not_found_fallback's precedent.
                    _state.update { it.copy(isLoading = false, loadError = true) }
                }
        }
    }

    fun onOutletChange(value: String) = _state.update { it.copy(outlet = value) }
    fun onPitchChange(value: String) = _state.update { it.copy(pitch = value) }
    fun onPortfolioUrlChange(value: String) = _state.update { it.copy(portfolioUrl = value) }

    fun apply() {
        val s = _state.value
        if (s.pitch.isBlank()) {
            _state.update { it.copy(applyError = pitchRequiredError) }
            return
        }
        _state.update { it.copy(applying = true, applyError = null) }
        viewModelScope.launch {
            repository.apply(
                outlet = s.outlet.trim().ifEmpty { null },
                pitch = s.pitch.trim(),
                portfolioUrl = s.portfolioUrl.trim().ifEmpty { null },
            ).onSuccess {
                _state.update { it.copy(applying = false) }
                load()
            }.onFailure { error ->
                _state.update { it.copy(applying = false, applyError = error.message ?: failedSubmitError) }
            }
        }
    }

    // The ViewModel layer can't resolve Android string resources
    // (established codebase convention, see ListingFormViewModel) -
    // the Screen swaps in the real translated string for this
    // sentinel rather than showing English literally.
    companion object {
        const val pitchRequiredError = "pitchRequired"
        const val failedSubmitError = "failedSubmit"
    }
}

class JournalistDashboardViewModelFactory(
    private val repository: JournalistRepository,
) : ViewModelProvider.Factory {
    @Suppress("UNCHECKED_CAST")
    override fun <T : ViewModel> create(modelClass: Class<T>): T = JournalistDashboardViewModel(repository) as T
}
