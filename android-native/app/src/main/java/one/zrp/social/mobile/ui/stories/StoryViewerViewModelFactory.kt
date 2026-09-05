package one.zrp.social.mobile.ui.stories

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import one.zrp.social.mobile.data.StoriesRepository

class StoryViewerViewModelFactory(
    private val repository: StoriesRepository,
    private val userId: String,
) : ViewModelProvider.Factory {
    @Suppress("UNCHECKED_CAST")
    override fun <T : ViewModel> create(modelClass: Class<T>): T {
        return StoryViewerViewModel(repository, userId) as T
    }
}
