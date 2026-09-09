package one.zrp.social.mobile.ui.messages

import android.Manifest
import android.content.Intent
import android.media.MediaRecorder
import android.net.Uri
import android.provider.OpenableColumns
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.background
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.isImeVisible
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.AttachFile
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.Call
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Description
import androidx.compose.material.icons.filled.Download
import androidx.compose.material.icons.filled.Mic
import androidx.compose.material.icons.filled.Pause
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material.icons.filled.Send
import androidx.compose.material.icons.filled.VideoLibrary
import androidx.compose.material.icons.filled.Videocam
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
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
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.core.content.FileProvider
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.media3.common.MediaItem
import androidx.media3.common.Player
import androidx.media3.common.util.UnstableApi
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.ui.AspectRatioFrameLayout
import androidx.media3.ui.PlayerView
import coil.compose.AsyncImage
import one.zrp.social.mobile.R
import one.zrp.social.mobile.data.MessagesRepository
import one.zrp.social.mobile.network.ChatMessage
import one.zrp.social.mobile.ui.call.CallPhase
import one.zrp.social.mobile.ui.call.CallScreen
import one.zrp.social.mobile.ui.call.CallViewModel
import one.zrp.social.mobile.ui.call.CallViewModelFactory
import one.zrp.social.mobile.ui.components.AddReactionDialog
import one.zrp.social.mobile.ui.components.Avatar
import one.zrp.social.mobile.ui.components.EditPostDialog
import one.zrp.social.mobile.ui.components.VerifiedBadge
import one.zrp.social.mobile.ui.theme.Spacing
import one.zrp.social.mobile.ui.theme.ZrpRed
import one.zrp.social.mobile.util.formatRelativeTime

/**
 * A single conversation - real message history and real sending
 * against the same DM endpoints the website uses, plus the same real
 * per-message reply/edit/delete/react actions ChatInterface.tsx
 * exposes. New messages, edits, deletes, reactions, read receipts and
 * typing status all arrive live over the same real Socket.IO
 * connection the website uses (see ConversationViewModel's KDoc).
 */
