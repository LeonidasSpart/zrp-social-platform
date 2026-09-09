package one.zrp.social.mobile.service

import androidx.media3.common.AudioAttributes
import androidx.media3.common.C
import androidx.media3.common.util.UnstableApi
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.session.MediaSession
import androidx.media3.session.MediaSessionService

/**
 * Backs real background playback for ZRP Music - a lock-screen/
 * notification-controllable, foreground-service-backed player, matching
 * what a modern music app (and the website's own MusicPlayerProvider,
 * which keeps playing across page navigation) already implies but the
 * previous native implementation (a bare android.media.MediaPlayer
 * owned directly by MusicPlayerViewModel) never actually provided:
 * playback stopped the moment Android reclaimed the app's process in
 * the background, with no notification, no lock-screen controls, and
 * no way to tell playback was even happening.
 *
 * MediaSessionService is Media3's own answer to this exact problem:
 * extending it (rather than a plain Service) gets a real ExoPlayer
 * running inside a proper foreground service, a system media
 * notification with play/pause/skip actions and artwork built and kept
 * in sync automatically (DefaultMediaNotificationProvider, wired in by
 * the framework the moment a MediaSession exists here), and lock-screen/
 * Bluetooth/Wear controls for free - none of that is hand-built in this
 * file.
 *
 * MusicPlayerViewModel (hoisted once above ZrpNavHost, same lifetime as
 * before) no longer owns a player directly - it binds a MediaController
 * to whichever ExoPlayer instance lives here, so every existing queue/
 * shuffle/play-next call site is unaffected; only the playback engine
 * underneath changed.
 */
class MusicPlaybackService : MediaSessionService() {
    private var mediaSession: MediaSession? = null

    @OptIn(UnstableApi::class)
    override fun onCreate() {
        super.onCreate()
        val player = ExoPlayer.Builder(this)
            .setAudioAttributes(
                AudioAttributes.Builder()
                    .setContentType(C.AUDIO_CONTENT_TYPE_MUSIC)
                    .setUsage(C.USAGE_MEDIA)
                    .build(),
                // Real audio-focus handling - pauses ZRP Music when
                // another app (a call, another player) needs the audio
                // stream, matching what any real music app does; the
                // previous raw-MediaPlayer implementation never
                // requested audio focus at all.
                true,
            )
            .build()
        mediaSession = MediaSession.Builder(this, player).build()
    }

    override fun onGetSession(controllerInfo: MediaSession.ControllerInfo): MediaSession? = mediaSession

    override fun onDestroy() {
        mediaSession?.run {
            player.release()
            release()
            mediaSession = null
        }
        super.onDestroy()
    }
}
