package one.zrp.social.mobile.ui.comments

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import one.zrp.social.mobile.data.CommentsRepository

class CommentsViewModelFactory(
    private val repository: CommentsRepository,
    private val postId: String,
) : ViewModelProvider.Factory {
    @Suppress("UNCHECKED_CAST")
    override fun <T : ViewModel> create(modelClass: Class<T>): T {
        return CommentsViewModel(repository, postId) as T
    }
}