@OptIn(ExperimentalLayoutApi::class)
@Composable
fun ConversationScreen(
    partnerId: String,
    partnerUsername: String,
    onBack: () -> Unit,
    onOpenProfile: () -> Unit,
) {
    val viewModel: ConversationViewModel = viewModel(
        factory = remember(partnerId) { ConversationViewModelFactory(MessagesRepository(), partnerId) },
    )
    val state by viewModel.state.collectAsState()

    val callViewModel: CallViewModel = viewModel(factory = remember { CallViewModelFactory() })
    val callState by callViewModel.state.collectAsState()
    val context = LocalContext.current

    // Signaling is only live while this screen is open - matches
    // page.tsx's own page-scoped setupSocket()/useEffect cleanup (see
    // CallViewModel's own KDoc).
    DisposableEffect(Unit) {
        callViewModel.connectSignaling()
        onDispose { callViewModel.disconnectSignaling() }
    }

    var deletingMessageId by remember { mutableStateOf<String?>(null) }
    var isDeletingMessage by remember { mutableStateOf(false) }
    var reactingToMessageId by remember { mutableStateOf<String?>(null) }
    var showContactPopup by remember { mutableStateOf(false) }
    var isBlocked by remember { mutableStateOf(false) }

    val listState = rememberLazyListState()
    var pendingScrollIndex by remember { mutableStateOf<Int?>(null) }

    // Matches getUserMedia's own browser permission prompt, asked right
    // before a call actually starts/is accepted rather than up front.
    var pendingVideoCall by remember { mutableStateOf(false) }
    val callPermissionLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.RequestMultiplePermissions(),
    ) { granted ->
        if (granted[Manifest.permission.RECORD_AUDIO] == true) {
            val partner = state.partner
            if (partner != null) {
                callViewModel.startCall(context, partner.id, pendingVideoCall)
            }
        }
    }
    fun requestCall(isVideo: Boolean) {
        pendingVideoCall = isVideo
        val permissions = if (isVideo) {
            arrayOf(Manifest.permission.RECORD_AUDIO, Manifest.permission.CAMERA)
        } else {
            arrayOf(Manifest.permission.RECORD_AUDIO)
        }
        callPermissionLauncher.launch(permissions)
    }

    // Matches ChatInterface.tsx's own handleImageUpload - same real
    // chatImage UploadThing router, same 4MB/JPEG-PNG-GIF-WebP limits
    // (see ConversationViewModel.onImagePicked).
    val contentResolver = context.contentResolver
    val imagePickerLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.PickVisualMedia(),
    ) { uri ->
        if (uri != null) {
            val (name, size) = queryFileNameAndSize(contentResolver, uri)
            val mimeType = contentResolver.getType(uri) ?: "image/jpeg"
            viewModel.onImagePicked(contentResolver, uri, name, mimeType, size)
        }
    }

    // Matches ChatInterface.tsx's own handleVideoUpload - same real
    // chatVideo UploadThing router (see ConversationViewModel.onVideoPicked).
    // No safe MIME fallback here unlike the image picker above: the
    // system Photo Picker's VideoOnly filter already guarantees a real
    // video was chosen, but guessing a specific codec type if
    // contentResolver.getType() ever returns null would risk silently
    // bypassing onVideoPicked's own type check - an empty string simply
    // (and correctly) fails that check instead.
    val videoPickerLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.PickVisualMedia(),
    ) { uri ->
        if (uri != null) {
            val (name, size) = queryFileNameAndSize(contentResolver, uri)
            val mimeType = contentResolver.getType(uri) ?: ""
            viewModel.onVideoPicked(contentResolver, uri, name, mimeType, size)
        }
    }

    // Matches ChatInterface.tsx's own handleDocumentUpload - the system
    // document picker's own mimeType filter narrows the picker UI to
    // real documents, same as OpenDocument()'s array below, and
    // onDocumentPicked's own allow-list is the final real check (same
    // belt-and-suspenders shape web's own client-side DOCUMENT_TYPES
    // check has, despite the picker UI already filtering).
    val documentMimeTypes = arrayOf(
        "application/pdf",
        "application/msword",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "application/vnd.ms-excel",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "application/vnd.ms-powerpoint",
        "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        "text/plain",
    )
    val documentPickerLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.OpenDocument(),
    ) { uri ->
        if (uri != null) {
            val (name, size) = queryFileNameAndSize(contentResolver, uri)
            val mimeType = contentResolver.getType(uri) ?: ""
            viewModel.onDocumentPicked(contentResolver, uri, name, mimeType, size)
        }
    }

    // Matches ChatInterface.tsx's own startRecording/stopAndSendRecording/
    // cancelRecording - real MediaRecorder audio, not a picked file, so
    // it's driven from this Screen (which owns Context/File the same way
    // MediaUploadRepository's own KDoc establishes) rather than the
    // ViewModel. MPEG_4/AAC output (audio/mp4) is the same format web's
    // own mimeCandidates list already falls back to on browsers without
    // WebM/Opus support - real, cross-platform-compatible audio, not a
    // native-only format the chatAudio router wouldn't otherwise see.
    var mediaRecorder by remember { mutableStateOf<MediaRecorder?>(null) }
    var recordingFile by remember { mutableStateOf<java.io.File?>(null) }
    var micAccessError by remember { mutableStateOf(false) }

    fun startRecording() {
        val dir = java.io.File(context.cacheDir, "voice-messages").apply { mkdirs() }
        val file = java.io.File(dir, "voice-message-${System.currentTimeMillis()}.m4a")
        val recorder = if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.S) {
            MediaRecorder(context)
        } else {
            @Suppress("DEPRECATION")
            MediaRecorder()
        }
        try {
            recorder.apply {
                setAudioSource(MediaRecorder.AudioSource.MIC)
                setOutputFormat(MediaRecorder.OutputFormat.MPEG_4)
                setAudioEncoder(MediaRecorder.AudioEncoder.AAC)
                setOutputFile(file.absolutePath)
                prepare()
                start()
            }
            mediaRecorder = recorder
            recordingFile = file
            viewModel.startRecordingTimer()
        } catch (e: Exception) {
            recorder.release()
            micAccessError = true
        }
    }

    val micPermissionLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.RequestPermission(),
    ) { granted -> if (granted) startRecording() else micAccessError = true }

    fun cancelRecording() {
        val recorder = mediaRecorder
        if (recorder != null) {
            runCatching { recorder.stop() }
            recorder.release()
        }
        mediaRecorder = null
        recordingFile?.delete()
        recordingFile = null
        viewModel.cancelRecordingTimer()
    }

    fun stopAndSendRecording() {
        val recorder = mediaRecorder ?: return
        val file = recordingFile ?: return
        // stop() throws if called within ~1s of start() (nothing was
        // actually captured yet) - same case web's own onstop guards
        // against by checking audioChunksRef.current.length === 0, just
        // surfaced here as an exception instead of an empty chunk array.
        // Treated the same way web treats it: discard, don't send.
        val stopped = runCatching { recorder.stop() }.isSuccess
        recorder.release()
        mediaRecorder = null
        recordingFile = null
        if (!stopped) {
            file.delete()
            viewModel.cancelRecordingTimer()
            return
        }

        val uri = FileProvider.getUriForFile(context, "${context.packageName}.fileprovider", file)
        viewModel.onVoiceRecorded(contentResolver, uri, file.name, "audio/mp4", file.length())
    }

    if (callState.phase != CallPhase.IDLE) {
        CallScreen(viewModel = callViewModel, onDismiss = {})
        return
    }

    // MainActivity opts into enableEdgeToEdge(), so AndroidManifest.xml's
    // windowSoftInputMode="adjustResize" alone doesn't reserve space for
    // the IME here - Compose draws behind it unless a real inset modifier
    // asks for the space back. imePadding() on this screen's own root
    // Column (rather than something higher up shared with other routes)
    // adds bottom padding equal to the keyboard's height whenever it's
    // visible, shrinking the LazyColumn below (its weight(1f) box) and
    // lifting the composer row above the keyboard - real inset-driven
    // layout, not a fixed dp guess, so it holds on any screen size. The
    // top header Row is unaffected: it isn't inside the padded space.
    Column(modifier = Modifier.fillMaxSize().imePadding()) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 8.dp, vertical = 4.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            IconButton(onClick = onBack) {
                Icon(Icons.Filled.ArrowBack, contentDescription = stringResource(R.string.chat_back_to_messages))
            }

            val partner = state.partner
            Row(
                modifier = Modifier
                    .weight(1f)
                    .padding(start = 4.dp)
                    // Matches ChatInterface.tsx's own header button - opens
                    // the same real user-action popup web's own
                    // ChatContactDrawer is, rather than jumping straight to
                    // the profile.
                    .clickable { showContactPopup = true },
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Avatar(
                    url = partner?.avatarUrl,
                    name = partner?.name ?: partner?.username ?: partnerUsername,
                    size = 36.dp,
                )
                Column(modifier = Modifier.padding(start = Spacing.sm)) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text(
                            text = partner?.name ?: partner?.username ?: partnerUsername,
                            style = MaterialTheme.typography.titleMedium,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                            modifier = Modifier.weight(1f, fill = false),
                        )
                        VerifiedBadge(badgeType = partner?.badgeType)
                    }
                    // Matches ChatInterface.tsx's own header status row - a
                    // "Typing..." indicator (from the real "user-typing" socket
                    // event) takes priority over the live/offline connection
                    // dot, exactly like web's own receiverTyping-vs-socketConnected
                    // conditional.
                    if (state.partnerTyping) {
                        Text(
                            text = stringResource(R.string.chat_typing),
                            style = MaterialTheme.typography.labelSmall,
                            color = ZrpRed,
                        )
                    } else {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Box(
                                modifier = Modifier
                                    .size(6.dp)
                                    .clip(CircleShape)
                                    .background(if (state.socketConnected) Color(0xFF22C55E) else Color(0xFFEF4444)),
                            )
                            Text(
                                text = stringResource(if (state.socketConnected) R.string.chat_live else R.string.chat_offline),
                                style = MaterialTheme.typography.labelSmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                                modifier = Modifier.padding(start = 4.dp),
                            )
                        }
                    }
                }
            }

            IconButton(onClick = { requestCall(isVideo = false) }) {
                Icon(Icons.Filled.Call, contentDescription = stringResource(R.string.message_voice_call_cd))
            }
            IconButton(onClick = { requestCall(isVideo = true) }) {
                Icon(Icons.Filled.Videocam, contentDescription = stringResource(R.string.message_video_call_cd))
            }
        }
        HorizontalDivider()

        val popupPartner = state.partner
        if (showContactPopup && popupPartner != null) {
            ChatContactPopup(
                partner = popupPartner,
                messages = state.messages,
                isBlocked = isBlocked,
                onDismiss = { showContactPopup = false },
                onOpenProfile = onOpenProfile,
                onVoiceCall = { requestCall(isVideo = false) },
                onVideoCall = { requestCall(isVideo = true) },
                onBlockToggled = { isBlocked = it },
            )
        }

        Box(
            modifier = Modifier
                .weight(1f)
                .fillMaxWidth(),
        ) {
            if (state.isLoading) {
                Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    CircularProgressIndicator()
                }
            } else if (state.messages.isEmpty()) {
                // Matches ChatInterface.tsx's own empty-conversation state
                // (chat.noMessagesYet + chat.sayHello) rather than the
                // blank scroll view this screen showed before.
                Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    Column(horizontalAlignment = Alignment.CenterHorizontally) {
                        Text(
                            text = stringResource(R.string.chat_no_messages_yet),
                            style = MaterialTheme.typography.titleSmall,
                            color = MaterialTheme.colorScheme.onSurface,
                        )
                        Text(
                            text = stringResource(R.string.chat_say_hello, partnerUsername),
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            modifier = Modifier.padding(top = 4.dp),
                        )
                    }
                }
            } else {
                LaunchedEffect(state.messages.size) {
                    if (state.messages.isNotEmpty()) {
                        listState.animateScrollToItem(state.messages.size - 1)
                    }
                }

                // Opening the keyboard shrinks this LazyColumn's own
                // height (imePadding() above eats the difference from
                // the bottom of the screen), which by itself doesn't
                // re-scroll anything - a list that was already scrolled
                // to the last message can end up with that message
                // pushed behind the keyboard instead of staying visible
                // above it. Re-asserting the same "last message" scroll
                // target used above whenever the IME's visibility flips
                // keeps the most recent message in view the moment
                // typing starts, not just on the next new message.
                val imeVisible = WindowInsets.isImeVisible
                LaunchedEffect(imeVisible) {
                    if (imeVisible && state.messages.isNotEmpty()) {
                        listState.animateScrollToItem(state.messages.size - 1)
                    }
                }

                LazyColumn(
                    state = listState,
                    modifier = Modifier
                        .fillMaxSize()
                        .padding(horizontal = 12.dp),
                ) {
                    items(state.messages, key = { it.id }) { message ->
                        MessageBubble(
                            message = message,
                            isOwnMessage = message.senderId != partnerId,
                            onReplyClick = { viewModel.startReply(message) },
                            onEditClick = { viewModel.startEdit(message) },
                            onDeleteClick = { deletingMessageId = message.id },
                            onReactClick = { emoji -> viewModel.toggleReaction(message.id, emoji) },
                            onAddReactionClick = { reactingToMessageId = message.id },
                            onReplyPreviewClick = { targetId ->
                                val index = state.messages.indexOfFirst { it.id == targetId }
                                if (index >= 0) pendingScrollIndex = index
                            },
                            ownReaction = message.reactions.firstOrNull { it.user.id != partnerId }?.emoji,
                        )
                    }
                }

                LaunchedEffect(pendingScrollIndex) {
                    pendingScrollIndex?.let { index ->
                        listState.animateScrollToItem(index)
                        pendingScrollIndex = null
                    }
                }
            }
        }

        if (state.error != null) {
            Text(
                text = state.error ?: "",
                color = MaterialTheme.colorScheme.error,
                style = MaterialTheme.typography.bodySmall,
                modifier = Modifier.padding(horizontal = 12.dp, vertical = 4.dp),
            )
        }

        val replyingTo = state.replyingTo
        if (replyingTo != null) {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 12.dp, vertical = 4.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        text = "Replying to ${if (replyingTo.senderId == partnerId) "@$partnerUsername" else "yourself"}",
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                    Text(
                        // "📷 Image" stays English-only on purpose - matches
                        // ChatInterface.tsx's own hardcoded, untranslated reply-preview
                        // fallback for an image sent with no caption.
                        text = replyingTo.content.ifBlank { if (replyingTo.imageUrl != null) "📷 Image" else "" },
                        style = MaterialTheme.typography.bodySmall,
                        maxLines = 1,
                    )
                }
                IconButton(onClick = { viewModel.cancelReply() }) {
                    // "Cancel reply" stays English-only on purpose - matches
                    // ChatInterface.tsx's own hardcoded, untranslated aria-label.
                    Icon(Icons.Filled.Close, contentDescription = stringResource(R.string.comment_cancel_reply_cd))
                }
            }
        }

        if (state.isUploadingAttachment) {
            LinearProgressIndicator(
                progress = { state.attachmentUploadProgress },
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 12.dp),
                color = ZrpRed,
            )
        }

        val attachmentError = state.attachmentError
        if (attachmentError != null) {
            Text(
                text = chatAttachmentErrorMessage(attachmentError),
                color = MaterialTheme.colorScheme.error,
                style = MaterialTheme.typography.bodySmall,
                modifier = Modifier.padding(horizontal = 12.dp, vertical = 4.dp),
            )
        }

        if (micAccessError) {
            Text(
                text = stringResource(R.string.chat_err_mic_access),
                color = MaterialTheme.colorScheme.error,
                style = MaterialTheme.typography.bodySmall,
                modifier = Modifier.padding(horizontal = 12.dp, vertical = 4.dp),
            )
        }

        if (state.isRecording) {
            // Matches ChatInterface.tsx's own isRecording sub-bar exactly:
            // cancel (trash), a pulsing dot, the live m:ss timer, a
            // "Recording..." label, and a send button - replacing the
            // whole normal composer row rather than just swapping one
            // button.
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(8.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                IconButton(onClick = { cancelRecording() }) {
                    Icon(
                        imageVector = Icons.Filled.Delete,
                        contentDescription = stringResource(R.string.chat_cancel_recording_cd),
                        tint = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }

                val pulseAlpha by rememberInfiniteTransition(label = "recordingPulse").animateFloat(
                    initialValue = 1f,
                    targetValue = 0.3f,
                    animationSpec = infiniteRepeatable(animation = tween(700), repeatMode = RepeatMode.Reverse),
                    label = "recordingPulseAlpha",
                )
                Box(
                    modifier = Modifier
                        .size(10.dp)
                        .clip(CircleShape)
                        .background(Color(0xFFEF4444).copy(alpha = pulseAlpha)),
                )

                Text(
                    text = formatRecordingTime(state.recordingSeconds),
                    style = MaterialTheme.typography.labelMedium,
                    modifier = Modifier.padding(start = Spacing.sm),
                )
                Text(
                    text = stringResource(R.string.chat_recording_label),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier
                        .weight(1f)
                        .padding(start = Spacing.sm),
                )

                IconButton(onClick = { stopAndSendRecording() }) {
                    Icon(
                        imageVector = Icons.Filled.Send,
                        contentDescription = stringResource(R.string.chat_send_voice_message_cd),
                        tint = ZrpRed,
                    )
                }
            }
        } else {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(8.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                IconButton(
                    onClick = {
                        imagePickerLauncher.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly))
                    },
                    enabled = !state.isUploadingAttachment,
                ) {
                    Icon(Icons.Filled.AttachFile, contentDescription = stringResource(R.string.message_attach_image_cd))
                }

                IconButton(
                    onClick = {
                        videoPickerLauncher.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.VideoOnly))
                    },
                    enabled = !state.isUploadingAttachment,
                ) {
                    Icon(Icons.Filled.VideoLibrary, contentDescription = stringResource(R.string.message_attach_video_cd))
                }

                IconButton(
                    onClick = { documentPickerLauncher.launch(documentMimeTypes) },
                    enabled = !state.isUploadingAttachment,
                ) {
                    Icon(Icons.Filled.Description, contentDescription = stringResource(R.string.message_attach_document_cd))
                }

                OutlinedTextField(
                    value = state.draft,
                    onValueChange = { viewModel.onDraftChange(it) },
                    placeholder = { Text(stringResource(R.string.chat_message_placeholder, partnerUsername)) },
                    enabled = !state.isSending,
                    modifier = Modifier.weight(1f),
                )

                Spacer(modifier = Modifier.width(8.dp))

                // Matches ChatInterface.tsx's own Send-or-Mic swap: an
                // empty draft shows the mic (tap to start recording), any
                // typed text shows Send instead - the same toggle, not two
                // independently-shown buttons.
                if (state.draft.isNotBlank()) {
                    IconButton(
                        onClick = { viewModel.send() },
                        enabled = !state.isSending,
                    ) {
                        if (state.isSending) {
                            CircularProgressIndicator(modifier = Modifier.size(20.dp), strokeWidth = 2.dp)
                        } else {
                            Icon(
                                imageVector = Icons.Filled.Send,
                                contentDescription = stringResource(R.string.message_send_cd),
                                tint = ZrpRed,
                            )
                        }
                    }
                } else {
                    IconButton(
                        onClick = {
                            micAccessError = false
                            micPermissionLauncher.launch(Manifest.permission.RECORD_AUDIO)
                        },
                        enabled = !state.isUploadingAttachment,
                    ) {
                        Icon(
                            imageVector = Icons.Filled.Mic,
                            contentDescription = stringResource(R.string.message_record_voice_cd),
                            tint = ZrpRed,
                        )
                    }
                }
            }
        }
    }

    val editMessageId = state.editingMessageId
    val editMessageContent = state.messages.find { it.id == editMessageId }?.content
    if (editMessageId != null && editMessageContent != null) {
        // "Edit message" stays English-only on purpose - ChatInterface.tsx has no
        // equivalent dialog title at all, since web edits a message inline (an
        // in-place textarea replacing the bubble) rather than through a modal.
        EditPostDialog(
            initialContent = editMessageContent,
            isSubmitting = state.isSavingEdit,
            error = state.editError,
            title = stringResource(R.string.message_edit_dialog_title),
            onDismiss = { viewModel.cancelEdit() },
            onSubmit = { content -> viewModel.saveEdit(editMessageId, content) { } },
        )
    }

    val deleteMessageId = deletingMessageId
    if (deleteMessageId != null) {
        AlertDialog(
            onDismissRequest = { if (!isDeletingMessage) deletingMessageId = null },
            title = { Text(stringResource(R.string.chat_delete_message)) },
            text = { Text(stringResource(R.string.chat_delete_message_confirm)) },
            confirmButton = {
                if (isDeletingMessage) {
                    CircularProgressIndicator(modifier = Modifier.size(20.dp))
                } else {
                    TextButton(onClick = {
                        isDeletingMessage = true
                        viewModel.deleteMessage(deleteMessageId) { result ->
                            isDeletingMessage = false
                            deletingMessageId = null
                            result.onFailure { /* left visible; the row itself still shows the message on failure */ }
                        }
                    }) {
                        Text(stringResource(R.string.action_delete), color = MaterialTheme.colorScheme.error)
                    }
                }
            },
            dismissButton = {
                TextButton(onClick = { deletingMessageId = null }, enabled = !isDeletingMessage) {
                    Text(stringResource(R.string.action_cancel))
                }
            },
        )
    }

    val reactingMessageId = reactingToMessageId
    if (reactingMessageId != null) {
        AddReactionDialog(
            onDismiss = { reactingToMessageId = null },
            onSubmit = { emoji ->
                viewModel.toggleReaction(reactingMessageId, emoji)
                reactingToMessageId = null
            },
        )
    }
}

