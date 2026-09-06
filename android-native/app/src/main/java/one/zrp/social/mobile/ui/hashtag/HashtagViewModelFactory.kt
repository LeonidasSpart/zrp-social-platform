package one.zrp.social.mobile.ui.hashtag

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import one.zrp.social.mobile.data.PostsRepository

class HashtagViewModelFactory(
    private val repository: PostsRepository,
    private val tag: String,
) : ViewModelProvider.Factory {
    @Suppress("UNCHECKED_CAST")
    override fun <T : ViewModel> create(modelClass: Class<T>): T {
        return HashtagViewModel(repository, tag) as T
    }
}
