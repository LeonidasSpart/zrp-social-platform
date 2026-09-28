package one.zrp.social.mobile.ui.liveaudio

import android.Manifest
import androidx.activity.compose.BackHandler
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Mic
import androidx.compose.material.icons.filled.MicOff
import androidx.compose.material.icons.filled.PanTool
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import one.zrp.social.mobile.R
import one.zrp.social.mobile.network.LiveAudioParticipant
import one.zrp.social.mobile.ui.components.Avatar
import one.zrp.social.mobile.ui.theme.Spacing
import one.zrp.social.mobile.ui.theme.ZrpRed
import one.zrp.social.mobile.util.localizedError

/**
 * ZRP Live Audio's room screen - ported from src/app/live-audio/[id]/
 * page.tsx. See LiveAudioRoomViewModel's own KDoc for why participant
 * state comes entirely from Socket.IO events (not the LiveKit Room
 * itself), and why leave() rather than onCleared() makes the real
 * POST /leave call.
 */
@Composable
fun LiveAudioRoomScreen(roomId: String, onBack: () -> Unit) {
    val viewModel: LiveAudioRoomViewModel = viewModel(
        factory = remember(roomId) { LiveAudioRoomViewModelFactory(roomId) },
    )
    val state by viewModel.state.collectAsState()
    val context = LocalContext.current

    val micPermissionLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.RequestPermission(),
    ) { granted -> if (granted) viewModel.toggleMic() }

    LaunchedEffect(Unit) { viewModel.connect(context) }

    fun leaveAndBack() {
        viewModel.leave()
        onBack()
    }

    BackHandler { leaveAndBack() }

    when (state.phase) {
        LiveAudioPhase.LOADING, LiveAudioPhase.CONNECTING -> {
            Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    CircularProgressIndicator()
                    Text(text = stringResource(R.string.live_audio_connecting), modifier = Modifier.padding(top = Spacing.md))
                }
            }
        }
        LiveAudioPhase.ERROR -> {
            Column(
                modifier = Modifier.fillMaxSize().padding(Spacing.xl),
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.Center,
            ) {
                Text(
                    text = localizedError(state.error) ?: stringResource(R.string.live_audio_join_error),
                    textAlign = TextAlign.Center,
                )
                Button(onClick = ::leaveAndBack, modifier = Modifier.padding(top = Spacing.lg)) {
                    Text(stringResource(R.string.live_audio_back))
                }
            }
        }
        LiveAudioPhase.ENDED, LiveAudioPhase.REMOVED -> {
            Column(
                modifier = Modifier.fillMaxSize().padding(Spacing.xl),
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.Center,
            ) {
                Text(
                    text = stringResource(
                        if (state.phase == LiveAudioPhase.ENDED) R.string.live_audio_room_ended_title else R.string.live_audio_removed_title,
                    ),
                    fontWeight = FontWeight.Bold,
                    textAlign = TextAlign.Center,
                )
                Button(onClick = onBack, modifier = Modifier.padding(top = Spacing.lg)) {
                    Text(stringResource(R.string.live_audio_back))
                }
            }
        }
        LiveAudioPhase.CONNECTED -> {
            LiveAudioConnectedContent(
                state = state,
                viewModel = viewModel,
                onLeave = ::leaveAndBack,
                onToggleMic = {
                    if (!state.isMicOn) {
                        micPermissionLauncher.launch(Manifest.permission.RECORD_AUDIO)
                    } else {
                        viewModel.toggleMic()
                    }
                },
            )
        }
    }
}

