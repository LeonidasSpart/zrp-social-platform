package one.zrp.social.mobile.ui.music

import android.content.ComponentName
import android.content.Context
import android.net.Uri
import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import androidx.media3.common.MediaItem
import androidx.media3.common.MediaMetadata
import androidx.media3.common.PlaybackException
import androidx.media3.common.Player
import androidx.media3.session.MediaController
import androidx.media3.session.SessionToken
import com.google.common.util.concurrent.ListenableFuture
import com.google.common.util.concurrent.MoreExecutors
import kotlinx.coroutines.Deferred
import kotlinx.coroutines.async
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.suspendCancellableCoroutine
import one.zrp.social.mobile.data.MusicRepository
import one.zrp.social.mobile.network.MusicTrack
import one.zrp.social.mobile.service.MusicPlaybackService
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException

data class MusicPlayerUiState(
    val currentTrack: MusicTrack? = null,
    val queue: List<MusicTrack> = emptyList(),
    val isPlaying: Boolean = false,
    val isBuffering: Boolean = false,
    val positionMs: Long = 0L,
    val durationMs: Long = 0L,
    val error: String? = null,
)

/**
 * Hoisted once above ZrpNavHost (see its own unreadBadgeViewModel for
 * the same pattern) so playback and the play queue survive navigating
 * between Music screens - the native equivalent of the website's own
 * MusicPlayerProvider React context, which every page under /music
 * reads from rather than each page owning its own player. Music screens that
 * only browse (Artist/Album/Playlist detail, Discover, Liked, History)
 * take this as a parameter and call into it rather than each holding
 * their own player, matching how the website's own pages all share
 * one player/queue instance.
 *
 * The actual playback engine is a MediaController bound to
 * MusicPlaybackService's ExoPlayer, not a player this ViewModel owns
 * directly - that's what makes playback survive the app being
 * backgrounded, and gets ZRP Music a real lock-screen/notification
 * media session for free (see MusicPlaybackService's own KDoc). Every
 * public method below kept its exact prior signature so none of the
 * ~15 screens that already call into this ViewModel needed to change.
 */
