package one.zrp.social.mobile.ui.reposts

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import one.zrp.social.mobile.data.PostsRepository

class RepostsViewModelFactory(
    private val repository: PostsRepository,
    private val postId: String,
) : ViewModelProvider.Factory {
    override fun <T : ViewModel> create(modelClass: Class<T>): T {
        @Suppress("UNCHECKED_CAST")
        return RepostsViewModel(repository, postId) as T
    }
}
