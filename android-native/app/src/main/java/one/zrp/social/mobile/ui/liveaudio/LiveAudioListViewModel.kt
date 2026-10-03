package one.zrp.social.mobile.ui.liveaudio

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import one.zrp.social.mobile.data.CommunitiesRepository
import one.zrp.social.mobile.data.LiveAudioRepository
import one.zrp.social.mobile.network.CommunitySummary
import one.zrp.social.mobile.network.CreateLiveAudioRoomRequest
import one.zrp.social.mobile.network.LiveAudioRoomSummary
import one.zrp.social.mobile.ui.live.liveIsoFromMillis

data class LiveAudioListUiState(
    val isLoading: Boolean = true,
    val rooms: List<LiveAudioRoomSummary> = emptyList(),
    val nextCursor: String? = null,
    val endReached: Boolean = false,
    val isLoadingMore: Boolean = false,
    val error: String? = null,
    val myCommunities: List<CommunitySummary> = emptyList(),
    val isCreating: Boolean = false,
    val createError: String? = null,
    // One-shot: a just-created room's id, consumed by the screen to
    // navigate straight into it - matches src/app/live-audio/page.tsx's
    // own router.push(`/live-audio/${room.id}`) right after a
    // successful POST /rooms.
    val createdRoomId: String? = null,
)

/**
 * ZRP Live Audio's discovery/"Go Live" screen - ported from
 * src/app/live-audio/page.tsx. The list itself works logged-out for
 * PUBLIC rooms (GET /live-audio/rooms has no auth requirement), but
 * creating a room always requires a paid plan - server-enforced
 * (requireLiveAudioAccess), this is not re-implemented client-side.
 */
class LiveAudioListViewModel(
    private val repository: LiveAudioRepository,
    private val communitiesRepository: CommunitiesRepository = CommunitiesRepository(),
) : ViewModel() {
    private val _state = MutableStateFlow(LiveAudioListUiState())
    val state: StateFlow<LiveAudioListUiState> = _state.asStateFlow()

    init {
        refresh()
    }

    fun refresh() {
        _state.update { it.copy(isLoading = true, error = null) }
        viewModelScope.launch {
            repository.getRooms(cursor = null)
                .onSuccess { page ->
                    _state.update {
                        it.copy(
                            isLoading = false,
                            rooms = page.rooms,
                            nextCursor = page.nextCursor,
                            endReached = page.nextCursor == null,
                        )
                    }
                }
                .onFailure { error ->
                    _state.update { it.copy(isLoading = false, error = error.message ?: "Couldn't load live rooms") }
                }
        }
    }

    fun loadMore() {
        val s = _state.value
        val cursor = s.nextCursor ?: return
        if (s.isLoadingMore || s.endReached) return
        _state.update { it.copy(isLoadingMore = true) }
        viewModelScope.launch {
            repository.getRooms(cursor)
                .onSuccess { page ->
                    _state.update {
                        it.copy(
                            rooms = it.rooms + page.rooms,
                            nextCursor = page.nextCursor,
                            isLoadingMore = false,
                            endReached = page.nextCursor == null,
                        )
                    }
                }
                .onFailure { _state.update { it.copy(isLoadingMore = false) } }
        }
    }

    // Loaded lazily (only once the create-room sheet actually opens,
    // since most sessions never open it) - reuses the same real GET
    // /communities the Communities tab uses, filtered to membership
    // client-side (no dedicated "my communities" endpoint exists).
    fun loadMyCommunities() {
        if (_state.value.myCommunities.isNotEmpty()) return
        viewModelScope.launch {
            communitiesRepository.getCommunities(category = null, search = null)
                .onSuccess { communities ->
                    _state.update { it.copy(myCommunities = communities.filter { c -> c.isMember }) }
                }
        }
    }

    fun createRoom(
        title: String,
        description: String?,
        category: String?,
        visibility: String,
        communityId: String?,
        scheduledAtMillis: Long?,
    ) {
        val trimmedTitle = title.trim()
        if (trimmedTitle.isEmpty()) {
            _state.update { it.copy(createError = "Title is required") }
            return
        }
        _state.update { it.copy(isCreating = true, createError = null) }
        viewModelScope.launch {
            val request = CreateLiveAudioRoomRequest(
                title = trimmedTitle,
                description = description?.trim()?.ifEmpty { null },
                category = category?.trim()?.ifEmpty { null },
                visibility = visibility,
                communityId = if (visibility == "COMMUNITY") communityId else null,
                // SimpleDateFormat-based, not java.time.Instant: minSdk 24 has no
                // java.time without desugaring (this line was unreachable before
                // scheduling existed in the UI, so it never crashed).
                scheduledAt = scheduledAtMillis?.let { liveIsoFromMillis(it) },
            )
            repository.createRoom(request)
                .onSuccess { response ->
                    _state.update { it.copy(isCreating = false, createdRoomId = response.room.id) }
                }
                .onFailure { error ->
                    _state.update { it.copy(isCreating = false, createError = error.message ?: "Couldn't start the room") }
                }
        }
    }

    fun consumeCreatedRoom() {
        _state.update { it.copy(createdRoomId = null) }
    }

    fun dismissCreateError() {
        _state.update { it.copy(createError = null) }
    }
}

class LiveAudioListViewModelFactory(private val repository: LiveAudioRepository) : ViewModelProvider.Factory {
    @Suppress("UNCHECKED_CAST")
    override fun <T : ViewModel> create(modelClass: Class<T>): T = LiveAudioListViewModel(repository) as T
}