class MusicPlayerViewModel(
    private val repository: MusicRepository,
    private val context: Context,
) : ViewModel() {
    private val _state = MutableStateFlow(MusicPlayerUiState())
    val state: StateFlow<MusicPlayerUiState> = _state.asStateFlow()

    private val playerListener = object : Player.Listener {
        override fun onIsPlayingChanged(isPlaying: Boolean) {
            _state.update { it.copy(isPlaying = isPlaying) }
        }

        override fun onPlaybackStateChanged(playbackState: Int) {
            when (playbackState) {
                Player.STATE_BUFFERING -> _state.update { it.copy(isBuffering = true) }
                Player.STATE_READY -> _state.update { it.copy(isBuffering = false) }
                Player.STATE_ENDED -> {
                    _state.value.currentTrack?.let { reportProgress(it, completed = true) }
                    advanceToNext()
                }
            }
        }

        override fun onPlayerError(error: PlaybackException) {
            _state.update { it.copy(isPlaying = false, isBuffering = false, error = "Couldn't play this track.") }
        }
    }

    // Built once and kept around specifically so onCleared() always has
    // a valid future to hand to MediaController.releaseFuture() - the
    // documented way to release a MediaController correctly regardless
    // of whether the connection ever actually finished (e.g. the
    // ViewModel is cleared while still connecting).
    private val controllerFuture: ListenableFuture<MediaController> by lazy {
        val token = SessionToken(context, ComponentName(context, MusicPlaybackService::class.java))
        MediaController.Builder(context, token).buildAsync()
    }

    private val controllerDeferred: Deferred<MediaController> = viewModelScope.async {
        val controller = controllerFuture.await()
        controller.addListener(playerListener)
        controller
    }

    init {
        observePlaybackPosition()
    }

    private fun observePlaybackPosition() {
        viewModelScope.launch {
            val controller = controllerDeferred.await()
            while (true) {
                delay(500)
                if (_state.value.isPlaying) {
                    _state.update {
                        it.copy(
                            positionMs = controller.currentPosition,
                            durationMs = controller.duration.coerceAtLeast(0),
                        )
                    }
                }
            }
        }
    }

    // The real, confirmed behavior of clicking any track row in any
    // browsable list on the website (MusicShell.tsx's own onPlay for
    // every home section: clearQueue(), then play(track), then queues
    // every track after the clicked one in that same visible list) -
    // not just an "Play All" button's own behavior, every single track
    // click does this. [list] is whatever list the clicked track came
    // from (a home section, an artist's tracks, a playlist, etc).
    fun playFromList(track: MusicTrack, list: List<MusicTrack>) {
        // Re-clicking the track that's already playing just toggles
        // pause/resume rather than restarting it from zero - matching
        // this screen's own pre-existing single-track behavior, now
        // applied uniformly wherever a track row can be clicked.
        if (_state.value.currentTrack?.id == track.id) {
            togglePlayPause()
            return
        }

        val index = list.indexOfFirst { it.id == track.id }
        _state.update { it.copy(queue = emptyList()) }
        switchTo(track)
        if (index >= 0) {
            _state.update { it.copy(queue = list.drop(index + 1)) }
        }
    }

    // "Play All" - equivalent to clicking the first track in [list].
    fun playAll(list: List<MusicTrack>) {
        list.firstOrNull()?.let { playFromList(it, list) }
    }

    // "Shuffle" - the same clear-then-queue-the-rest behavior, against
    // a shuffled order rather than the list's own order.
    fun shuffleAll(list: List<MusicTrack>) {
        val shuffled = list.shuffled()
        shuffled.firstOrNull()?.let { playFromList(it, shuffled) }
    }

    fun addToQueue(track: MusicTrack) {
        _state.update { it.copy(queue = it.queue + track) }
    }

    // De-dupes by id (remove any existing occurrence, then insert at
    // the front) - the one queue mutator the audit of MusicPlayerProvider
    // specifically confirmed dedupes, unlike addToQueue.
    fun playNext(track: MusicTrack) {
        _state.update { it.copy(queue = listOf(track) + it.queue.filterNot { q -> q.id == track.id }) }
    }

    fun removeFromQueue(track: MusicTrack) {
        _state.update { it.copy(queue = it.queue.filterNot { q -> q.id == track.id }) }
    }

    fun clearQueue() {
        _state.update { it.copy(queue = emptyList()) }
    }

    fun playFromQueue(track: MusicTrack) {
        _state.update { it.copy(queue = it.queue.filterNot { q -> q.id == track.id }) }
        switchTo(track)
    }

    fun togglePlayPause() {
        viewModelScope.launch {
            val controller = controllerDeferred.await()
            if (controller.isPlaying) controller.pause() else controller.play()
        }
    }

    // Used by the mini-player's own heart button; screens that show a
    // track in their own list independently update that list's copy
    // from the same Boolean this returns, matching the website's own
    // per-page fetch-then-locally-mutate approach rather than a single
    // shared track cache.
    suspend fun toggleLike(track: MusicTrack): Boolean {
        val wasLiked = track.liked
        if (_state.value.currentTrack?.id == track.id) {
            _state.update { it.copy(currentTrack = it.currentTrack?.copy(liked = !wasLiked)) }
        }
        val result = repository.toggleLike(track.id)
        val nowLiked = result.getOrNull()?.liked ?: run {
            if (_state.value.currentTrack?.id == track.id) {
                _state.update { it.copy(currentTrack = it.currentTrack?.copy(liked = wasLiked)) }
            }
            wasLiked
        }
        return nowLiked
    }

    // A user-initiated switch away from whatever was already playing -
    // reports the abandoned track's partial progress first (matching
    // the website's own explicit clearQueue()+play() sequencing), unlike
    // advanceToNext()'s natural progression, which has already reported
    // the finished track as completed and must not report it again.
    private fun switchTo(track: MusicTrack) {
        val previous = _state.value.currentTrack
        if (previous != null && previous.id != track.id) reportProgress(previous, completed = false)
        play(track)
    }

    private fun play(track: MusicTrack) {
        _state.update {
            it.copy(
                currentTrack = track,
                isPlaying = false,
                isBuffering = true,
                positionMs = 0L,
                durationMs = (track.durationSec?.times(1000L)) ?: 0L,
                error = null,
            )
        }

        viewModelScope.launch {
            val controller = controllerDeferred.await()
            controller.setMediaItem(buildMediaItem(track))
            controller.prepare()
            controller.play()
        }
    }

    private fun buildMediaItem(track: MusicTrack): MediaItem {
        return MediaItem.Builder()
            .setUri(track.audioUrl)
            .setMediaId(track.id)
            .setMediaMetadata(
                MediaMetadata.Builder()
                    .setTitle(track.title)
                    .setArtist(track.artist.displayName)
                    .setArtworkUri(track.coverUrl?.let(Uri::parse))
                    .build(),
            )
            .build()
    }

    private fun advanceToNext() {
        val next = _state.value.queue.firstOrNull()
        if (next != null) {
            _state.update { it.copy(queue = it.queue.drop(1)) }
            play(next)
        } else {
            _state.update { it.copy(isPlaying = false) }
        }
    }

    // secondsPlayed reads the last polled positionMs (observePlaybackPosition
    // updates it every 500ms) rather than querying the controller fresh -
    // at most half a second of imprecision in a "seconds played" analytics
    // figure, not worth a second suspend hop off this otherwise-synchronous
    // call site (switchTo/advanceToNext both call this before starting the
    // next track).
    private fun reportProgress(track: MusicTrack, completed: Boolean) {
        val secondsPlayed = if (completed) {
            track.durationSec ?: (_state.value.durationMs / 1000L).toInt()
        } else {
            (_state.value.positionMs / 1000L).toInt()
        }
        viewModelScope.launch {
            repository.recordPlay(track.id, secondsPlayed, completed)
        }
    }

    override fun onCleared() {
        super.onCleared()
        MediaController.releaseFuture(controllerFuture)
    }
}

private suspend fun <T> ListenableFuture<T>.await(): T = suspendCancellableCoroutine { cont ->
    addListener(
        {
            try {
                cont.resume(get())
            } catch (e: Exception) {
                cont.resumeWithException(e)
            }
        },
        MoreExecutors.directExecutor(),
    )
    cont.invokeOnCancellation { cancel(false) }
}

class MusicPlayerViewModelFactory(
    private val repository: MusicRepository,
    private val context: Context,
) : ViewModelProvider.Factory {
    @Suppress("UNCHECKED_CAST")
    override fun <T : ViewModel> create(modelClass: Class<T>): T {
        return MusicPlayerViewModel(repository, context.applicationContext) as T
    }
}
