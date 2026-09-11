package one.zrp.social.mobile.ui.messages

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.google.gson.Gson
import io.socket.client.Socket
import io.socket.emitter.Emitter
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import one.zrp.social.mobile.data.MessagesRepository
import one.zrp.social.mobile.network.ApiClient
import one.zrp.social.mobile.network.ConversationSummary
import one.zrp.social.mobile.network.GroupConversationSummary
import one.zrp.social.mobile.network.SocketConversationDeletedPayload
import one.zrp.social.mobile.network.SocketUserStatusPayload
import one.zrp.social.mobile.network.ZrpSocket
import org.json.JSONObject

/**
 * One row in the merged Messages tab list - real 1:1 conversations and
 * real GROUP conversations interleaved by actual recency (most recent
 * message first, across both kinds together), not two separate
 * sections. A brand-new group nobody has sent into yet has no
 * lastMessage at all (see GroupConversationSummary's own KDoc) and
 * sorts to the very end - there's no real timestamp to rank it by.
 */
sealed class ConversationListItem {
    abstract val key: String
    abstract val sortTimestamp: String

    data class Direct(val summary: ConversationSummary) : ConversationListItem() {
        override val key: String get() = "direct:${summary.partner.id}"
        override val sortTimestamp: String get() = summary.lastMessage.createdAt
    }

    data class Group(val summary: GroupConversationSummary) : ConversationListItem() {
        override val key: String get() = "group:${summary.id}"
        override val sortTimestamp: String get() = summary.lastMessage?.createdAt ?: ""
    }
}

/**
 * Merges [direct] and [group] into one recency-sorted list - a pure
 * function (no ViewModel/socket state) so the merge/sort rule itself is
 * easy to reason about and review on its own, the same spirit as
 * aggregateUnreadCount. createdAt is a real ISO-8601 timestamp string
 * (server-generated, same format both endpoints already return), which
 * sorts correctly as a plain string compare - no date parsing needed.
 */
fun mergeConversations(direct: List<ConversationSummary>, group: List<GroupConversationSummary>): List<ConversationListItem> {
    val items: List<ConversationListItem> = direct.map { ConversationListItem.Direct(it) } +
        group.map { ConversationListItem.Group(it) }
    return items.sortedByDescending { it.sortTimestamp }
}

/**
 * Drops the direct conversation with [partnerId] from [items], leaving
 * every group row and every other direct row untouched - the one filter
 * rule shared by both places a conversation can disappear from this
 * screen's list: a successful delete from this device (deleteConversation
 * below) and the "conversation-deleted" relay for one deleted elsewhere
 * (MessagesViewModel.connectSocket). A pure function, like
 * mergeConversations above, so this rule has a direct JUnit test rather
 * than only being exercised through the ViewModel's socket/repository
 * plumbing.
 */
fun conversationsAfterDirectDelete(items: List<ConversationListItem>, partnerId: String): List<ConversationListItem> =
    items.filterNot { it is ConversationListItem.Direct && it.summary.partner.id == partnerId }

data class MessagesUiState(
    val items: List<ConversationListItem> = emptyList(),
    val isLoading: Boolean = true,
    val isRefreshing: Boolean = false,
    val error: String? = null,
    // Real presence for every listed 1:1 partner (server.js's own
    // userStatus Map, via "user-status"/"get-status" - see
    // requestStatusForConversations's own KDoc). Absence of a key means
    // "no answer heard yet", not "offline" - ConversationRow only
    // renders a dot once a key actually exists. Group rows show a
    // member-count chip instead of a single presence dot (see
    // GroupConversationRow) - a group has many participants, not one
    // partner to be online/offline.
    val presence: Map<String, Boolean> = emptyMap(),
)

/**
 * Backs the Messages tab's conversation list - the same real GET
 * /messages (1:1) merged with real GET /conversations (GROUP), plus a
 * real (not simulated) Socket.IO connection scoped to this screen's own
 * lifecycle purely for 1:1 presence - matching ZrpSocket's own
 * documented one-socket-per-screen convention (see its KDoc) rather
 * than a shared app-wide connection this app doesn't otherwise have.
 */
class MessagesViewModel(private val repository: MessagesRepository) : ViewModel() {
    private val _state = MutableStateFlow(MessagesUiState())
    val state: StateFlow<MessagesUiState> = _state.asStateFlow()

    private val gson = Gson()
    private var socket: Socket? = null
    private val requestedStatusFor = mutableSetOf<String>()

