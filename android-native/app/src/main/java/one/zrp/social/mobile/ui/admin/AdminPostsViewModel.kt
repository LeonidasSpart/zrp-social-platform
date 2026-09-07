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
import one.zrp.social.mobile.network.AdminPost

data class AdminPostsUiState(
    val isLoading: Boolean = true,
    val search: String = "",
    val posts: List<AdminPost> = emptyList(),
    val page: Int = 1,
    val totalPages: Int = 1,
    val deletingId: String? = null,
    val pendingDeleteId: String? = null,
    val error: String? = null,
)

/** Ported from src/app/admin/posts/page.tsx - see AdminApi's own KDoc. */
class AdminPostsViewModel(private val repository: AdminRepository) : ViewModel() {
    private val _state = MutableStateFlow(AdminPostsUiState())
    val state: StateFlow<AdminPostsUiState> = _state.asStateFlow()

    fun load() {
        val s = _state.value
        _state.update { it.copy(isLoading = true, error = null) }
        viewModelScope.launch {
            repository.getPosts(s.search, s.page)
                .onSuccess { response ->
                    _state.update { it.copy(isLoading = false, posts = response.posts, totalPages = response.totalPages) }
                }
                .onFailure { error -> _state.update { it.copy(isLoading = false, error = error.message) } }
        }
    }

    fun setSearch(value: String) = _state.update { it.copy(search = value) }

    fun submitSearch() {
        _state.update { it.copy(page = 1) }
        load()
    }

    fun setPage(page: Int) {
        if (page < 1 || page > _state.value.totalPages) return
        _state.update { it.copy(page = page) }
        load()
    }

    fun requestDelete(postId: String) = _state.update { it.copy(pendingDeleteId = postId) }
    fun cancelDelete() = _state.update { it.copy(pendingDeleteId = null) }

    fun confirmDelete() {
        val postId = _state.value.pendingDeleteId ?: return
        _state.update { it.copy(pendingDeleteId = null, deletingId = postId, error = null) }
        viewModelScope.launch {
            repository.deletePost(postId)
                .onSuccess {
                    _state.update { current ->
                        current.copy(deletingId = null, posts = current.posts.filterNot { it.id == postId })
                    }
                }
                .onFailure { error -> _state.update { it.copy(deletingId = null, error = error.message) } }
        }
    }

    fun consumeError() = _state.update { it.copy(error = null) }
}

class AdminPostsViewModelFactory(private val repository: AdminRepository) : ViewModelProvider.Factory {
    @Suppress("UNCHECKED_CAST")
    override fun <T : ViewModel> create(modelClass: Class<T>): T = AdminPostsViewModel(repository) as T
}
