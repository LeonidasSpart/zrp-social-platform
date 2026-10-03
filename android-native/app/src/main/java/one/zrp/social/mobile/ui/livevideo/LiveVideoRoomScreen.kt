package one.zrp.social.mobile.ui.livevideo

import android.Manifest
import androidx.activity.compose.BackHandler
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.ChatBubbleOutline
import androidx.compose.material.icons.filled.CardGiftcard
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.FlipCameraAndroid
import androidx.compose.material.icons.filled.Favorite
import androidx.compose.material.icons.filled.Groups
import androidx.compose.material.icons.filled.Mic
import androidx.compose.material.icons.filled.MicOff
import androidx.compose.material.icons.filled.MoreVert
import androidx.compose.material.icons.filled.PanTool
import androidx.compose.material.icons.filled.Share
import androidx.compose.material.icons.filled.Videocam
import androidx.compose.material.icons.filled.VideocamOff
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import io.livekit.android.room.Room
import one.zrp.social.mobile.R
import one.zrp.social.mobile.data.LiveRoomKind
import one.zrp.social.mobile.network.LiveVideoParticipant
import one.zrp.social.mobile.ui.components.Avatar
import one.zrp.social.mobile.ui.live.DismissibleErrorRow
import one.zrp.social.mobile.ui.live.LiveChatPanel
import one.zrp.social.mobile.ui.live.LiveEndedContent
import one.zrp.social.mobile.ui.live.LiveGiftAnimationLayer
import one.zrp.social.mobile.ui.live.LiveGiftPanel
import one.zrp.social.mobile.ui.live.LiveReactionLayer
import one.zrp.social.mobile.ui.live.LiveRecordingMenuItems
import one.zrp.social.mobile.ui.live.LiveRecordingPill
import one.zrp.social.mobile.ui.live.LiveScheduledRoomContent
import one.zrp.social.mobile.ui.live.LiveTransientNotice
import one.zrp.social.mobile.ui.live.liveErrorText
import one.zrp.social.mobile.ui.live.shareLiveRoom
import one.zrp.social.mobile.ui.theme.IconSize
import one.zrp.social.mobile.ui.theme.Radius
import one.zrp.social.mobile.ui.theme.Spacing
import one.zrp.social.mobile.ui.theme.TouchTarget
import one.zrp.social.mobile.ui.theme.ZrpRed
import one.zrp.social.mobile.ui.theme.ZrpSurfaceContainer
import one.zrp.social.mobile.util.localizedError

private val ScrimColor = Color.Black.copy(alpha = 0.45f)

/**
 * ZRP Live Video's room - ported from src/app/live-video/[id]/page.tsx
 * to a fullscreen vertical layout: the host's camera fills the stage,
 * other on-camera participants float as small tiles, and chat,
 * reactions and gifts overlay the video without ever resizing it. See
 * LiveVideoRoomViewModel's KDoc for the realtime/media model.
 */