    init {
        load(isInitial = true)
        connectSocket()
    }

    private fun connectSocket() {
        val tokenStore = ApiClient.getTokenStore()
        val liveSocket = ZrpSocket.connect(tokenStore)
        socket = liveSocket

        liveSocket.on("user-status", Emitter.Listener { args ->
            val json = args.getOrNull(0) as? JSONObject ?: return@Listener
            val payload = try {
                gson.fromJson(json.toString(), SocketUserStatusPayload::class.java)
            } catch (e: Exception) {
                null
            } ?: return@Listener
            _state.update { it.copy(presence = it.presence + (payload.userId to (payload.status == "online"))) }
        })

        // A conversation deleted elsewhere (the web app, or this same
        // account open on another device) - see server.js's own
        // "delete-conversation" relay, which reaches both parties' rooms
        // plus every other session of the deleting user. Without this,
        // this screen would keep showing a row for a conversation that
        // no longer exists server-side until the next full refresh.
        liveSocket.on("conversation-deleted", Emitter.Listener { args ->
            val json = args.getOrNull(0) as? JSONObject ?: return@Listener
            val payload = try {
                gson.fromJson(json.toString(), SocketConversationDeletedPayload::class.java)
            } catch (e: Exception) {
                null
            } ?: return@Listener
            removeDirectConversation(payload.withUserId)
        })
    }

    override fun onCleared() {
        socket?.let { liveSocket ->
            liveSocket.off("user-status")
            liveSocket.off("conversation-deleted")
            liveSocket.disconnect()
        }
        socket = null
    }

    private fun removeDirectConversation(partnerId: String) {
        _state.update { current -> current.copy(items = conversationsAfterDirectDelete(current.items, partnerId)) }
    }

    /**
     * Deletes the whole 1:1 conversation with [partnerId] - the real,
     * permanent server-side delete (see MessagesRepository's own KDoc),
     * not a local-only hide. On success the row is removed immediately
     * and the same "delete-conversation" socket relay the website emits
     * is sent too, so the other party's own list (and this account's
     * other open sessions) update live rather than only on their next
     * refresh. On failure the row is left exactly as it was and the
     * caller is handed the real error to show - this never pretends a
     * failed delete succeeded.
     */
    fun deleteConversation(partnerId: String, onResult: (Result<Unit>) -> Unit) {
        viewModelScope.launch {
            val result = repository.deleteConversation(partnerId)
            if (result.isSuccess) {
                removeDirectConversation(partnerId)
                socket?.emit("delete-conversation", JSONObject().put("otherUserId", partnerId))
            }
            onResult(result)
        }
    }

    // One real "get-status" round trip per 1:1 partner, the first time
    // each is seen - every online/offline transition after that already
    // arrives unprompted via the live "user-status" broadcast above, so
    // this never re-asks for a partner it's already requested (a
    // refresh/pull-to-refresh reloading the same conversations must not
    // re-spam get-status for rows already answered). Group rows have no
    // equivalent call - see MessagesUiState's own KDoc on why group rows
    // don't show single-partner presence.
    private fun requestStatusForConversations(conversations: List<ConversationSummary>) {
        val liveSocket = socket ?: return
        conversations.forEach { conv ->
            val partnerId = conv.partner.id
            if (requestedStatusFor.add(partnerId)) {
                liveSocket.emit("get-status", partnerId)
            }
        }
    }

    fun refresh() = load(isInitial = false)

    private fun load(isInitial: Boolean) {
        viewModelScope.launch {
            _state.update {
                if (isInitial) it.copy(isLoading = true, error = null) else it.copy(isRefreshing = true, error = null)
            }

            val directResult = repository.getConversations()
            val groupResult = repository.getGroupConversations()

            // Either real list loading is enough to show something -
            // only a total failure of both surfaces the error state,
            // matching how a partial outage (one endpoint down) should
            // never blank out conversations the other endpoint already
            // has.
            if (directResult.isFailure && groupResult.isFailure) {
                _state.update {
                    it.copy(
                        isLoading = false,
                        isRefreshing = false,
                        error = directResult.exceptionOrNull()?.message ?: "Couldn't load conversations.",
                    )
                }
                return@launch
            }

            val direct = directResult.getOrDefault(emptyList())
            val group = groupResult.getOrDefault(emptyList())
            _state.update {
                it.copy(items = mergeConversations(direct, group), isLoading = false, isRefreshing = false, error = null)
            }
            requestStatusForConversations(direct)
        }
    }
}
