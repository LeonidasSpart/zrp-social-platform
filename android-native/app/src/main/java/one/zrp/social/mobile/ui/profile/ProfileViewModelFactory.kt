package one.zrp.social.mobile.ui.profile

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import one.zrp.social.mobile.data.ProfileRepository

class ProfileViewModelFactory(
    private val repository: ProfileRepository,
    private val username: String?,
) : ViewModelProvider.Factory {
    @Suppress("UNCHECKED_CAST")
    override fun <T : ViewModel> create(modelClass: Class<T>): T {
        return ProfileViewModel(repository, username) as T
    }
}