@Composable
fun LiveVideoRoomScreen(roomId: String, onBack: () -> Unit) {
    val viewModel: LiveVideoRoomViewModel = viewModel(
        factory = remember(roomId) { LiveVideoRoomViewModelFactory(roomId) },
    )
    val state by viewModel.state.collectAsState()
    val context = LocalContext.current

    val micPermissionLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.RequestPermission(),
    ) { granted -> if (granted) viewModel.toggleMic() }
    val cameraPermissionLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.RequestPermission(),
    ) { granted -> if (granted) viewModel.toggleCamera() }

    LaunchedEffect(state.phase) {
        if (state.phase == LiveVideoPhase.LOADING) viewModel.connect(context)
    }

    fun leaveAndBack() {
        viewModel.leave()
        onBack()
    }

    BackHandler { leaveAndBack() }

    when (state.phase) {
        LiveVideoPhase.LOADING, LiveVideoPhase.CONNECTING -> {
            Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    CircularProgressIndicator()
                    Text(text = stringResource(R.string.live_audio_connecting), modifier = Modifier.padding(top = Spacing.md))
                }
            }
        }
        LiveVideoPhase.ERROR -> {
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
                    Text(stringResource(R.string.live_video_back))
                }
            }
        }
        LiveVideoPhase.REMOVED -> {
            Column(
                modifier = Modifier.fillMaxSize().padding(Spacing.xl),
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.Center,
            ) {
                Text(text = stringResource(R.string.live_audio_removed_title), fontWeight = FontWeight.Bold, textAlign = TextAlign.Center)
                Button(onClick = onBack, modifier = Modifier.padding(top = Spacing.lg)) {
                    Text(stringResource(R.string.live_video_back))
                }
            }
        }
        LiveVideoPhase.ENDED -> {
            val recording by viewModel.interactions.recording.collectAsState()
            val cancelled = state.room?.status == "CANCELLED"
            val hostId = state.room?.hostId
            LiveEndedContent(
                title = stringResource(if (cancelled) R.string.live_scheduled_cancelled_title else R.string.live_audio_room_ended_title),
                showReplays = !cancelled,
                recordingState = recording,
                canDeleteReplays = hostId != null && hostId == state.myUserId,
                backLabel = stringResource(R.string.live_video_back),
                onLoadReplays = viewModel.interactions::loadReplays,
                onDeleteReplay = viewModel.interactions::deleteReplay,
                onBack = onBack,
            )
        }
        LiveVideoPhase.SCHEDULED -> {
            val reminder by viewModel.interactions.reminder.collectAsState()
            val room = state.room
            val shareTitle = stringResource(R.string.action_share)
            LiveScheduledRoomContent(
                title = room?.title ?: "",
                description = room?.description,
                scheduledAtIso = room?.scheduledAt,
                host = state.participants.firstOrNull { it.role == "HOST" }?.user,
                isHost = room != null && room.hostId == state.myUserId,
                reminder = reminder,
                hostActionBusy = state.scheduledActionBusy,
                hostActionError = localizedError(state.scheduledActionError),
                onSetReminder = viewModel.interactions::setReminder,
                onStartNow = { viewModel.startScheduledRoom(context) },
                onCancelRoom = viewModel::cancelScheduledRoom,
                onShare = { shareLiveRoom(context, LiveRoomKind.VIDEO, roomId, room?.title, shareTitle) },
                onCheckAgain = { viewModel.recheckScheduledRoom(context) },
                onBack = onBack,
            )
        }
        LiveVideoPhase.CONNECTED -> {
            val room = viewModel.rendererRoom()
            if (room == null) {
                Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) { CircularProgressIndicator() }
            } else {
                LiveVideoConnectedContent(
                    state = state,
                    viewModel = viewModel,
                    livekitRoom = room,
                    onLeave = ::leaveAndBack,
                    onToggleMic = {
                        if (!state.isMicOn) micPermissionLauncher.launch(Manifest.permission.RECORD_AUDIO) else viewModel.toggleMic()
                    },
                    onToggleCamera = {
                        if (!state.isCameraOn) cameraPermissionLauncher.launch(Manifest.permission.CAMERA) else viewModel.toggleCamera()
                    },
                )
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun LiveVideoConnectedContent(
    state: LiveVideoRoomUiState,
    viewModel: LiveVideoRoomViewModel,
    livekitRoom: Room,
    onLeave: () -> Unit,
    onToggleMic: () -> Unit,
    onToggleCamera: () -> Unit,
) {
    val room = state.room
    val amAuthority = isLiveVideoAuthority(state.myRole)
    val iCanPublish = canPublishLiveVideo(state.myRole)
    val isHost = room != null && room.hostId == state.myUserId
    val hostUser = state.participants.firstOrNull { it.role == "HOST" }?.user
    val stageUserId = pickStageUserId(state.participants, room?.hostId)
    val stageParticipant = state.participants.firstOrNull { it.user.id == stageUserId }
    val guests = state.participants.filter { canPublishLiveVideo(it.role) && it.user.id != stageUserId }

    val chat by viewModel.interactions.chat.collectAsState()
    val gifts by viewModel.interactions.gifts.collectAsState()
    val reactions by viewModel.interactions.reactions.collectAsState()
    val recording by viewModel.interactions.recording.collectAsState()

    var chatVisible by rememberSaveable { mutableStateOf(true) }
    var giftPanelOpen by remember { mutableStateOf(false) }
    var peopleSheetOpen by remember { mutableStateOf(false) }
    var overflowOpen by remember { mutableStateOf(false) }
    var confirmEnd by remember { mutableStateOf(false) }
    var confirmRemoveUserId by remember { mutableStateOf<String?>(null) }
    var notice by remember { mutableStateOf<String?>(null) }
    val giftSentText = stringResource(R.string.live_gift_sent)
    val shareTitle = stringResource(R.string.action_share)
    val context = LocalContext.current

    Box(modifier = Modifier.fillMaxSize().background(Color.Black).imePadding()) {
        // ── Stage: host (or first publisher) fills the screen ──
        if (stageParticipant != null) {
            VideoTile(
                participant = stageParticipant,
                livekitRoom = livekitRoom,
                state = state,
                large = true,
                modifier = Modifier.fillMaxSize(),
            )
        } else {
            Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                Text(
                    text = stringResource(R.string.live_video_camera_off_label),
                    color = Color.White.copy(alpha = 0.7f),
                    style = MaterialTheme.typography.bodyMedium,
                )
            }
        }

        Column(modifier = Modifier.fillMaxSize()) {
            // ── Top bar ──
            Row(
                verticalAlignment = Alignment.CenterVertically,
                modifier = Modifier
                    .fillMaxWidth()
                    .background(ScrimColor)
                    .padding(horizontal = Spacing.xs, vertical = Spacing.xs),
            ) {
                IconButton(onClick = onLeave) {
                    Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = stringResource(R.string.nav_back), tint = Color.White)
                }
                Column(modifier = Modifier.weight(1f).padding(start = Spacing.xs)) {
                    Text(
                        text = room?.title ?: "",
                        color = Color.White,
                        fontWeight = FontWeight.Bold,
                        style = MaterialTheme.typography.titleSmall,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                    Text(
                        text = stringResource(R.string.live_video_viewer_count, state.participants.size),
                        color = Color.White.copy(alpha = 0.8f),
                        style = MaterialTheme.typography.labelSmall,
                        maxLines = 1,
                    )
                }
                if (recording.isRecording) {
                    LiveRecordingPill(onMedia = true, modifier = Modifier.padding(horizontal = Spacing.xs))
                }
                Box {
                    IconButton(onClick = { overflowOpen = true }) {
                        Icon(Icons.Filled.MoreVert, contentDescription = stringResource(R.string.discover_more), tint = Color.White)
                    }
                    DropdownMenu(expanded = overflowOpen, onDismissRequest = { overflowOpen = false }) {
                        DropdownMenuItem(
                            text = { Text(stringResource(R.string.search_category_people)) },
                            leadingIcon = { Icon(Icons.Filled.Groups, contentDescription = null) },
                            onClick = {
                                overflowOpen = false
                                peopleSheetOpen = true
                            },
                        )
                        DropdownMenuItem(
                            text = { Text(stringResource(R.string.action_share)) },
                            leadingIcon = { Icon(Icons.Filled.Share, contentDescription = null) },
                            onClick = {
                                overflowOpen = false
                                if (room != null) shareLiveRoom(context, LiveRoomKind.VIDEO, room.id, room.title, shareTitle)
                            },
                        )
                        if (amAuthority) {
                            LiveRecordingMenuItems(
                                state = recording,
                                onStart = viewModel.interactions::startRecording,
                                onStop = viewModel.interactions::stopRecording,
                                onDismissMenu = { overflowOpen = false },
                            )
                        }
                    }
                }
                if (state.myRole == "HOST") {
                    TextButton(onClick = { confirmEnd = true }) {
                        Text(stringResource(R.string.live_audio_end_room), color = ZrpRed, fontWeight = FontWeight.Bold)
                    }
                } else {
                    TextButton(onClick = onLeave) {
                        Text(stringResource(R.string.live_audio_leave_room), color = Color.White)
                    }
                }
            }

            val actionError = localizedError(state.actionError)
            if (actionError != null) {
                DismissibleErrorRow(text = actionError, onMedia = true, onDismiss = viewModel::dismissActionError)
            }
            val recordingError = liveErrorText(recording.error)
            if (recordingError != null) {
                DismissibleErrorRow(text = recordingError, onMedia = true, onDismiss = viewModel.interactions::dismissRecordingError)
            }

            if (amAuthority && state.pendingJoinRequestUserIds.isNotEmpty()) {
                PendingJoinRequestsPanel(
                    userIds = state.pendingJoinRequestUserIds,
                    participantsById = state.participants.associateBy { it.user.id },
                    busyUserId = state.actionBusyUserId,
                    onApprove = { viewModel.resolveJoinRequest(it, approve = true) },
                    onReject = { viewModel.resolveJoinRequest(it, approve = false) },
                )
            }

            // ── Guest tiles (other on-camera participants) ──
            Box(modifier = Modifier.weight(1f).fillMaxWidth()) {
                if (guests.isNotEmpty()) {
                    Column(
                        verticalArrangement = Arrangement.spacedBy(Spacing.sm),
                        modifier = Modifier
                            .align(Alignment.TopEnd)
                            .padding(Spacing.sm)
                            .verticalScroll(rememberScrollState()),
                    ) {
                        guests.forEach { guest ->
                            GuestTile(
                                participant = guest,
                                livekitRoom = livekitRoom,
                                state = state,
                                amAuthority = amAuthority,
                                viewModel = viewModel,
                                onRequestRemove = { confirmRemoveUserId = guest.user.id },
                            )
                        }
                    }
                }

                LiveGiftAnimationLayer(
                    queue = gifts.animationQueue,
                    authors = chat.authors,
                    catalog = gifts.catalog,
                    onConsumed = viewModel.interactions::consumeGiftAnimation,
                    modifier = Modifier.align(Alignment.CenterStart).padding(start = Spacing.sm, end = TouchTarget.min * 2),
                )
            }

            // ── Chat (left) + action rail (right), over the video ──
            Row(
                verticalAlignment = Alignment.Bottom,
                modifier = Modifier.fillMaxWidth().padding(horizontal = Spacing.sm),
            ) {
                Box(modifier = Modifier.weight(1f)) {
                    if (chatVisible) {
                        LiveChatPanel(
                            state = chat,
                            myUserId = state.myUserId,
                            hostId = room?.hostId,
                            canModerate = amAuthority,
                            onMedia = true,
                            onSend = viewModel.interactions::sendChat,
                            onLoadOlder = viewModel.interactions::loadOlderChat,
                            onRetryHistory = viewModel.interactions::loadChatHistory,
                            onDeleteMessage = viewModel.interactions::deleteChatMessage,
                            onSetUserChatMuted = viewModel.interactions::setUserChatMuted,
                            onSetSlowMode = viewModel.interactions::setSlowMode,
                            onDismissSendError = viewModel.interactions::dismissChatSendError,
                            onDismissActionError = viewModel.interactions::dismissChatActionError,
                            modifier = Modifier.fillMaxWidth().fillMaxHeight(0.42f),
                        )
                    }
                }
                Box(modifier = Modifier.padding(start = Spacing.xs)) {
                    ActionRail(
                        chatVisible = chatVisible,
                        canGift = !isHost,
                        reactionCount = reactions.roomReactionCount,
                        onToggleChat = { chatVisible = !chatVisible },
                        onOpenGifts = {
                            giftPanelOpen = true
                            viewModel.interactions.openGiftPanel()
                        },
                        onTapReaction = viewModel.interactions::tapReaction,
                    )
                    LiveReactionLayer(
                        bursts = reactions.bursts,
                        onConsumed = viewModel.interactions::consumeReactionBurst,
                        modifier = Modifier.matchParentSize(),
                    )
                }
            }

            // ── Media controls ──
            LiveVideoControlBar(
                canPublish = iCanPublish,
                isMicOn = state.isMicOn,
                isMicBusy = state.isMicBusy,
                isCameraOn = state.isCameraOn,
                isCameraBusy = state.isCameraBusy,
                joinRequestSent = state.joinRequestSent,
                onToggleMic = onToggleMic,
                onToggleCamera = onToggleCamera,
                onSwitchCamera = viewModel::switchCamera,
                onRequestToJoin = viewModel::requestToJoin,
            )
        }

        LiveTransientNotice(text = notice, onExpired = { notice = null }, modifier = Modifier.align(Alignment.Center))
    }

    if (peopleSheetOpen) {
        PeopleSheet(
            state = state,
            amAuthority = amAuthority,
            viewModel = viewModel,
            onRequestRemove = { confirmRemoveUserId = it },
            onDismiss = { peopleSheetOpen = false },
        )
    }

    if (giftPanelOpen) {
        LiveGiftPanel(
            state = gifts,
            hostName = hostUser?.name ?: hostUser?.username ?: "",
            onRetryCatalog = viewModel.interactions::loadCatalog,
            onRetryBalance = viewModel.interactions::refreshBalance,
            onSend = viewModel.interactions::sendGift,
            onDismissError = viewModel.interactions::dismissGiftSendError,
            onConfirmedSend = {
                giftPanelOpen = false
                notice = giftSentText
            },
            onDismiss = { giftPanelOpen = false },
        )
    }

    if (confirmEnd) {
        AlertDialog(
            onDismissRequest = { confirmEnd = false },
            title = { Text(stringResource(R.string.live_audio_end_room_confirm_title)) },
            confirmButton = {
                TextButton(onClick = {
                    confirmEnd = false
                    viewModel.endRoom()
                }) { Text(stringResource(R.string.live_audio_end_room), color = ZrpRed) }
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
                TextButton(onClick = {
                    confirmRemoveUserId = null
                    viewModel.remove(removeId)
                }) { Text(stringResource(R.string.live_audio_remove_action), color = ZrpRed) }
            },
            dismissButton = { TextButton(onClick = { confirmRemoveUserId = null }) { Text(stringResource(R.string.action_cancel)) } },
        )
    }
}

