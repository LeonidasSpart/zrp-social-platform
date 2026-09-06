package one.zrp.social.mobile.ui.create

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import one.zrp.social.mobile.data.PostsRepository

class CreatePostViewModelFactory(
    private val repository: PostsRepository,
    private val quotePostId: String? = null,
) : ViewModelProvider.Factory {
    @Suppress("UNCHECKED_CAST")
    override fun <T : ViewModel> create(modelClass: Class<T>): T {
        return CreatePostViewModel(repository, quotePostId) as T
    }
}
