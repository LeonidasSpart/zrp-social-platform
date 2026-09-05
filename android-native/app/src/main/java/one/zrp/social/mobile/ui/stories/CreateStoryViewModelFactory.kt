package one.zrp.social.mobile.ui.stories

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import one.zrp.social.mobile.data.StoriesRepository

class CreateStoryViewModelFactory(private val repository: StoriesRepository) : ViewModelProvider.Factory {
    @Suppress("UNCHECKED_CAST")
    override fun <T : ViewModel> create(modelClass: Class<T>): T {
        return CreateStoryViewModel(repository) as T
    }
}
