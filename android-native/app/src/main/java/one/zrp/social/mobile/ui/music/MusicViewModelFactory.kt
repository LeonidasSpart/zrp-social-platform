package one.zrp.social.mobile.ui.music

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import one.zrp.social.mobile.data.MusicRepository

class MusicViewModelFactory(
    private val repository: MusicRepository,
    private val player: MusicPlayerViewModel,
) : ViewModelProvider.Factory {
    @Suppress("UNCHECKED_CAST")
    override fun <T : ViewModel> create(modelClass: Class<T>): T {
        return MusicViewModel(repository, player) as T
    }
}
