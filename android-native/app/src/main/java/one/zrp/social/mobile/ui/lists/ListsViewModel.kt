package one.zrp.social.mobile.ui.lists

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import one.zrp.social.mobile.data.ListsRepository
import one.zrp.social.mobile.network.ListSummary

data class ListsUiState(
    val lists: List<ListSummary> = emptyList(),
    val isLoading: Boolean = true,
    val error: String? = null,
    val isCreating: Boolean = false,
    val createError: String? = null,
)

class ListsViewModel(private val repository: ListsRepository) : ViewModel() {
    private val _state = MutableStateFlow(ListsUiState())
    val state: StateFlow<ListsUiState> = _state.asStateFlow()

    init { load() }

    fun load() {
        _state.update { it.copy(isLoading = true, error = null) }
        viewModelScope.launch {
            repository.getMyLists()
                .onSuccess { lists -> _state.update { it.copy(lists = lists, isLoading = false) } }
                .onFailure { error -> _state.update { it.copy(isLoading = false, error = error.message) } }
        }
    }

    fun createList(name: String, description: String?, isPrivate: Boolean, onResult: (Result<ListSummary>) -> Unit) {
        _state.update { it.copy(isCreating = true, createError = null) }
        viewModelScope.launch {
            val result = repository.createList(name, description, isPrivate)
            _state.update { it.copy(isCreating = false, createError = result.exceptionOrNull()?.message) }
            result.onSuccess { load() }
            onResult(result)
        }
    }
}

class ListsViewModelFactory(private val repository: ListsRepository) : ViewModelProvider.Factory {
    override fun <T : ViewModel> create(modelClass: Class<T>): T {
        @Suppress("UNCHECKED_CAST")
        return ListsViewModel(repository) as T
    }
}
