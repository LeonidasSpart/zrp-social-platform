package one.zrp.social.mobile.ui.opportunity

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import one.zrp.social.mobile.data.OpportunityRepository
import one.zrp.social.mobile.network.OpportunitySummary

data class OpportunityUiState(
    val listings: List<OpportunitySummary> = emptyList(),
    val isLoading: Boolean = true,
    val isLoadingMore: Boolean = false,
    val nextCursor: String? = null,
    val endReached: Boolean = false,
    val error: String? = null,
    // null means every type ("All Types"), matching OpportunityHomePage.
    val selectedType: String? = null,
    val remoteOnly: Boolean = false,
)

/**
 * ZRP OPPORTUNITY browse - the same real GET /opportunity public browse
 * endpoint OpportunityHomePage uses, with an in-place type filter and
 * remote-only toggle exactly matching the web page's own filter row.
 */
class OpportunityViewModel(private val repository: OpportunityRepository) : ViewModel() {
    private val _state = MutableStateFlow(OpportunityUiState())
    val state: StateFlow<OpportunityUiState> = _state.asStateFlow()

    init {
        load()
    }

    private fun load() {
        _state.update { it.copy(isLoading = true, error = null) }
        viewModelScope.launch {
            val s = _state.value
            repository.getListings(cursor = null, type = s.selectedType, remoteOnly = s.remoteOnly)
                .onSuccess { page ->
                    _state.update {
                        it.copy(
                            listings = page.listings,
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
            repository.getListings(cursor = current.nextCursor, type = current.selectedType, remoteOnly = current.remoteOnly)
                .onSuccess { page ->
                    _state.update {
                        it.copy(
                            listings = it.listings + page.listings,
                            nextCursor = page.nextCursor,
                            isLoadingMore = false,
                            endReached = page.nextCursor == null,
                        )
                    }
                }
                .onFailure { _state.update { it.copy(isLoadingMore = false) } }
        }
    }

    fun onTypeSelect(type: String?) {
        if (_state.value.selectedType == type) return
        _state.update { it.copy(selectedType = type) }
        load()
    }

    fun onRemoteOnlyToggle() {
        _state.update { it.copy(remoteOnly = !it.remoteOnly) }
        load()
    }

    fun refresh() {
        load()
    }
}

class OpportunityViewModelFactory(private val repository: OpportunityRepository) : ViewModelProvider.Factory {
    @Suppress("UNCHECKED_CAST")
    override fun <T : ViewModel> create(modelClass: Class<T>): T = OpportunityViewModel(repository) as T
}