@Composable
private fun LiveAudioConnectedContent(
    state: LiveAudioRoomUiState,
    viewModel: LiveAudioRoomViewModel,
    onLeave: () -> Unit,
    onToggleMic: () -> Unit,
) {
    val room = state.room
    val amAuthority = isLiveAudioAuthority(state.myRole)
    val (speakers, listeners) = state.participants.partition { canPublishLiveAudio(it.role) }
    var confirmEnd by remember { mutableStateOf(false) }
    var confirmRemoveUserId by remember { mutableStateOf<String?>(null) }

    Column(modifier = Modifier.fillMaxSize()) {
        Row(
            modifier = Modifier.fillMaxWidth().padding(horizontal = Spacing.md, vertical = Spacing.sm),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            IconButton(onClick = onLeave) {
                Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = stringResource(R.string.shorts_back))
            }
            Text(
                text = room?.title ?: "",
                fontWeight = FontWeight.Bold,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                style = MaterialTheme.typography.titleMedium,
                modifier = Modifier.weight(1f).padding(start = Spacing.sm),
            )
            if (state.myRole == "HOST") {
                TextButton(onClick = { confirmEnd = true }) {
                    Text(stringResource(R.string.live_audio_end_room), color = ZrpRed)
                }
            } else {
                TextButton(onClick = onLeave) {
                    Text(stringResource(R.string.live_audio_leave_room))
                }
            }
        }

        if (state.actionError != null) {
            Row(
                modifier = Modifier.fillMaxWidth().padding(horizontal = Spacing.lg, vertical = Spacing.xs),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(
                    text = localizedError(state.actionError) ?: "",
                    color = MaterialTheme.colorScheme.error,
                    style = MaterialTheme.typography.bodySmall,
                    modifier = Modifier.weight(1f),
                )
                IconButton(onClick = viewModel::dismissActionError) {
                    Icon(Icons.Filled.Close, contentDescription = stringResource(R.string.action_cancel), modifier = Modifier.size(18.dp))
                }
            }
        }

        if (amAuthority && state.pendingSpeakerRequestUserIds.isNotEmpty()) {
            PendingSpeakerRequestsPanel(
                userIds = state.pendingSpeakerRequestUserIds,
                participantsById = state.participants.associateBy { it.user.id },
                busyUserId = state.actionBusyUserId,
                onApprove = { viewModel.resolveSpeakRequest(it, approve = true) },
                onReject = { viewModel.resolveSpeakRequest(it, approve = false) },
            )
        }

        LazyColumn(modifier = Modifier.weight(1f), contentPadding = PaddingValues(Spacing.lg)) {
            item {
                Text(
                    text = stringResource(R.string.live_audio_speakers_heading),
                    fontWeight = FontWeight.Bold,
                    style = MaterialTheme.typography.titleSmall,
                    modifier = Modifier.padding(bottom = Spacing.sm),
                )
            }
            item {
                ParticipantGrid(
                    participants = speakers,
                    myUserId = state.myUserId,
                    speakingUserIds = state.speakingUserIds,
                    amAuthority = amAuthority,
                    onPromote = { viewModel.promote(it) },
                    onDemote = { viewModel.demote(it) },
                    onMute = { viewModel.mute(it) },
                    onUnmute = { viewModel.unmute(it) },
                    onRequestRemove = { confirmRemoveUserId = it },
                )
            }
            if (listeners.isNotEmpty()) {
                item {
                    Text(
                        text = stringResource(R.string.live_audio_listeners_heading),
                        fontWeight = FontWeight.Bold,
                        style = MaterialTheme.typography.titleSmall,
                        modifier = Modifier.padding(top = Spacing.lg, bottom = Spacing.sm),
                    )
                }
                item {
                    ParticipantGrid(
                        participants = listeners,
                        myUserId = state.myUserId,
                        speakingUserIds = state.speakingUserIds,
                        amAuthority = amAuthority,
                        onPromote = { viewModel.promote(it) },
                        onDemote = { viewModel.demote(it) },
                        onMute = { viewModel.mute(it) },
                        onUnmute = { viewModel.unmute(it) },
                        onRequestRemove = { confirmRemoveUserId = it },
                    )
                }
            }
        }

        LiveAudioControlBar(
            canPublish = canPublishLiveAudio(state.myRole),
            isMicOn = state.isMicOn,
            isMicBusy = state.isMicBusy,
            speakRequestSent = state.speakRequestSent,
            onToggleMic = onToggleMic,
            onRequestToSpeak = viewModel::requestToSpeak,
        )
    }

    if (confirmEnd) {
        AlertDialog(
            onDismissRequest = { confirmEnd = false },
            title = { Text(stringResource(R.string.live_audio_end_room_confirm_title)) },
            confirmButton = {
                TextButton(onClick = { confirmEnd = false; viewModel.endRoom() }) {
                    Text(stringResource(R.string.live_audio_end_room), color = ZrpRed)
                }
            },
            dismissButton = { TextButton(onClick = { confirmEnd = false }) { Text(stringResource(R.string.action_cancel)) } },
        )
    }

    val removeId = confirmRemoveUserId
    if (removeId != null) {
        AlertDialog(
            onDismissRequest = { confirmRemoveUserId = null },
            title = { Text(stringResource(R.string.live_audio_remove_confirm_title)) },
            confirmButton = {
                TextButton(onClick = { confirmRemoveUserId = null; viewModel.remove(removeId) }) {
                    Text(stringResource(R.string.live_audio_remove_action), color = ZrpRed)
                }
            },
            dismissButton = { TextButton(onClick = { confirmRemoveUserId = null }) { Text(stringResource(R.string.action_cancel)) } },
        )
    }
}