/**
 * One participant's camera, or their avatar when there is nothing to
 * show: no subscribed track yet (camera never turned on), the track is
 * muted (camera turned off), or a moderator forced it off (isCameraOff -
 * that flag wins even if a stale frame is still arriving).
 */
@Composable
private fun VideoTile(
    participant: LiveVideoParticipant,
    livekitRoom: Room,
    state: LiveVideoRoomUiState,
    large: Boolean,
    modifier: Modifier = Modifier,
) {
    val userId = participant.user.id
    val track = state.videoTracks[userId]
    val showVideo = track != null && userId !in state.mutedVideoUserIds && !participant.isCameraOff
    val isMe = userId == state.myUserId
    val name = participant.user.name ?: participant.user.username
    val speaking = userId in state.speakingUserIds && !participant.isMuted

    Box(modifier = modifier.background(ZrpSurfaceContainer), contentAlignment = Alignment.Center) {
        if (showVideo) {
            LiveVideoRenderer(
                room = livekitRoom,
                videoTrack = track,
                mirror = isMe && state.isFrontCamera,
                modifier = Modifier.fillMaxSize(),
            )
        } else {
            Column(horizontalAlignment = Alignment.CenterHorizontally) {
                Avatar(
                    url = participant.user.avatarUrl,
                    name = name,
                    size = if (large) 96.dp else 40.dp,
                    ringColor = if (speaking) ZrpRed else null,
                )
                if (large) {
                    Text(
                        text = name,
                        color = Color.White,
                        style = MaterialTheme.typography.titleMedium,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                        modifier = Modifier.padding(top = Spacing.sm),
                    )
                    Text(
                        text = stringResource(R.string.live_video_camera_off_label),
                        color = Color.White.copy(alpha = 0.7f),
                        style = MaterialTheme.typography.labelMedium,
                    )
                }
            }
        }
        if (participant.isMuted) {
            Box(
                modifier = Modifier
                    .align(if (large) Alignment.BottomCenter else Alignment.BottomEnd)
                    .padding(Spacing.xs)
                    .size(22.dp)
                    .background(ScrimColor, CircleShape),
                contentAlignment = Alignment.Center,
            ) {
                Icon(Icons.Filled.MicOff, contentDescription = stringResource(R.string.live_audio_muted_label), tint = Color.White, modifier = Modifier.size(14.dp))
            }
        }
    }
}

