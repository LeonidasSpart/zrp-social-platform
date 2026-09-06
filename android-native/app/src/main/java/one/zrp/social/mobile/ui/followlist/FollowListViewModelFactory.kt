package one.zrp.social.mobile.ui.followlist

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import one.zrp.social.mobile.data.ProfileRepository

class FollowListViewModelFactory(
    private val repository: ProfileRepository,
    private val username: String,
    private val mode: FollowListMode,
) : ViewModelProvider.Factory {
    override fun <T : ViewModel> create(modelClass: Class<T>): T {
        @Suppress("UNCHECKED_CAST")
        return FollowListViewModel(repository, username, mode) as T
    }
}