@Composable
private fun PendingSpeakerRequestsPanel(
    userIds: List<String>,
    participantsById: Map<String, LiveAudioParticipant>,
    busyUserId: String?,
    onApprove: (String) -> Unit,
    onReject: (String) -> Unit,
) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .background(MaterialTheme.colorScheme.surfaceVariant)
            .padding(Spacing.md),
    ) {
        Text(
            text = stringResource(R.string.live_audio_pending_requests, userIds.size),
            fontWeight = FontWeight.Bold,
            style = MaterialTheme.typography.labelLarge,
        )
        userIds.forEach { userId ->
            val participant = participantsById[userId]
            val name = participant?.user?.name ?: participant?.user?.username ?: userId
            Row(
                modifier = Modifier.fillMaxWidth().padding(top = Spacing.sm),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Avatar(url = participant?.user?.avatarUrl, name = name, size = 32.dp)
                Text(text = name, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f).padding(start = Spacing.sm))
                if (busyUserId == userId) {
                    CircularProgressIndicator(modifier = Modifier.size(20.dp))
                } else {
                    IconButton(onClick = { onApprove(userId) }) {
                        Icon(Icons.Filled.Check, contentDescription = stringResource(R.string.live_audio_approve))
                    }
                    IconButton(onClick = { onReject(userId) }) {
                        Icon(Icons.Filled.Close, contentDescription = stringResource(R.string.live_audio_decline))
                    }
                }
            }
        }
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun ParticipantGrid(
    participants: List<LiveAudioParticipant>,
    myUserId: String?,
    speakingUserIds: Set<String>,
    amAuthority: Boolean,
    onPromote: (String) -> Unit,
    onDemote: (String) -> Unit,
    onMute: (String) -> Unit,
    onUnmute: (String) -> Unit,
    onRequestRemove: (String) -> Unit,
) {
    FlowRow(horizontalArrangement = Arrangement.spacedBy(Spacing.md), verticalArrangement = Arrangement.spacedBy(Spacing.md)) {
        participants.forEach { participant ->
            ParticipantTile(
                participant = participant,
                isMe = participant.user.id == myUserId,
                isSpeaking = speakingUserIds.contains(participant.user.id) && !participant.isMuted,
                amAuthority = amAuthority,
                onPromote = { onPromote(participant.user.id) },
                onDemote = { onDemote(participant.user.id) },
                onMute = { onMute(participant.user.id) },
                onUnmute = { onUnmute(participant.user.id) },
                onRequestRemove = { onRequestRemove(participant.user.id) },
            )
        }
    }
}

