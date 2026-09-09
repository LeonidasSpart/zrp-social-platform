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
import one.zrp.social.mobile.network.AdminAnalyticsResponse

data class AdminAnalyticsUiState(
    val isLoading: Boolean = true,
    val analytics: AdminAnalyticsResponse? = null,
    val failed: Boolean = false,
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
            repository.getAnalytics()
                .onSuccess { response ->
                    _state.update { it.copy(isLoading = false, analytics = response, failed = false) }
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