@Composable
private fun GuestTile(
    participant: LiveVideoParticipant,
    livekitRoom: Room,
    state: LiveVideoRoomUiState,
    amAuthority: Boolean,
    viewModel: LiveVideoRoomViewModel,
    onRequestRemove: () -> Unit,
) {
    var menuOpen by remember { mutableStateOf(false) }
    val isMe = participant.user.id == state.myUserId
    val canModerate = amAuthority && !isMe
    val name = participant.user.name ?: participant.user.username
    val speaking = participant.user.id in state.speakingUserIds && !participant.isMuted
    val shape = RoundedCornerShape(Radius.sm)

    Box {
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            VideoTile(
                participant = participant,
                livekitRoom = livekitRoom,
                state = state,
                large = false,
                modifier = Modifier
                    .size(width = 92.dp, height = 124.dp)
                    .clip(shape)
                    .border(if (speaking) 2.dp else 1.dp, if (speaking) ZrpRed else Color.White.copy(alpha = 0.25f), shape)
                    .then(if (canModerate) Modifier.clickable(role = Role.Button, onClickLabel = name) { menuOpen = true } else Modifier),
            )
            Text(
                text = name,
                color = Color.White,
                style = MaterialTheme.typography.labelSmall,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.width(92.dp).padding(top = 2.dp),
                textAlign = TextAlign.Center,
            )
        }
        ParticipantModerationMenu(
            expanded = menuOpen,
            participant = participant,
            onDismiss = { menuOpen = false },
            viewModel = viewModel,
            onRequestRemove = onRequestRemove,
        )
    }
}

