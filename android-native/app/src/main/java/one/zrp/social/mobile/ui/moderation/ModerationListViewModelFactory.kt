package one.zrp.social.mobile.ui.moderation

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import one.zrp.social.mobile.data.ProfileRepository

class ModerationListViewModelFactory(
    private val repository: ProfileRepository,
    private val mode: ModerationListMode,
) : ViewModelProvider.Factory {
    override fun <T : ViewModel> create(modelClass: Class<T>): T {
        @Suppress("UNCHECKED_CAST")
        return ModerationListViewModel(repository, mode) as T
    }
}