/**
 * Maps ConversationViewModel's ChatAttachmentError (which cannot
 * resolve Android string resources itself) to a real translated
 * string, mirroring CreateStoryScreen's own storyMediaErrorMessage()
 * and CallScreen's own callErrorMessage(). The {size} placeholder
 * matches how ChatInterface.tsx's own t("chat.errFileTooLarge", {size})
 * interpolates - reused verbatim for video/document too, per
 * ChatAttachmentError's own KDoc on why that's a real web quirk, not a
 * native shortcut.
 */
@Composable
private fun chatAttachmentErrorMessage(error: ChatAttachmentError): String = when (error) {
    is ChatAttachmentError.FileTooLarge ->
        stringResource(R.string.chat_err_file_too_large).replace("{size}", error.maxMb.toString())
    is ChatAttachmentError.InvalidType -> stringResource(R.string.chat_err_invalid_file_type)
    is ChatAttachmentError.UploadFailed ->
        stringResource(R.string.chat_err_image_upload_failed) + " " + error.detail
}

// Matches ChatInterface.tsx's own `<video controls preload="metadata">` -
// a real seek bar/play-pause control (PlayerView's own default overlay,
// via useController = true), not the autoplay-muted-loop preview
// PostCard.tsx's own inline feed video gets (see PostCard.kt's
// PostVideoPlayer). Fixed max width rather than tracking the real
// video's own aspect ratio the way PostVideoPlayer does - a reasonable
// first-cut simplification for a chat bubble's much smaller footprint,
// not yet tested against odd aspect ratios on a real device.
@OptIn(UnstableApi::class)
@Composable
private fun ChatVideoPlayer(url: String, modifier: Modifier = Modifier) {
    val context = LocalContext.current
    val exoPlayer = remember(url) {
        ExoPlayer.Builder(context).build().apply {
            setMediaItem(MediaItem.fromUri(url))
            prepare()
        }
    }
    DisposableEffect(exoPlayer) {
        onDispose { exoPlayer.release() }
    }

    Box(
        modifier = modifier
            .fillMaxWidth()
            .aspectRatio(16f / 9f)
            .background(Color.Black)
            .clip(RoundedCornerShape(12.dp)),
    ) {
        AndroidView(
            modifier = Modifier.fillMaxSize(),
            factory = {
                PlayerView(context).apply {
                    player = exoPlayer
                    useController = true
                    resizeMode = AspectRatioFrameLayout.RESIZE_MODE_FIT
                }
            },
        )
    }
}

