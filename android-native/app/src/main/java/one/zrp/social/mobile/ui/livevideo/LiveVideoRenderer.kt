package one.zrp.social.mobile.ui.livevideo

import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.viewinterop.AndroidView
import io.livekit.android.renderer.TextureViewRenderer
import io.livekit.android.room.Room
import io.livekit.android.room.track.VideoTrack
import livekit.org.webrtc.RendererCommon

/**
 * Renders one LiveKit [VideoTrack] - the Compose <-> View interop for
 * LiveKit's own TextureViewRenderer, following the pattern of the SDK's
 * compose sample (sample-app-compose/.../VideoRenderer.kt at the pinned
 * livekit-android version): the renderer is initialised against the
 * Room's shared EGL context once, the track is (re)attached whenever it
 * changes, detached when it goes away, and the renderer released when
 * this leaves composition - so a tile scrolled away or a participant who
 * leaves never leaks a GL surface.
 *
 * TextureViewRenderer (not SurfaceViewRenderer) because tiles overlap
 * the stage and are overlaid by chat/controls - a SurfaceView punches a
 * hole in the window and can't be layered/clipped reliably.
 */
@Composable
fun LiveVideoRenderer(
    room: Room,
    videoTrack: VideoTrack?,
    modifier: Modifier = Modifier,
    mirror: Boolean = false,
    fill: Boolean = true,
) {
    var boundTrack by remember { mutableStateOf<VideoTrack?>(null) }
    var view by remember { mutableStateOf<TextureViewRenderer?>(null) }

    fun unbind() {
        val v = view
        val t = boundTrack
        if (v != null && t != null) runCatching { t.removeRenderer(v) }
        boundTrack = null
    }

    fun bindIfNeeded(track: VideoTrack?, target: TextureViewRenderer) {
        if (boundTrack === track) return
        unbind()
        boundTrack = track
        if (track != null) runCatching { track.addRenderer(target) }
    }

    DisposableEffect(view, mirror) {
        view?.setMirror(mirror)
        onDispose { }
    }

    DisposableEffect(room, videoTrack) {
        onDispose { unbind() }
    }

    DisposableEffect(Unit) {
        onDispose {
            unbind()
            view?.let { runCatching { it.release() } }
            view = null
        }
    }

    AndroidView(
        factory = { context ->
            TextureViewRenderer(context).apply {
                room.initVideoRenderer(this)
                setScalingType(
                    if (fill) RendererCommon.ScalingType.SCALE_ASPECT_FILL else RendererCommon.ScalingType.SCALE_ASPECT_FIT,
                )
                view = this
                bindIfNeeded(videoTrack, this)
            }
        },
        update = { v -> bindIfNeeded(videoTrack, v) },
        modifier = modifier,
    )
}
