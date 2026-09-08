package one.zrp.social.mobile.ui.search

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import one.zrp.social.mobile.data.SearchRepository
import one.zrp.social.mobile.network.TrendingHashtag

data class ExploreTrendingUiState(
    val hashtags: List<TrendingHashtag> = emptyList(),
    val isLoading: Boolean = true,
)

/**
 * Backs the "Trending" see-all screen - the real website's own
 * src/app/explore/trending/page.tsx destination, reached from Search's
 * Discover state the same way that page is reached from HomeTrending's
 * "See all" link. Same GET /hashtags/trending endpoint the Discover
 * state's own compact row already calls, just requesting the full
 * limit=50 list instead of the teaser's default 10.
 */
class ExploreTrendingViewModel(private val repository: SearchRepository) : ViewModel() {
    private val _state = MutableStateFlow(ExploreTrendingUiState())
    val state: StateFlow<ExploreTrendingUiState> = _state.asStateFlow()

    init {
        viewModelScope.launch {
            repository.getTrendingHashtags(limit = 50)
                .onSuccess { hashtags -> _state.update { it.copy(isLoading = false, hashtags = hashtags) } }
                .onFailure { _state.update { it.copy(isLoading = false) } }
        }
    }
}

class ExploreTrendingViewModelFactory(private val repository: SearchRepository) : ViewModelProvider.Factory {
    @Suppress("UNCHECKED_CAST")
    override fun <T : ViewModel> create(modelClass: Class<T>): T {
        return ExploreTrendingViewModel(repository) as T
    }
}
