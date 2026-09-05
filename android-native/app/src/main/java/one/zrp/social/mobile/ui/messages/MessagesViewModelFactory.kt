package one.zrp.social.mobile.ui.messages

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import one.zrp.social.mobile.data.MessagesRepository

class MessagesViewModelFactory(private val repository: MessagesRepository) : ViewModelProvider.Factory {
    @Suppress("UNCHECKED_CAST")
    override fun <T : ViewModel> create(modelClass: Class<T>): T {
        return MessagesViewModel(repository) as T
    }
}
