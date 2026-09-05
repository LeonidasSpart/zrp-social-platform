package one.zrp.social.mobile.ui.search

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import one.zrp.social.mobile.data.SearchRepository

class SearchViewModelFactory(private val repository: SearchRepository) : ViewModelProvider.Factory {
    @Suppress("UNCHECKED_CAST")
    override fun <T : ViewModel> create(modelClass: Class<T>): T {
        return SearchViewModel(repository) as T
    }
}
