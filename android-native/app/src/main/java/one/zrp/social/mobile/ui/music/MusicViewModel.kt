package one.zrp.social.mobile.ui.music

import android.media.AudioAttributes
import android.media.MediaPlayer
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import one.zrp.social.mobile.data.MusicRepository
import one.zrp.social.mobile.network.MusicTrack

data class MusicUiState(
    val isLoading: Boolean = true,
    val trending: List<MusicTrack> = emptyList(),
    val newReleases: List<MusicTrack> = emptyList(),
    val recentlyPlayed: List<MusicTrack> = emptyList(),
    val likedPreview: List<MusicTrack> = emptyList(),
    val currentTrack: MusicTrack? = null,
    val isPlaying: Boolean = false,
    val isBuffering: Boolean = false,
    val positionMs: Long = 0L,
    val durationMs: Long = 0L,
    val error: String? = null,
)

/**
 * Backs the native Music screen - real tracks from the same
 * GET /music/home the website's Music home page uses, played through
 * the Android framework's own MediaPlayer (no ExoPlayer dependency
 * needed just to stream a real HTTPS audio URL) and reported back
 * through the same POST /music/tracks/play the website's player uses,
 * so play counts and listening history stay real. Playback is scoped
 * to this ViewModel's lifetime - it stops when the Music screen is
 * left, rather than attempting a persistent cross-app mini-player
 * (that needs a foreground Service + MediaSession, a bigger and
 * separately-testable piece of work).
 */
class MusicViewModel(private val repository: MusicRepository) : ViewModel() {
    private val _state = MutableStateFlow(MusicUiState())
    val state: StateFlow<MusicUiState> = _state.asStateFlow()

    private var mediaPlayer: MediaPlayer? = null

    init {
        load()
        observePlaybackPosition()
    }

    // A slim, real (not animated-for-show) progress indicator in the
    // mini-player needs an actual position - MediaPlayer only exposes
    // that via polling, there's no position callback to listen to.
    // Runs for the ViewModel's lifetime; cancelled automatically with
    // viewModelScope when the Music screen is left.
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

    private fun load() {
        viewModelScope.launch {
            _state.update { it.copy(isLoading = true, error = null) }
            repository.getHome()
                .onSuccess { home ->
                    _state.update {
                        it.copy(
                            trending = home.trending,
                            newReleases = home.newReleases,
                            recentlyPlayed = home.recentlyPlayed,
                            likedPreview = home.likedPreview,
                            isLoading = false,
                        )
                    }
                }
                .onFailure { error ->
                    _state.update { it.copy(isLoading = false, error = error.message ?: "Couldn't load ZRP Music.") }
                }
        }
    }

    fun onTrackClick(track: MusicTrack) {
        val current = _state.value.currentTrack
        if (current?.id == track.id) {
            togglePlayPause()
            return
        }

        current?.let { previous -> reportProgress(previous, completed = false) }
        startPlayback(track)
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

    fun toggleLike(track: MusicTrack) {
        val wasLiked = track.liked

        fun updated(t: MusicTrack) = if (t.id == track.id) t.copy(liked = !wasLiked) else t
        _state.update {
            it.copy(
                trending = it.trending.map(::updated),
                newReleases = it.newReleases.map(::updated),
                recentlyPlayed = it.recentlyPlayed.map(::updated),
                likedPreview = it.likedPreview.map(::updated),
                currentTrack = it.currentTrack?.let(::updated),
            )
        }

        viewModelScope.launch {
            repository.toggleLike(track.id).onFailure {
                fun reverted(t: MusicTrack) = if (t.id == track.id) t.copy(liked = wasLiked) else t
                _state.update {
                    it.copy(
                        trending = it.trending.map(::reverted),
                        newReleases = it.newReleases.map(::reverted),
                        recentlyPlayed = it.recentlyPlayed.map(::reverted),
                        likedPreview = it.likedPreview.map(::reverted),
                        currentTrack = it.currentTrack?.let(::reverted),
                    )
                }
            }
        }
    }

    private fun startPlayback(track: MusicTrack) {
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
                _state.update { s -> s.copy(isPlaying = false) }
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
