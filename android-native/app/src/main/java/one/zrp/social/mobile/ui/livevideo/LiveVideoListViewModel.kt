package one.zrp.social.mobile.ui.livevideo

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import one.zrp.social.mobile.data.CommunitiesRepository
import one.zrp.social.mobile.data.LiveVideoRepository
import one.zrp.social.mobile.network.CommunitySummary
import one.zrp.social.mobile.network.CreateLiveAudioRoomRequest
import one.zrp.social.mobile.network.LiveVideoRoomSummary
import one.zrp.social.mobile.ui.live.liveIsoFromMillis

data class LiveVideoListUiState(
    val isLoading: Boolean = true,
    val rooms: List<LiveVideoRoomSummary> = emptyList(),
    val nextCursor: String? = null,
    val endReached: Boolean = false,
    val isLoadingMore: Boolean = false,
    val error: String? = null,
    val myCommunities: List<CommunitySummary> = emptyList(),
    val isCreating: Boolean = false,
    val createError: String? = null,
    // One-shot: navigate straight into a just-created room (LIVE or SCHEDULED).
    val createdRoomId: String? = null,
)

/**
 * ZRP Live Video discovery + "Go Live" - ported from
 * src/app/live-video/page.tsx, the same shape as LiveAudioListViewModel.
 * GET /live-video/rooms is ranked server-side (log-dampened viewer count
 * + freshness - see discovery-ranking.ts) and lists LIVE rooms only;
 * creating a room is paid-gated server-side (requireLiveVideoAccess),
 * never re-implemented here - a free user sees the server's own
 * rejection message as [LiveVideoListUiState.createError].
 */
class LiveVideoListViewModel(
    private val repository: LiveVideoRepository,
    private val communitiesRepository: CommunitiesRepository = CommunitiesRepository(),
) : ViewModel() {
    private val _state = MutableStateFlow(LiveVideoListUiState())
    val state: StateFlow<LiveVideoListUiState> = _state.asStateFlow()

    init {
        refresh()
    }

    fun refresh() {
        _state.update { it.copy(isLoading = true, error = null) }
        viewModelScope.launch {
            repository.getRooms(cursor = null)
                .onSuccess { page ->
                    _state.update {
                        it.copy(isLoading = false, rooms = page.rooms, nextCursor = page.nextCursor, endReached = page.nextCursor == null)
                    }
                }
                .onFailure { error -> _state.update { it.copy(isLoading = false, error = error.message) } }
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
                            rooms = (it.rooms + page.rooms).distinctBy { room -> room.id },
                            nextCursor = page.nextCursor,
                            isLoadingMore = false,
                            endReached = page.nextCursor == null,
                        )
                    }
                }
                .onFailure { _state.update { it.copy(isLoadingMore = false) } }
        }
    }

    fun loadMyCommunities() {
        if (_state.value.myCommunities.isNotEmpty()) return
        viewModelScope.launch {
            communitiesRepository.getCommunities(category = null, search = null)
                .onSuccess { communities -> _state.update { it.copy(myCommunities = communities.filter { c -> c.isMember }) } }
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
        if (trimmedTitle.isEmpty()) return
        _state.update { it.copy(isCreating = true, createError = null) }
        viewModelScope.launch {
            val request = CreateLiveAudioRoomRequest(
                title = trimmedTitle,
                description = description?.trim()?.ifEmpty { null },
                category = category?.trim()?.ifEmpty { null },
                visibility = visibility,
                communityId = if (visibility == "COMMUNITY") communityId else null,
                scheduledAt = scheduledAtMillis?.let { liveIsoFromMillis(it) },
            )
            repository.createRoom(request)
                .onSuccess { response -> _state.update { it.copy(isCreating = false, createdRoomId = response.room.id) } }
                .onFailure { error -> _state.update { it.copy(isCreating = false, createError = error.message) } }
        }
    }

    fun consumeCreatedRoom() {
        _state.update { it.copy(createdRoomId = null) }
    }

    fun dismissCreateError() {
        _state.update { it.copy(createError = null) }
    }
}

class LiveVideoListViewModelFactory(private val repository: LiveVideoRepository) : ViewModelProvider.Factory {
    @Suppress("UNCHECKED_CAST")
    override fun <T : ViewModel> create(modelClass: Class<T>): T = LiveVideoListViewModel(repository) as T
}
