package one.zrp.social.mobile.ui.music

import android.media.AudioAttributes
import android.media.MediaPlayer
import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import one.zrp.social.mobile.data.MusicRepository
import one.zrp.social.mobile.network.MusicTrack

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
 * their own MediaPlayer, matching how the website's own pages all share
 * one player/queue instance.
 */
class MusicPlayerViewModel(private val repository: MusicRepository) : ViewModel() {
    private val _state = MutableStateFlow(MusicPlayerUiState())
    val state: StateFlow<MusicPlayerUiState> = _state.asStateFlow()

    private var mediaPlayer: MediaPlayer? = null

    init {
        observePlaybackPosition()
    }

    private fun observePlaybackPosition() {
        viewModelScope.launch {
            while (true) {
                delay(500)
                val player = mediaPlayer
                if (player != null && _state.value.isPlaying) {
                    _state.update {
                        it.copy(
                            positionMs = player.currentPosition.toLong(),
                            durationMs = player.duration.toLong().coerceAtLeast(0),
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
        val player = mediaPlayer ?: return
        if (player.isPlaying) {
            player.pause()
            _state.update { it.copy(isPlaying = false) }
        } else {
            player.start()
            _state.update { it.copy(isPlaying = true) }
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
        mediaPlayer?.release()
        mediaPlayer = null

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

        try {
            val player = MediaPlayer()
            mediaPlayer = player
            player.setAudioAttributes(
                AudioAttributes.Builder()
                    .setContentType(AudioAttributes.CONTENT_TYPE_MUSIC)
                    .setUsage(AudioAttributes.USAGE_MEDIA)
                    .build(),
            )
            player.setDataSource(track.audioUrl)
            player.setOnPreparedListener {
                it.start()
                _state.update { s -> s.copy(isPlaying = true, isBuffering = false) }
            }
            player.setOnCompletionListener {
                reportProgress(track, completed = true)
                advanceToNext()
            }
            player.setOnErrorListener { _, _, _ ->
                _state.update { s -> s.copy(isPlaying = false, isBuffering = false, error = "Couldn't play this track.") }
                true
            }
            player.prepareAsync()
        } catch (e: Exception) {
            _state.update { it.copy(isBuffering = false, error = "Couldn't play this track.") }
        }
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

    private fun reportProgress(track: MusicTrack, completed: Boolean) {
        val player = mediaPlayer
        val secondsPlayed = if (completed) {
            track.durationSec ?: ((player?.duration ?: 0) / 1000)
        } else {
            (player?.currentPosition ?: 0) / 1000
        }
        viewModelScope.launch {
            repository.recordPlay(track.id, secondsPlayed, completed)
        }
    }

    override fun onCleared() {
        super.onCleared()
        mediaPlayer?.release()
        mediaPlayer = null
    }
}

class MusicPlayerViewModelFactory(private val repository: MusicRepository) : ViewModelProvider.Factory {
    @Suppress("UNCHECKED_CAST")
    override fun <T : ViewModel> create(modelClass: Class<T>): T {
        return MusicPlayerViewModel(repository) as T
    }
}
