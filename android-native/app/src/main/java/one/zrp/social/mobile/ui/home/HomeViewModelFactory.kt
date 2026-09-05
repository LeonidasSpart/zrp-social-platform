package one.zrp.social.mobile.ui.home

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import one.zrp.social.mobile.data.PostsRepository

class HomeViewModelFactory(private val repository: PostsRepository) : ViewModelProvider.Factory {
    @Suppress("UNCHECKED_CAST")
    override fun <T : ViewModel> create(modelClass: Class<T>): T {
        return HomeViewModel(repository) as T
    }
}