/** Host/moderator actions on another participant - the same set web's room page offers, including the video-only camera force-off. */
@Composable
private fun ParticipantModerationMenu(
    expanded: Boolean,
    participant: LiveVideoParticipant,
    onDismiss: () -> Unit,
    viewModel: LiveVideoRoomViewModel,
    onRequestRemove: () -> Unit,
) {
    val userId = participant.user.id
    DropdownMenu(expanded = expanded, onDismissRequest = onDismiss) {
        if (participant.role == "LISTENER") {
            DropdownMenuItem(text = { Text(stringResource(R.string.live_video_invite_on_camera)) }, onClick = { onDismiss(); viewModel.promote(userId) })
        } else if (participant.role == "SPEAKER") {
            DropdownMenuItem(text = { Text(stringResource(R.string.live_video_move_to_viewer)) }, onClick = { onDismiss(); viewModel.demote(userId) })
        }
        if (participant.role != "LISTENER") {
            DropdownMenuItem(
                text = { Text(stringResource(if (participant.isMuted) R.string.live_audio_unmute_action else R.string.live_audio_mute_action)) },
                onClick = { onDismiss(); if (participant.isMuted) viewModel.unmute(userId) else viewModel.mute(userId) },
            )
            DropdownMenuItem(
                text = { Text(stringResource(if (participant.isCameraOff) R.string.live_video_camera_on_action else R.string.live_video_camera_off_action)) },
                onClick = { onDismiss(); if (participant.isCameraOff) viewModel.allowCamera(userId) else viewModel.forceCameraOff(userId) },
            )
        }
        DropdownMenuItem(
            text = { Text(stringResource(R.string.live_audio_remove_action), color = ZrpRed) },
            onClick = { onDismiss(); onRequestRemove() },
        )
    }
}