// Matches ChatInterface.tsx's own VOICE MESSAGE block (a slim
// <audio controls preload="metadata">) - a play/pause toggle rather
// than a full scrubber/seek bar, a reasonable first-cut simplification
// for this same reason PostVideoPlayer/ChatVideoPlayer already
// document. The raw "🎤 Voice message (m:ss)" content text renders
// separately just above this (MessageBubble's own content Text, always
// shown for non-blank content) - matching a real web quirk confirmed by
// reading its own displayContent logic, which only ever strips the
// unrelated "📷 Image" marker, never 🎬/🎤/📎 - so no duration label is
// duplicated here.
@Composable
private fun ChatAudioPlayer(url: String, isOwnMessage: Boolean) {
    val context = LocalContext.current
    var isPlaying by remember(url) { mutableStateOf(false) }
    val exoPlayer = remember(url) {
        ExoPlayer.Builder(context).build().apply {
            setMediaItem(MediaItem.fromUri(url))
            prepare()
        }
    }
    DisposableEffect(exoPlayer) {
        val listener = object : Player.Listener {
            override fun onIsPlayingChanged(playing: Boolean) {
                isPlaying = playing
            }

            override fun onPlaybackStateChanged(playbackState: Int) {
                if (playbackState == Player.STATE_ENDED) {
                    exoPlayer.seekTo(0)
                    exoPlayer.pause()
                }
            }
        }
        exoPlayer.addListener(listener)
        onDispose {
            exoPlayer.removeListener(listener)
            exoPlayer.release()
        }
    }

    Row(
        modifier = Modifier
            .clip(RoundedCornerShape(20.dp))
            .background(
                if (isOwnMessage) Color.White.copy(alpha = 0.15f) else MaterialTheme.colorScheme.surfaceContainerHighest,
            ),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        IconButton(onClick = { if (isPlaying) exoPlayer.pause() else exoPlayer.play() }) {
            Icon(
                imageVector = if (isPlaying) Icons.Filled.Pause else Icons.Filled.PlayArrow,
                contentDescription = null,
                tint = if (isOwnMessage) Color.White else MaterialTheme.colorScheme.onSurface,
            )
        }
    }
}

