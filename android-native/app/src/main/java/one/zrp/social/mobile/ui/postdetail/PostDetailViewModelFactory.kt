package one.zrp.social.mobile.ui.postdetail

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import one.zrp.social.mobile.data.PostsRepository

class PostDetailViewModelFactory(
    private val repository: PostsRepository,
    private val postId: String,
) : ViewModelProvider.Factory {
    @Suppress("UNCHECKED_CAST")
    override fun <T : ViewModel> create(modelClass: Class<T>): T {
        return PostDetailViewModel(repository, postId) as T
    }
}