@Composable
private fun ActionRail(
    chatVisible: Boolean,
    canGift: Boolean,
    reactionCount: Int,
    onToggleChat: () -> Unit,
    onOpenGifts: () -> Unit,
    onTapReaction: () -> Unit,
) {
    Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(Spacing.xs)) {
        RailButton(onClick = onToggleChat) {
            Icon(
                Icons.Filled.ChatBubbleOutline,
                contentDescription = stringResource(if (chatVisible) R.string.live_chat_hide else R.string.live_chat_show),
                tint = if (chatVisible) Color.White else Color.White.copy(alpha = 0.6f),
            )
        }
        if (canGift) {
            RailButton(onClick = onOpenGifts) {
                Icon(Icons.Filled.CardGiftcard, contentDescription = stringResource(R.string.live_gift_open), tint = Color.White)
            }
        }
        RailButton(onClick = onTapReaction) {
            Icon(Icons.Filled.Favorite, contentDescription = stringResource(R.string.live_reaction_send), tint = ZrpRed)
        }
        if (reactionCount > 0) {
            Text(text = reactionCount.toString(), color = Color.White, style = MaterialTheme.typography.labelSmall)
        }
    }
}

@Composable
private fun RailButton(onClick: () -> Unit, content: @Composable () -> Unit) {
    IconButton(
        onClick = onClick,
        modifier = Modifier.size(TouchTarget.min).clip(CircleShape).background(ScrimColor),
    ) {
        content()
    }
}