private fun formatRecordingTime(totalSeconds: Int): String {
    val minutes = totalSeconds / 60
    val seconds = totalSeconds % 60
    return "$minutes:${seconds.toString().padStart(2, '0')}"
}

// Matches ChatInterface.tsx's own FILE FALLBACK row (FileText icon +
// filename + Download icon, opened in a new tab) - here, an ACTION_VIEW
// Intent lets whichever app the device already has (a PDF viewer,
// Office app, etc.) handle the real file.
@Composable
private fun ChatFileRow(url: String, fileName: String, isOwnMessage: Boolean) {
    val context = LocalContext.current
    val displayName = fileName.ifBlank { stringResource(R.string.chat_attachment_fallback) }

    Row(
        modifier = Modifier
            .clip(RoundedCornerShape(12.dp))
            .background(
                if (isOwnMessage) Color.White.copy(alpha = 0.15f) else MaterialTheme.colorScheme.surfaceContainerHighest,
            )
            .clickable { context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url))) }
            .padding(horizontal = Spacing.md, vertical = Spacing.sm)
            .widthIn(max = 220.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(
            imageVector = Icons.Filled.Description,
            contentDescription = null,
            tint = if (isOwnMessage) Color.White else MaterialTheme.colorScheme.onSurface,
            modifier = Modifier.size(22.dp),
        )
        Text(
            text = displayName,
            style = MaterialTheme.typography.bodyMedium,
            color = if (isOwnMessage) Color.White else MaterialTheme.colorScheme.onSurface,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
            modifier = Modifier
                .weight(1f, fill = false)
                .padding(horizontal = Spacing.sm),
        )
        Icon(
            imageVector = Icons.Filled.Download,
            contentDescription = null,
            tint = if (isOwnMessage) Color.White else MaterialTheme.colorScheme.onSurface,
            modifier = Modifier.size(16.dp),
        )
    }
}

