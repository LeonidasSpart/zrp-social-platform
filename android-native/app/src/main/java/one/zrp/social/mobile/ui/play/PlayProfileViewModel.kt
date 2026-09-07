package one.zrp.social.mobile.ui.play

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import one.zrp.social.mobile.data.PlayRepository
import one.zrp.social.mobile.network.PlayProfileResponse

data class PlayProfileUiState(
    val isLoading: Boolean = true,
    val notFound: Boolean = false,
    val profile: PlayProfileResponse? = null,
)

/** A player's public PLAY profile - ported from PlayProfilePage.tsx. */
class PlayProfileViewModel(
    private val username: String,
    private val repository: PlayRepository,
) : ViewModel() {
    private val _state = MutableStateFlow(PlayProfileUiState())
    val state: StateFlow<PlayProfileUiState> = _state.asStateFlow()

    init {
        viewModelScope.launch {
            repository.getProfile(username)
                .onSuccess { response -> _state.update { it.copy(isLoading = false, profile = response) } }
                .onFailure { _state.update { it.copy(isLoading = false, notFound = true) } }
        }
    }
}

class PlayProfileViewModelFactory(
    private val username: String,
    private val repository: PlayRepository,
) : ViewModelProvider.Factory {
    @Suppress("UNCHECKED_CAST")
    override fun <T : ViewModel> create(modelClass: Class<T>): T = PlayProfileViewModel(username, repository) as T
}