@Composable
private fun LiveVideoControlBar(
    canPublish: Boolean,
    isMicOn: Boolean,
    isMicBusy: Boolean,
    isCameraOn: Boolean,
    isCameraBusy: Boolean,
    joinRequestSent: Boolean,
    onToggleMic: () -> Unit,
    onToggleCamera: () -> Unit,
    onSwitchCamera: () -> Unit,
    onRequestToJoin: () -> Unit,
) {
    Row(
        modifier = Modifier.fillMaxWidth().padding(horizontal = Spacing.lg, vertical = Spacing.md),
        horizontalArrangement = Arrangement.spacedBy(Spacing.lg, Alignment.CenterHorizontally),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        if (canPublish) {
            MediaToggle(
                on = isMicOn,
                busy = isMicBusy,
                onIcon = Icons.Filled.Mic,
                offIcon = Icons.Filled.MicOff,
                onLabel = stringResource(R.string.live_audio_mute_self),
                offLabel = stringResource(R.string.live_audio_unmute_self),
                onClick = onToggleMic,
            )
            MediaToggle(
                on = isCameraOn,
                busy = isCameraBusy,
                onIcon = Icons.Filled.Videocam,
                offIcon = Icons.Filled.VideocamOff,
                onLabel = stringResource(R.string.live_video_camera_off_self),
                offLabel = stringResource(R.string.live_video_camera_on_self),
                onClick = onToggleCamera,
            )
            if (isCameraOn) {
                IconButton(
                    onClick = onSwitchCamera,
                    modifier = Modifier.size(TouchTarget.comfortable).clip(CircleShape).background(ScrimColor),
                ) {
                    Icon(Icons.Filled.FlipCameraAndroid, contentDescription = stringResource(R.string.live_video_switch_camera), tint = Color.White)
                }
            }
        } else {
            OutlinedButton(
                onClick = onRequestToJoin,
                enabled = !joinRequestSent,
                colors = ButtonDefaults.outlinedButtonColors(containerColor = ScrimColor, contentColor = Color.White),
            ) {
                Icon(Icons.Filled.PanTool, contentDescription = null, modifier = Modifier.size(IconSize.sm))
                Text(
                    text = stringResource(if (joinRequestSent) R.string.live_audio_request_sent else R.string.live_video_raise_hand),
                    modifier = Modifier.padding(start = Spacing.xs),
                )
            }
        }
    }
}

/** Off = brand red (the "you're not live on this" state), on = translucent - same convention as Live Audio's mic button. */
@Composable
private fun MediaToggle(
    on: Boolean,
    busy: Boolean,
    onIcon: androidx.compose.ui.graphics.vector.ImageVector,
    offIcon: androidx.compose.ui.graphics.vector.ImageVector,
    onLabel: String,
    offLabel: String,
    onClick: () -> Unit,
) {
    IconButton(
        onClick = onClick,
        enabled = !busy,
        modifier = Modifier
            .size(TouchTarget.comfortable)
            .clip(CircleShape)
            .background(if (on) ScrimColor else ZrpRed),
    ) {
        if (busy) {
            CircularProgressIndicator(modifier = Modifier.size(IconSize.sm), color = Color.White, strokeWidth = 2.dp)
        } else {
            Icon(if (on) onIcon else offIcon, contentDescription = if (on) onLabel else offLabel, tint = Color.White)
        }
    }
}

@Composable
private fun PendingJoinRequestsPanel(
    userIds: List<String>,
    participantsById: Map<String, LiveVideoParticipant>,
    busyUserId: String?,
    onApprove: (String) -> Unit,
    onReject: (String) -> Unit,
) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .background(ScrimColor)
            .padding(horizontal = Spacing.md, vertical = Spacing.sm),
    ) {
        Text(
            text = stringResource(R.string.live_video_pending_requests, userIds.size),
            color = Color.White,
            fontWeight = FontWeight.Bold,
            style = MaterialTheme.typography.labelLarge,
        )
        userIds.forEach { userId ->
            val participant = participantsById[userId]
            val name = participant?.user?.name ?: participant?.user?.username ?: stringResource(R.string.live_chat_unknown_author)
            Row(modifier = Modifier.fillMaxWidth().padding(top = Spacing.xs), verticalAlignment = Alignment.CenterVertically) {
                Avatar(url = participant?.user?.avatarUrl, name = name, size = 28.dp)
                Text(
                    text = name,
                    color = Color.White,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    modifier = Modifier.weight(1f).padding(start = Spacing.sm),
                )
                if (busyUserId == userId) {
                    CircularProgressIndicator(modifier = Modifier.size(IconSize.sm), color = Color.White, strokeWidth = 2.dp)
                } else {
                    IconButton(onClick = { onApprove(userId) }) {
                        Icon(Icons.Filled.Check, contentDescription = stringResource(R.string.live_audio_approve), tint = Color.White)
                    }
                    IconButton(onClick = { onReject(userId) }) {
                        Icon(Icons.Filled.Close, contentDescription = stringResource(R.string.live_audio_decline), tint = Color.White)
                    }
                }
            }
        }
    }
}

