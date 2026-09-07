package one.zrp.social.mobile.ui.aid

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import one.zrp.social.mobile.data.AidRepository
import one.zrp.social.mobile.network.HelpCampaignSummary

data class AidUiState(
    val campaigns: List<HelpCampaignSummary> = emptyList(),
    val isLoading: Boolean = true,
    val isLoadingMore: Boolean = false,
    val nextCursor: String? = null,
    val endReached: Boolean = false,
    val error: String? = null,
    // null means every category ("All Categories"), matching AidHomePage.
    val selectedCategory: String? = null,
    val isVerifiedOrganizer: Boolean = false,
)

/**
 * ZRP Aid browse - the same real GET /help public browse endpoint
 * AidHomePage uses, with an in-place category filter matching the web
 * page's own filter row.
 */
class AidViewModel(private val repository: AidRepository) : ViewModel() {
    private val _state = MutableStateFlow(AidUiState())
    val state: StateFlow<AidUiState> = _state.asStateFlow()

    init {
        load()
        viewModelScope.launch {
            repository.getOwnBadgeType().onSuccess { badgeType ->
                _state.update { it.copy(isVerifiedOrganizer = badgeType == "organization") }
            }
        }
    }

    private fun load() {
        _state.update { it.copy(isLoading = true, error = null) }
        viewModelScope.launch {
            repository.getCampaigns(cursor = null, category = _state.value.selectedCategory)
                .onSuccess { page ->
                    _state.update {
                        it.copy(
                            campaigns = page.campaigns,
                            nextCursor = page.nextCursor,
                            isLoading = false,
                            endReached = page.nextCursor == null,
                        )
                    }
                }
                .onFailure { error -> _state.update { it.copy(isLoading = false, error = error.message) } }
        }
    }

    fun loadMore() {
        val current = _state.value
        if (current.isLoadingMore || current.endReached || current.nextCursor == null) return

        _state.update { it.copy(isLoadingMore = true) }
        viewModelScope.launch {
            repository.getCampaigns(cursor = current.nextCursor, category = current.selectedCategory)
                .onSuccess { page ->
                    _state.update {
                        it.copy(
                            campaigns = it.campaigns + page.campaigns,
                            nextCursor = page.nextCursor,
                            isLoadingMore = false,
                            endReached = page.nextCursor == null,
                        )
                    }
                }
                .onFailure { _state.update { it.copy(isLoadingMore = false) } }
        }
    }

    fun onCategorySelect(category: String?) {
        if (_state.value.selectedCategory == category) return
        _state.update { it.copy(selectedCategory = category) }
        load()
    }
}

class AidViewModelFactory(private val repository: AidRepository) : ViewModelProvider.Factory {
    @Suppress("UNCHECKED_CAST")
    override fun <T : ViewModel> create(modelClass: Class<T>): T = AidViewModel(repository) as T
}