@Composable
private fun ParticipantTile(
    participant: LiveAudioParticipant,
    isMe: Boolean,
    isSpeaking: Boolean,
    amAuthority: Boolean,
    onPromote: () -> Unit,
    onDemote: () -> Unit,
    onMute: () -> Unit,
    onUnmute: () -> Unit,
    onRequestRemove: () -> Unit,
) {
    var menuOpen by remember { mutableStateOf(false) }
    val name = participant.user.name ?: participant.user.username
    // Only a real HOST/MODERATOR can moderate someone else - never
    // themselves (an authority always uses the dedicated end/mute-self
    // controls, not this per-tile menu), matching page.tsx's own
    // moderate() call sites (there's no self-targeting affordance there
    // either).
    val canModerateThisTile = amAuthority && !isMe

    Column(
        modifier = Modifier.width(72.dp).let { if (canModerateThisTile) it.clickable { menuOpen = true } else it },
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Box {
            Avatar(
                url = participant.user.avatarUrl,
                name = name,
                size = 56.dp,
                ringColor = if (isSpeaking) ZrpRed else null,
            )
            if (participant.isMuted) {
                Box(
                    modifier = Modifier
                        .align(Alignment.BottomEnd)
                        .size(20.dp)
                        .background(MaterialTheme.colorScheme.surface, CircleShape),
                    contentAlignment = Alignment.Center,
                ) {
                    Icon(Icons.Filled.MicOff, contentDescription = stringResource(R.string.live_audio_muted_label), modifier = Modifier.size(14.dp))
                }
            }
        }
        Text(
            text = name,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
            style = MaterialTheme.typography.labelSmall,
            modifier = Modifier.padding(top = Spacing.xs),
        )
        if (participant.role == "HOST") {
            Text(text = stringResource(R.string.live_audio_host_badge), style = MaterialTheme.typography.labelSmall, color = ZrpRed)
        } else if (participant.role == "MODERATOR") {
            Text(text = stringResource(R.string.live_audio_moderator_badge), style = MaterialTheme.typography.labelSmall, color = ZrpRed)
        }

        DropdownMenu(expanded = menuOpen, onDismissRequest = { menuOpen = false }) {
            if (participant.role == "LISTENER") {
                DropdownMenuItem(text = { Text(stringResource(R.string.live_audio_invite_to_speak)) }, onClick = { menuOpen = false; onPromote() })
            } else if (participant.role == "SPEAKER") {
                DropdownMenuItem(text = { Text(stringResource(R.string.live_audio_move_to_listener)) }, onClick = { menuOpen = false; onDemote() })
            }
            DropdownMenuItem(
                text = { Text(stringResource(if (participant.isMuted) R.string.live_audio_unmute_action else R.string.live_audio_mute_action)) },
                onClick = { menuOpen = false; if (participant.isMuted) onUnmute() else onMute() },
            )
            DropdownMenuItem(
                text = { Text(stringResource(R.string.live_audio_remove_action), color = ZrpRed) },
                onClick = { menuOpen = false; onRequestRemove() },
            )
        }
    }
}

@Composable
private fun LiveAudioControlBar(
    canPublish: Boolean,
    isMicOn: Boolean,
    isMicBusy: Boolean,
    speakRequestSent: Boolean,
    onToggleMic: () -> Unit,
    onRequestToSpeak: () -> Unit,
) {
    Row(
        modifier = Modifier.fillMaxWidth().padding(Spacing.lg),
        horizontalArrangement = Arrangement.Center,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        if (canPublish) {
            IconButton(
                onClick = onToggleMic,
                enabled = !isMicBusy,
                modifier = Modifier
                    .size(56.dp)
                    .clip(CircleShape)
                    .background(if (isMicOn) MaterialTheme.colorScheme.surfaceVariant else ZrpRed),
            ) {
                if (isMicBusy) {
                    CircularProgressIndicator(modifier = Modifier.size(20.dp))
                } else {
                    Icon(
                        if (isMicOn) Icons.Filled.Mic else Icons.Filled.MicOff,
                        contentDescription = stringResource(if (isMicOn) R.string.live_audio_mute_self else R.string.live_audio_unmute_self),
                        tint = if (isMicOn) MaterialTheme.colorScheme.onSurfaceVariant else Color.White,
                    )
                }
            }
        } else {
            OutlinedButton(onClick = onRequestToSpeak, enabled = !speakRequestSent) {
                Icon(Icons.Filled.PanTool, contentDescription = null, modifier = Modifier.size(18.dp))
                Text(
                    text = stringResource(if (speakRequestSent) R.string.live_audio_request_sent else R.string.live_audio_raise_hand),
                    modifier = Modifier.padding(start = Spacing.xs),
                )
            }
        }
    }
}
