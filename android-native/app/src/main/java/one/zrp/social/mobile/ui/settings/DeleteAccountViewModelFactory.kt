package one.zrp.social.mobile.ui.settings

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import one.zrp.social.mobile.data.SettingsRepository

class DeleteAccountViewModelFactory(private val repository: SettingsRepository) : ViewModelProvider.Factory {
    @Suppress("UNCHECKED_CAST")
    override fun <T : ViewModel> create(modelClass: Class<T>): T {
        return DeleteAccountViewModel(repository) as T
    }
}
