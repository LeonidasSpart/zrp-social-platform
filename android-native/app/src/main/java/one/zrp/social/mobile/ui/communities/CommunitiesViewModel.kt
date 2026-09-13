package one.zrp.social.mobile.ui.communities

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import one.zrp.social.mobile.data.CommunitiesRepository
import one.zrp.social.mobile.network.CommunitySummary

val COMMUNITY_CATEGORIES = listOf(
    "TRAVEL", "PHOTOGRAPHY", "NATURE", "TECHNOLOGY", "HEALTH_FITNESS", "ART_DESIGN", "GENERAL",
)

data class CommunitiesUiState(
    val communities: List<CommunitySummary> = emptyList(),
    val isLoading: Boolean = true,
    val category: String? = null,
    val search: String = "",
    val error: String? = null,
    val isCreating: Boolean = false,
    val createError: String? = null,
)

class CommunitiesViewModel(private val repository: CommunitiesRepository) : ViewModel() {
    private val _state = MutableStateFlow(CommunitiesUiState())
    val state: StateFlow<CommunitiesUiState> = _state.asStateFlow()

    init {
        load()
    }

    fun setCategory(category: String?) {
        _state.update { it.copy(category = category) }
        load()
    }

    fun setSearch(search: String) {
        _state.update { it.copy(search = search) }
    }

    fun search() = load()

    fun load() {
        _state.update { it.copy(isLoading = true, error = null) }
        viewModelScope.launch {
            val current = _state.value
            repository.getCommunities(current.category, current.search.ifBlank { null })
                .onSuccess { list -> _state.update { it.copy(communities = list, isLoading = false) } }
                .onFailure { error -> _state.update { it.copy(isLoading = false, error = error.message) } }
        }
    }

    fun toggleMembership(community: CommunitySummary) {
        val wasMember = community.isMember
        _state.update { state ->
            state.copy(
                communities = state.communities.map {
                    if (it.id == community.id) {
                        it.copy(isMember = !wasMember, memberCount = it.memberCount + if (wasMember) -1 else 1)
                    } else it
                },
            )
        }
        viewModelScope.launch {
            val result = if (wasMember) repository.leaveCommunity(community.id) else repository.joinCommunity(community.id)
            result.onFailure { load() }
        }
    }

    fun createCommunity(
        name: String,
        description: String,
        category: String,
        hashtag: String,
        onResult: (Result<CommunitySummary>) -> Unit,
    ) {
        _state.update { it.copy(isCreating = true, createError = null) }
        viewModelScope.launch {
            val result = repository.createCommunity(name, description, category, hashtag)
            _state.update { it.copy(isCreating = false, createError = result.exceptionOrNull()?.message) }
            result.onSuccess { load() }
            onResult(result)
        }
    }
}

class CommunitiesViewModelFactory(private val repository: CommunitiesRepository) : ViewModelProvider.Factory {
    override fun <T : ViewModel> create(modelClass: Class<T>): T {
        @Suppress("UNCHECKED_CAST")
        return CommunitiesViewModel(repository) as T
    }
}
