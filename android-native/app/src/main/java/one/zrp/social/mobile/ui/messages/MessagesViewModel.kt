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
import one.zrp.social.mobile.network.SocketUserStatusPayload
import one.zrp.social.mobile.network.ZrpSocket
import org.json.JSONObject

data class MessagesUiState(
    val conversations: List<ConversationSummary> = emptyList(),
    val isLoading: Boolean = true,
    val isRefreshing: Boolean = false,
    val error: String? = null,
    // Real presence for every listed partner (server.js's own
    // userStatus Map, via "user-status"/"get-status" - see
    // requestStatusForConversations's own KDoc). Absence of a key means
    // "no answer heard yet", not "offline" - ConversationRow only
    // renders a dot once a key actually exists.
    val presence: Map<String, Boolean> = emptyMap(),
)

/**
 * Backs the Messages tab's conversation list - the same real
 * GET /messages the website's inbox uses, plus a real (not simulated)
 * Socket.IO connection scoped to this screen's own lifecycle purely
 * for presence - matching ZrpSocket's own documented one-socket-per-
 * screen convention (see its KDoc) rather than a shared app-wide
 * connection this app doesn't otherwise have.
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
    }

    override fun onCleared() {
        socket?.let { liveSocket ->
            liveSocket.off("user-status")
            liveSocket.disconnect()
        }
        socket = null
    }

    // One real "get-status" round trip per partner, the first time each
    // is seen - every online/offline transition after that already
    // arrives unprompted via the live "user-status" broadcast above, so
    // this never re-asks for a partner it's already requested (a
    // refresh/pull-to-refresh reloading the same conversations must not
    // re-spam get-status for rows already answered).
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

            repository.getConversations()
                .onSuccess { list ->
                    _state.update { it.copy(conversations = list, isLoading = false, isRefreshing = false) }
                    requestStatusForConversations(list)
                }
                .onFailure { error ->
                    _state.update {
                        it.copy(isLoading = false, isRefreshing = false, error = error.message ?: "Couldn't load conversations.")
                    }
                }
        }
    }
}
