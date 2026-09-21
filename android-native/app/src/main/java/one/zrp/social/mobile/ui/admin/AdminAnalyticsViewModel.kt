package one.zrp.social.mobile.ui.admin

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.async
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import one.zrp.social.mobile.data.AdminRepository
import one.zrp.social.mobile.network.AdminAnalyticsGeographyResponse
import one.zrp.social.mobile.network.AdminAnalyticsResponse

data class AdminAnalyticsUiState(
    val isLoading: Boolean = true,
    val analytics: AdminAnalyticsResponse? = null,
    val failed: Boolean = false,
    // The geography/acquisition/platform/language breakdown is a
    // separate call (GET /admin/analytics/geography) and, deliberately,
    // a separate failure domain from `failed` above: a request failure
    // here never blanks out the core analytics this screen already
    // loaded successfully, it just leaves this section absent. null
    // means "hasn't loaded (yet, or failed)" - there's no dedicated
    // loading flag for it since it's fetched alongside the core call and
    // this screen's single isLoading spinner already covers both.
    val geography: AdminAnalyticsGeographyResponse? = null,
    val error: String? = null,
)

/**
 * Ported from src/app/admin/analytics/page.tsx - the platform-wide
 * activity summary from GET /admin/analytics (requireAdmin, so ADMIN
 * only, never MODERATOR). Everything the screen renders is a field the
 * route itself returns: the five lifetime totals, its own 30-day daily
 * series, its own precomputed engagement averages and its own top-ten
 * posts (already sorted and sliced server-side).
 *
 * Nothing is filled in when the call fails: `failed` drives a plain
 * error state, the same one the website's own page falls back to
 * (analytics.errLoad). That path is worth knowing about - the route's
 * daily series comes from a $queryRaw whose Postgres COUNT() values
 * reach Prisma as JS BigInt, which JSON.stringify rejects, so the route
 * answers its own 500 ("Failed to fetch analytics") whenever there has
 * been any activity in the last 30 days. That is a server-side bug in
 * a file this client only consumes; the screen surfaces the failure
 * honestly rather than substituting anything for it.
 */
class AdminAnalyticsViewModel(private val repository: AdminRepository) : ViewModel() {
    private val _state = MutableStateFlow(AdminAnalyticsUiState())
    val state: StateFlow<AdminAnalyticsUiState> = _state.asStateFlow()

    fun load() {
        _state.update { it.copy(isLoading = true, failed = false, error = null) }
        viewModelScope.launch {
            // Fetched in parallel, exactly like the website's own
            // Promise.all([analytics, geography]) - see AdminAnalyticsUiState's
            // own note on why a geography failure doesn't touch `failed`.
            val analyticsDeferred = async { repository.getAnalytics() }
            val geographyDeferred = async { repository.getAnalyticsGeography() }
            val analyticsResult = analyticsDeferred.await()
            val geographyResult = geographyDeferred.await()

            analyticsResult
                .onSuccess { response ->
                    _state.update {
                        it.copy(
                            isLoading = false,
                            analytics = response,
                            failed = false,
                            geography = geographyResult.getOrNull(),
                        )
                    }
                }
                .onFailure { error ->
                    _state.update { it.copy(isLoading = false, failed = true, error = error.message) }
                }
        }
    }

    fun consumeError() = _state.update { it.copy(error = null) }
}

class AdminAnalyticsViewModelFactory(private val repository: AdminRepository) : ViewModelProvider.Factory {
    @Suppress("UNCHECKED_CAST")
    override fun <T : ViewModel> create(modelClass: Class<T>): T = AdminAnalyticsViewModel(repository) as T
}
