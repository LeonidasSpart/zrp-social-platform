package one.zrp.social.mobile.ui.call

import android.Manifest
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Call
import androidx.compose.material.icons.filled.CallEnd
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Mic
import androidx.compose.material.icons.filled.MicOff
import androidx.compose.material.icons.filled.Videocam
import androidx.compose.material.icons.filled.VideocamOff
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import kotlinx.coroutines.delay
import one.zrp.social.mobile.R
import org.webrtc.EglBase
import org.webrtc.RendererCommon
import org.webrtc.SurfaceViewRenderer
import org.webrtc.VideoTrack

/**
 * The native equivalent of CallComponent.tsx - a full-screen overlay
 * driven entirely by CallViewModel's real WebRTC state (see its own
 * KDoc for the signaling protocol), not a mock call UI. Rendered in
 * place of the normal conversation content whenever CallUiState.phase
 * isn't IDLE, the same way page.tsx swaps ChatInterface for
 * CallComponent rather than stacking them.
 */
@Composable
fun CallScreen(
    viewModel: CallViewModel,
    onDismiss: () -> Unit,
) {
    val state by viewModel.state.collectAsState()
    val localTrack by viewModel.localVideoTrackFlow.collectAsState()
    val remoteTrack by viewModel.remoteVideoTrackFlow.collectAsState()
    val context = LocalContext.current

    // Matches getUserMedia's own browser permission prompt, asked right
    // when the callee actually accepts rather than as soon as the
    // incoming-call UI appears.
    val acceptPermissionLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.RequestMultiplePermissions(),
    ) { granted ->
        if (granted[Manifest.permission.RECORD_AUDIO] == true) {
            viewModel.acceptCall(context)
        } else {
            viewModel.rejectCall()
        }
    }

    LaunchedEffect(state.phase) {
        if (state.phase == CallPhase.IDLE) onDismiss()
    }

    var durationSeconds by remember { mutableIntStateOf(0) }
    LaunchedEffect(state.phase, state.hasRemoteStream) {
        durationSeconds = 0
        if (state.phase == CallPhase.ACTIVE && state.hasRemoteStream) {
            while (true) {
                delay(1000)
                durationSeconds++
            }
        }
    }

    val eglContext = viewModel.eglBaseContext()

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(Color.Black),
    ) {
        if (state.isVideo && remoteTrack != null && eglContext != null) {
            VideoSurface(track = remoteTrack, eglBaseContext = eglContext, mirror = false, modifier = Modifier.fillMaxSize())
        } else {
            Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                when {
                    state.phase == CallPhase.INCOMING -> {
                        Box(
                            modifier = Modifier
                                .size(96.dp)
                                .clip(CircleShape)
                                .background(MaterialTheme.colorScheme.error.copy(alpha = 0.3f)),
                            contentAlignment = Alignment.Center,
                        ) {
                            Icon(Icons.Filled.Call, contentDescription = null, tint = Color.White, modifier = Modifier.size(40.dp))
                        }
                    }
                    state.phase == CallPhase.CALLING && !state.hasRemoteStream -> {
                        CircularProgressIndicator(color = MaterialTheme.colorScheme.error)
                    }
                    else -> {
                        Text(text = "No video", color = Color.Gray)
                    }
                }
            }
        }

        if (state.isVideo && state.isVideoEnabled && localTrack != null && eglContext != null) {
            Box(
                modifier = Modifier
                    .align(Alignment.BottomEnd)
                    .padding(16.dp)
                    .width(120.dp)
                    .height(160.dp)
                    .clip(MaterialTheme.shapes.medium)
                    .background(Color.DarkGray),
            ) {
                VideoSurface(track = localTrack, eglBaseContext = eglContext, mirror = true, modifier = Modifier.fillMaxSize())
            }
        }

        Column(
            modifier = Modifier
                .align(Alignment.TopCenter)
                .padding(top = 48.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Text(text = state.callerName.ifBlank { "Call" }, color = Color.White, style = MaterialTheme.typography.titleLarge)
            val statusText = when {
                state.phase == CallPhase.INCOMING -> if (state.isVideo) "Incoming video call..." else "Incoming voice call..."
                state.phase == CallPhase.CALLING && !state.hasRemoteStream -> "Ringing..."
                state.hasRemoteStream -> formatDuration(durationSeconds)
                else -> ""
            }
            if (statusText.isNotEmpty()) {
                Text(text = statusText, color = Color.LightGray, style = MaterialTheme.typography.bodyMedium)
            }
            state.error?.let {
                Text(
                    text = callErrorMessage(it),
                    color = MaterialTheme.colorScheme.error,
                    style = MaterialTheme.typography.bodySmall,
                )
            }
        }

        Row(
            modifier = Modifier
                .align(Alignment.BottomCenter)
                .padding(bottom = 48.dp),
            horizontalArrangement = Arrangement.spacedBy(20.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            if (state.phase == CallPhase.ACTIVE && state.hasRemoteStream) {
                CallControlButton(
                    icon = if (state.isMuted) Icons.Filled.MicOff else Icons.Filled.Mic,
                    background = if (state.isMuted) MaterialTheme.colorScheme.error else Color(0xFF3A3A3C),
                    onClick = { viewModel.toggleMute() },
                )
                if (state.isVideo) {
                    CallControlButton(
                        icon = if (state.isVideoEnabled) Icons.Filled.Videocam else Icons.Filled.VideocamOff,
                        background = if (!state.isVideoEnabled) MaterialTheme.colorScheme.error else Color(0xFF3A3A3C),
                        onClick = { viewModel.toggleVideo() },
                    )
                }
            }

            CallControlButton(
                icon = if (state.phase == CallPhase.INCOMING) Icons.Filled.Call else Icons.Filled.CallEnd,
                background = if (state.phase == CallPhase.INCOMING) Color(0xFF22C55E) else MaterialTheme.colorScheme.error,
                large = true,
                onClick = {
                    if (state.phase == CallPhase.INCOMING) {
                        val permissions = if (state.isVideo) {
                            arrayOf(Manifest.permission.RECORD_AUDIO, Manifest.permission.CAMERA)
                        } else {
                            arrayOf(Manifest.permission.RECORD_AUDIO)
                        }
                        acceptPermissionLauncher.launch(permissions)
                    } else {
                        viewModel.endCall()
                    }
                },
            )

            if (state.phase == CallPhase.INCOMING) {
                CallControlButton(
                    icon = Icons.Filled.Close,
                    background = MaterialTheme.colorScheme.error,
                    onClick = { viewModel.rejectCall() },
                )
            }
        }
    }
}

