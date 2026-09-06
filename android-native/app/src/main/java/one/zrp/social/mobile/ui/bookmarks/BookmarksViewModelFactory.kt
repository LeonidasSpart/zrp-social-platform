package one.zrp.social.mobile.ui.bookmarks

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import one.zrp.social.mobile.data.BookmarksRepository

class BookmarksViewModelFactory(private val repository: BookmarksRepository) : ViewModelProvider.Factory {
    override fun <T : ViewModel> create(modelClass: Class<T>): T {
        @Suppress("UNCHECKED_CAST")
        return BookmarksViewModel(repository) as T
    }
}