private fun queryFileNameAndSize(contentResolver: android.content.ContentResolver, uri: android.net.Uri): Pair<String, Long> {
    var name = "upload"
    var size = 0L
    contentResolver.query(uri, null, null, null, null)?.use { cursor ->
        val nameIndex = cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME)
        val sizeIndex = cursor.getColumnIndex(OpenableColumns.SIZE)
        if (cursor.moveToFirst()) {
            if (nameIndex >= 0) name = cursor.getString(nameIndex) ?: name
            if (sizeIndex >= 0) size = cursor.getLong(sizeIndex)
        }
    }
    return name to size
}

// The corner nearest the sender's own side of the screen stays sharp -
// the same "tail" convention every reference chat app uses so a glance
// tells you which side sent a bubble even before reading its color.
private val OwnMessageShape = RoundedCornerShape(topStart = 18.dp, topEnd = 18.dp, bottomStart = 18.dp, bottomEnd = 4.dp)
private val OtherMessageShape = RoundedCornerShape(topStart = 18.dp, topEnd = 18.dp, bottomStart = 4.dp, bottomEnd = 18.dp)

@OptIn(ExperimentalFoundationApi::class)
@Composable
private fun MessageBubble(
    message: ChatMessage,
    isOwnMessage: Boolean,
    ownReaction: String?,
    onReplyClick: () -> Unit,
    onEditClick: () -> Unit,
    onDeleteClick: () -> Unit,
    onReactClick: (String) -> Unit,
    onAddReactionClick: () -> Unit,
    onReplyPreviewClick: (String) -> Unit,
) {
    var menuOpen by remember { mutableStateOf(false) }

    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = 3.dp),
        horizontalArrangement = if (isOwnMessage) Arrangement.End else Arrangement.Start,
    ) {
        Box {
            Surface(
                shape = if (isOwnMessage) OwnMessageShape else OtherMessageShape,
                color = if (isOwnMessage) ZrpRed else MaterialTheme.colorScheme.surfaceContainerHigh,
                modifier = Modifier
                    .widthIn(max = 280.dp)
                    .combinedClickable(onClick = {}, onLongClick = { menuOpen = true }),
            ) {
                Column(modifier = Modifier.padding(horizontal = Spacing.md, vertical = Spacing.sm)) {
                    val replyTo = message.replyTo
                    if (replyTo != null) {
                        Column(
                            modifier = Modifier
                                .fillMaxWidth()
                                .clickable { onReplyPreviewClick(replyTo.id) }
                                .padding(bottom = 6.dp, top = 2.dp)
                                .padding(start = 6.dp),
                        ) {
                            Text(
                                // "📷 Image" stays English-only on purpose - matches
                                // ChatInterface.tsx's own hardcoded, untranslated
                                // reply-reference fallback.
                                text = replyTo.content.ifBlank { if (replyTo.imageUrl != null) "📷 Image" else "" },
                                style = MaterialTheme.typography.labelSmall,
                                color = if (isOwnMessage) Color.White.copy(alpha = 0.8f) else MaterialTheme.colorScheme.onSurfaceVariant,
                                maxLines = 1,
                            )
                        }
                    }

                    if (message.content.isNotBlank()) {
                        Text(
                            text = message.content,
                            color = if (isOwnMessage) Color.White else MaterialTheme.colorScheme.onSurface,
                        )
                    }

                    val attachmentUrl = message.imageUrl
                    if (attachmentUrl != null) {
                        // Matches ChatInterface.tsx's own three-way branch on
                        // the same content-prefix convention its composer
                        // writes on send (🎬 video / 📎 file / else image) -
                        // see ConversationViewModel's own onVideoPicked/
                        // onDocumentPicked KDocs for why there's no separate
                        // `type` field to switch on instead. Web additionally
                        // falls back to this same file-row UI for a plain
                        // image whose <img> itself fails to load (a broken
                        // URL) - that specific edge case isn't reproduced
                        // here, since Coil's own broken-image state already
                        // renders a blank tile rather than crashing, and
                        // every attachment this app itself sends is always
                        // correctly prefixed to begin with.
                        when {
                            message.content.startsWith("🎬") -> ChatVideoPlayer(
                                url = attachmentUrl,
                                modifier = Modifier.widthIn(max = 220.dp),
                            )
                            message.content.startsWith("🎤") -> ChatAudioPlayer(
                                url = attachmentUrl,
                                isOwnMessage = isOwnMessage,
                            )
                            message.content.startsWith("📎") -> ChatFileRow(
                                url = attachmentUrl,
                                fileName = message.content.removePrefix("📎").trim(),
                                isOwnMessage = isOwnMessage,
                            )
                            else -> AsyncImage(
                                model = attachmentUrl,
                                contentDescription = null,
                                contentScale = ContentScale.Crop,
                                modifier = Modifier
                                    .size(160.dp)
                                    .clip(RoundedCornerShape(8.dp)),
                            )
                        }
                    }

                    if (message.reactions.isNotEmpty()) {
                        Row(modifier = Modifier.padding(top = 4.dp)) {
                            message.reactions.groupBy { it.emoji }.forEach { (emoji, users) ->
                                val isOwn = emoji == ownReaction
                                Surface(
                                    shape = MaterialTheme.shapes.extraLarge,
                                    color = if (isOwn) ZrpRed.copy(alpha = 0.15f) else MaterialTheme.colorScheme.background,
                                    modifier = Modifier
                                        .padding(end = 4.dp)
                                        .clickable { onReactClick(emoji) },
                                ) {
                                    Row(
                                        verticalAlignment = Alignment.CenterVertically,
                                        modifier = Modifier.padding(horizontal = 6.dp, vertical = 2.dp),
                                    ) {
                                        Text(text = emoji, style = MaterialTheme.typography.labelMedium)
                                        if (users.size > 1) {
                                            Text(
                                                text = users.size.toString(),
                                                style = MaterialTheme.typography.labelSmall,
                                                modifier = Modifier.padding(start = 2.dp),
                                            )
                                        }
                                    }
                                }
                            }
                        }
                    }

                    Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.padding(top = 4.dp)) {
                        Text(
                            text = formatRelativeTime(message.createdAt),
                            style = MaterialTheme.typography.labelSmall,
                            color = if (isOwnMessage) {
                                Color.White.copy(alpha = 0.7f)
                            } else {
                                MaterialTheme.colorScheme.onSurfaceVariant
                            },
                        )
                        if (message.edited) {
                            Text(
                                text = " · edited",
                                style = MaterialTheme.typography.labelSmall,
                                color = if (isOwnMessage) {
                                    Color.White.copy(alpha = 0.7f)
                                } else {
                                    MaterialTheme.colorScheme.onSurfaceVariant
                                },
                            )
                        }
                        if (isOwnMessage && message.read) {
                            Text(
                                text = " ✓✓",
                                style = MaterialTheme.typography.labelSmall,
                                color = Color.White,
                            )
                        }
                    }
                }
            }

            DropdownMenu(expanded = menuOpen, onDismissRequest = { menuOpen = false }) {
                DropdownMenuItem(
                    text = { Text(stringResource(R.string.action_reply)) },
                    onClick = { menuOpen = false; onReplyClick() },
                )
                DropdownMenuItem(
                    text = { Text(stringResource(R.string.reaction_react_action)) },
                    onClick = { menuOpen = false; onAddReactionClick() },
                )
                if (isOwnMessage) {
                    DropdownMenuItem(
                        text = { Text(stringResource(R.string.action_edit)) },
                        onClick = { menuOpen = false; onEditClick() },
                    )
                }
                DropdownMenuItem(
                    text = { Text(stringResource(R.string.action_delete)) },
                    onClick = { menuOpen = false; onDeleteClick() },
                )
            }
        }
    }
}