@Composable
private fun CallControlButton(
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    background: Color,
    large: Boolean = false,
    onClick: () -> Unit,
) {
    IconButton(
        onClick = onClick,
        modifier = Modifier
            .size(if (large) 72.dp else 56.dp)
            .clip(CircleShape)
            .background(background),
    ) {
        Icon(icon, contentDescription = null, tint = Color.White, modifier = Modifier.size(if (large) 32.dp else 24.dp))
    }
}

@Composable
private fun VideoSurface(
    track: VideoTrack?,
    eglBaseContext: EglBase.Context,
    mirror: Boolean,
    modifier: Modifier = Modifier,
) {
    var renderer by remember { mutableStateOf<SurfaceViewRenderer?>(null) }

    AndroidView(
        modifier = modifier,
        factory = { context ->
            SurfaceViewRenderer(context).apply {
                init(eglBaseContext, null)
                setScalingType(RendererCommon.ScalingType.SCALE_ASPECT_FILL)
                setMirror(mirror)
                renderer = this
            }
        },
        update = { view -> view.setMirror(mirror) },
    )

    // The sink attaches to whichever renderer/track pair is current and
    // detaches on either changing - a stale VideoSink left attached to a
    // track that already switched (or a disposed renderer) is exactly
    // the kind of leak/crash a real device would surface immediately,
    // even though it's invisible to static review alone.
    DisposableEffect(track, renderer) {
        val view = renderer
        if (view != null && track != null) {
            track.addSink(view)
        }
        onDispose {
            if (view != null && track != null) {
                track.removeSink(view)
            }
        }
    }

    DisposableEffect(Unit) {
        onDispose {
            renderer?.release()
        }
    }
}

private fun formatDuration(seconds: Int): String {
    val minutes = seconds / 60
    val secs = seconds % 60
    return "%d:%02d".format(minutes, secs)
}

/**
 * Maps CallViewModel's CallError (which cannot resolve Android string
 * resources itself) to a real translated string, mirroring the
 * storyMediaErrorMessage() pattern in CreateStoryScreen.kt. The detail
 * suffix on ConnectionError/MicCameraError matches page.tsx's own
 * t("chat.connectionError") + " " + err.message concatenation.
 */
@Composable
private fun callErrorMessage(error: CallError): String = when (error) {
    is CallError.Rejected -> stringResource(R.string.chat_call_rejected)
    is CallError.ConnectionError -> stringResource(R.string.chat_connection_error) + " " + error.detail
    is CallError.MicCameraError -> stringResource(R.string.chat_mic_camera_error) + " " + error.detail
    is CallError.MissingCallerId -> stringResource(R.string.chat_missing_caller_id)
}
