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
import one.zrp.social.mobile.network.NewsArticleDetail

data class NewsArticleUiState(
    val isLoading: Boolean = true,
    val notFound: Boolean = false,
    val article: NewsArticleDetail? = null,
)

/** ZRP News article - ported from news/[slug]/page.tsx. */
class NewsArticleViewModel(private val slug: String, private val repository: NewsRepository) : ViewModel() {
    private val _state = MutableStateFlow(NewsArticleUiState())
    val state: StateFlow<NewsArticleUiState> = _state.asStateFlow()

    init {
        viewModelScope.launch {
            repository.getArticle(slug)
                .onSuccess { article -> _state.update { it.copy(isLoading = false, article = article) } }
                .onFailure { _state.update { it.copy(isLoading = false, notFound = true) } }
        }
    }
}

class NewsArticleViewModelFactory(
    private val slug: String,
    private val repository: NewsRepository,
) : ViewModelProvider.Factory {
    @Suppress("UNCHECKED_CAST")
    override fun <T : ViewModel> create(modelClass: Class<T>): T = NewsArticleViewModel(slug, repository) as T
}