/**
 * Everyone in the room, grouped like web's room page (on camera /
 * viewers). For a host/moderator each row opens the same moderation menu
 * as a guest tile - this is the only place a viewer (who has no tile)
 * can be invited on camera or removed.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun PeopleSheet(
    state: LiveVideoRoomUiState,
    amAuthority: Boolean,
    viewModel: LiveVideoRoomViewModel,
    onRequestRemove: (String) -> Unit,
    onDismiss: () -> Unit,
) {
    val sheetState = rememberModalBottomSheetState()
    val (onCamera, viewers) = state.participants.partition { canPublishLiveVideo(it.role) }
    ModalBottomSheet(onDismissRequest = onDismiss, sheetState = sheetState, containerColor = MaterialTheme.colorScheme.surfaceContainer) {
        LazyColumn(modifier = Modifier.fillMaxWidth().heightIn(max = 520.dp)) {
            item {
                Text(
                    text = stringResource(R.string.live_video_participants_heading),
                    style = MaterialTheme.typography.titleSmall,
                    fontWeight = FontWeight.Bold,
                    modifier = Modifier.padding(horizontal = Spacing.lg, vertical = Spacing.sm),
                )
            }
            items(onCamera, key = { "cam-" + it.user.id }) { participant ->
                PersonRow(participant, state, amAuthority, viewModel, onRequestRemove = { onRequestRemove(participant.user.id) })
            }
            if (viewers.isNotEmpty()) {
                item {
                    Text(
                        text = stringResource(R.string.live_video_viewers_heading),
                        style = MaterialTheme.typography.titleSmall,
                        fontWeight = FontWeight.Bold,
                        modifier = Modifier.padding(start = Spacing.lg, end = Spacing.lg, top = Spacing.lg, bottom = Spacing.sm),
                    )
                }
                items(viewers, key = { "view-" + it.user.id }) { participant ->
                    PersonRow(participant, state, amAuthority, viewModel, onRequestRemove = { onRequestRemove(participant.user.id) })
                }
            }
        }
    }
}

@Composable
private fun PersonRow(
    participant: LiveVideoParticipant,
    state: LiveVideoRoomUiState,
    amAuthority: Boolean,
    viewModel: LiveVideoRoomViewModel,
    onRequestRemove: () -> Unit,
) {
    var menuOpen by remember { mutableStateOf(false) }
    val isMe = participant.user.id == state.myUserId
    val canModerate = amAuthority && !isMe
    val name = participant.user.name ?: participant.user.username
    Box {
        Row(
            verticalAlignment = Alignment.CenterVertically,
            modifier = Modifier
                .fillMaxWidth()
                .then(if (canModerate) Modifier.clickable(role = Role.Button, onClickLabel = name) { menuOpen = true } else Modifier)
                .padding(horizontal = Spacing.lg, vertical = Spacing.sm),
        ) {
            Avatar(url = participant.user.avatarUrl, name = name, size = 36.dp)
            // Name + role badge take the free width; the name ellipsizes
            // before it can push the badge or the status icons off-screen.
            Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.weight(1f).padding(start = Spacing.sm)) {
                Text(
                    text = name,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    modifier = Modifier.weight(1f, fill = false),
                )
                when (participant.role) {
                    "HOST" -> RoleLabel(stringResource(R.string.live_audio_host_badge))
                    "MODERATOR" -> RoleLabel(stringResource(R.string.live_audio_moderator_badge))
                }
            }
            if (participant.isMuted) {
                Icon(Icons.Filled.MicOff, contentDescription = stringResource(R.string.live_audio_muted_label), modifier = Modifier.size(IconSize.sm))
            }
            if (participant.isCameraOff) {
                Icon(
                    Icons.Filled.VideocamOff,
                    contentDescription = stringResource(R.string.live_video_camera_off_label),
                    modifier = Modifier.padding(start = Spacing.xs).size(IconSize.sm),
                )
            }
            if (state.actionBusyUserId == participant.user.id) {
                CircularProgressIndicator(modifier = Modifier.padding(start = Spacing.xs).size(IconSize.sm), strokeWidth = 2.dp)
            }
        }
        ParticipantModerationMenu(
            expanded = menuOpen,
            participant = participant,
            onDismiss = { menuOpen = false },
            viewModel = viewModel,
            onRequestRemove = onRequestRemove,
        )
    }
}

@Composable
private fun RoleLabel(text: String) {
    Text(text = text, color = ZrpRed, style = MaterialTheme.typography.labelSmall, modifier = Modifier.padding(start = Spacing.xs))
}
