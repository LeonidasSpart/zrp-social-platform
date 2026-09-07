package one.zrp.social.mobile.ui.news

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import one.zrp.social.mobile.data.NewsRepository
import one.zrp.social.mobile.network.NewsArticleSummary

data class NewsUiState(
    val isLoading: Boolean = true,
    val loadingMore: Boolean = false,
    val error: Boolean = false,
    val articles: List<NewsArticleSummary> = emptyList(),
    val selectedCategory: String? = null,
    val nextCursor: String? = null,
    val hasMore: Boolean = false,
) {
    val featuredArticle: NewsArticleSummary? get() = articles.find { it.featured } ?: articles.firstOrNull()
    val regularArticles: List<NewsArticleSummary> get() {
        val featured = featuredArticle ?: return articles
        return articles.filter { it.id != featured.id }
    }
}

/** ZRP News browse - ported from NewsPage.tsx: category filter, featured hero, article grid, cursor pagination. */
class NewsViewModel(private val repository: NewsRepository) : ViewModel() {
    private val _state = MutableStateFlow(NewsUiState())
    val state: StateFlow<NewsUiState> = _state.asStateFlow()

    init {
        load()
    }

    fun selectCategory(category: String?) {
        if (category == _state.value.selectedCategory) return
        _state.update { NewsUiState(selectedCategory = category) }
        load()
    }

    fun retry() = load()

    private fun load() {
        _state.update { it.copy(isLoading = true, error = false) }
        viewModelScope.launch {
            repository.getNews(category = _state.value.selectedCategory)
                .onSuccess { response ->
                    _state.update {
                        it.copy(
                            isLoading = false,
                            articles = response.articles,
                            hasMore = response.pagination.hasMore,
                            nextCursor = response.pagination.nextCursor,
                        )
                    }
                }
                .onFailure { _state.update { it.copy(isLoading = false, error = true) } }
        }
    }

    fun loadMore() {
        val s = _state.value
        val cursor = s.nextCursor ?: return
        if (s.loadingMore || !s.hasMore) return
        _state.update { it.copy(loadingMore = true) }
        viewModelScope.launch {
            repository.getNews(cursor = cursor, category = s.selectedCategory)
                .onSuccess { response ->
                    _state.update {
                        it.copy(
                            loadingMore = false,
                            articles = it.articles + response.articles,
                            hasMore = response.pagination.hasMore,
                            nextCursor = response.pagination.nextCursor,
                        )
                    }
                }
                .onFailure { _state.update { it.copy(loadingMore = false) } }
        }
    }
}

class NewsViewModelFactory(private val repository: NewsRepository) : ViewModelProvider.Factory {
    @Suppress("UNCHECKED_CAST")
    override fun <T : ViewModel> create(modelClass: Class<T>): T = NewsViewModel(repository) as T
}
