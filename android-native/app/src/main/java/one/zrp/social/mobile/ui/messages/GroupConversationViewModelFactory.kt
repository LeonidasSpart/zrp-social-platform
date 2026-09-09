package one.zrp.social.mobile.ui.messages

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import one.zrp.social.mobile.data.MessagesRepository

class GroupConversationViewModelFactory(
    private val repository: MessagesRepository,
    private val conversationId: String,
    private val currentUserId: String,
) : ViewModelProvider.Factory {
    @Suppress("UNCHECKED_CAST")
    override fun <T : ViewModel> create(modelClass: Class<T>): T {
        return GroupConversationViewModel(repository, conversationId, currentUserId) as T
    }
}
