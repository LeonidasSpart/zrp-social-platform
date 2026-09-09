package one.zrp.social.mobile.ui.messages

import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.CameraAlt
import androidx.compose.material.icons.filled.Groups
import androidx.compose.material.icons.filled.Logout
import androidx.compose.material.icons.filled.RemoveCircleOutline
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import kotlinx.coroutines.launch
import one.zrp.social.mobile.R
import one.zrp.social.mobile.data.MediaUploadRepository
import one.zrp.social.mobile.data.MessagesRepository
import one.zrp.social.mobile.network.ConversationParticipantDto
import one.zrp.social.mobile.ui.components.Avatar
import one.zrp.social.mobile.ui.components.ZrpEmptyState
import one.zrp.social.mobile.ui.theme.Spacing
import one.zrp.social.mobile.ui.theme.ZrpRed
import one.zrp.social.mobile.util.queryFileNameAndSize

/**
 * "Group info": the real member list (role badges, presence-agnostic -
 * presence lives on the thread screen, not this management screen),
 * OWNER-only rename/avatar (server-enforced, this screen's own
 * [GroupParticipantsViewModel.isOwner] only hides the controls as UX),
 * adding real members via [UserMultiSelectField], removing a member
 * (self-leave always allowed with a confirmation dialog since it's
 * irreversible access loss; removing someone else needs OWNER).
 */
@Composable
fun GroupParticipantsScreen(
    conversationId: String,
    currentUserId: String,
    onBack: () -> Unit,
    onLeft: () -> Unit,
    onOpenProfile: (String) -> Unit,
) {
    val viewModel: GroupParticipantsViewModel = viewModel(
        factory = remember(conversationId) {
            GroupParticipantsViewModelFactory(MessagesRepository(), conversationId, currentUserId)
        },
    )
    val state by viewModel.state.collectAsState()
    val context = LocalContext.current
    val mediaUploadRepository = remember { MediaUploadRepository() }
    val coroutineScope = rememberCoroutineScope()
    var isUploadingAvatar by remember { mutableStateOf(false) }
    var leaveTargetUserId by remember { mutableStateOf<String?>(null) }

    val avatarPickerLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.PickVisualMedia(),
    ) { uri ->
        if (uri != null) {
            val contentResolver = context.contentResolver
            val (fileName, size) = queryFileNameAndSize(contentResolver, uri)
            val mimeType = contentResolver.getType(uri) ?: "image/jpeg"
            isUploadingAvatar = true
            coroutineScope.launch {
                mediaUploadRepository.upload(
                    slug = "avatar",
                    contentResolver = contentResolver,
                    uri = uri,
                    fileName = fileName,
                    mimeType = mimeType,
                    size = size,
                    onProgress = {},
                ).onSuccess { uploaded ->
                    viewModel.updateAvatar(uploaded.url)
                    isUploadingAvatar = false
                }.onFailure { isUploadingAvatar = false }
            }
        }
    }

    if (state.leftConversation) {
        onLeft()
        return
    }

    Column(modifier = Modifier.fillMaxSize()) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = Spacing.sm, vertical = Spacing.xs),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            IconButton(onClick = onBack) {
                Icon(Icons.Filled.ArrowBack, contentDescription = stringResource(R.string.chat_back_to_messages))
            }
            Text(
                text = stringResource(R.string.group_info_title),
                style = MaterialTheme.typography.titleMedium,
                modifier = Modifier.weight(1f).padding(start = Spacing.xs),
            )
        }
        HorizontalDivider()

        val conversation = state.conversation
        when {
            state.isLoading -> {
                Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) { CircularProgressIndicator() }
            }
            conversation == null -> {
                Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    ZrpEmptyState(icon = Icons.Filled.Groups, title = state.error ?: stringResource(R.string.group_load_error))
                }
            }
            else -> {
                val isOwner = viewModel.isOwner()
                Column(
                    modifier = Modifier
                        .fillMaxSize()
                        .verticalScroll(rememberScrollState())
                        .padding(Spacing.lg),
                ) {
                    Box(
                        modifier = Modifier.fillMaxWidth(),
                        contentAlignment = Alignment.Center,
                    ) {
                        Box {
                            Avatar(
                                url = conversation.avatarUrl,
                                name = conversation.name ?: stringResource(R.string.messages_unnamed_group),
                                size = 88.dp,
                            )
                            if (isOwner) {
                                IconButton(
                                    onClick = {
                                        avatarPickerLauncher.launch(
                                            PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly),
                                        )
                                    },
                                    modifier = Modifier
                                        .align(Alignment.BottomEnd)
                                        .size(32.dp)
                                        .clip(CircleShape)
                                        .background(MaterialTheme.colorScheme.surfaceContainerHighest),
                                ) {
                                    if (isUploadingAvatar) {
                                        CircularProgressIndicator(modifier = Modifier.size(16.dp), strokeWidth = 2.dp)
                                    } else {
                                        Icon(Icons.Filled.CameraAlt, contentDescription = stringResource(R.string.group_change_avatar_cd))
                                    }
                                }
                            }
                        }
                    }

                    Spacer(modifier = Modifier.padding(top = Spacing.md))

                    if (isOwner) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            OutlinedTextField(
                                value = state.editableName,
                                onValueChange = { viewModel.onNameChange(it) },
                                label = { Text(stringResource(R.string.group_name_label)) },
                                singleLine = true,
                                modifier = Modifier.weight(1f),
                            )
                            if (state.isSavingName) {
                                CircularProgressIndicator(
                                    modifier = Modifier.padding(start = Spacing.sm).size(20.dp),
                                    strokeWidth = 2.dp,
                                )
                            } else if (state.editableName.trim() != (conversation.name ?: "")) {
                                TextButton(onClick = { viewModel.saveName() }) {
                                    Text(stringResource(R.string.action_save), color = ZrpRed)
                                }
                            }
                        }
                        if (state.nameError != null) {
                            Text(
                                text = if (state.nameError == NAME_REQUIRED_ERROR) {
                                    stringResource(R.string.group_name_required)
                                } else {
                                    state.nameError ?: ""
                                },
                                color = MaterialTheme.colorScheme.error,
                                style = MaterialTheme.typography.bodySmall,
                            )
                        }
                    } else {
                        Text(
                            text = conversation.name ?: stringResource(R.string.messages_unnamed_group),
                            style = MaterialTheme.typography.titleLarge,
                            modifier = Modifier.fillMaxWidth(),
                        )
                    }

                    Text(
                        text = stringResource(R.string.messages_group_member_count, conversation.participants.size),
                        style = MaterialTheme.typography.labelLarge,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.padding(top = Spacing.lg, bottom = Spacing.xs),
                    )

                    conversation.participants.forEach { participant ->
                        ParticipantRow(
                            participant = participant,
                            isCurrentUser = participant.userId == currentUserId,
                            canRemove = isOwner && participant.userId != currentUserId,
                            isRemoving = state.removingUserId == participant.userId,
                            onClick = { onOpenProfile(participant.user.username) },
                            onRemove = { viewModel.removeParticipant(participant.userId) },
                        )
                    }
                    if (state.removeError != null) {
                        Text(
                            text = state.removeError ?: "",
                            color = MaterialTheme.colorScheme.error,
                            style = MaterialTheme.typography.bodySmall,
                        )
                    }

                    HorizontalDivider(modifier = Modifier.padding(vertical = Spacing.lg))

                    Text(
                        text = stringResource(R.string.group_add_members_title),
                        style = MaterialTheme.typography.labelLarge,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.padding(bottom = Spacing.sm),
                    )
                    UserMultiSelectField(
                        selectedUsers = state.selectedNewUsers,
                        onSelectedChange = { viewModel.onSelectedNewUsersChange(it) },
                        excludeUserIds = conversation.participants.map { it.userId }.toSet(),
                    )
                    if (state.addMembersError != null) {
                        Text(
                            text = state.addMembersError ?: "",
                            color = MaterialTheme.colorScheme.error,
                            style = MaterialTheme.typography.bodySmall,
                            modifier = Modifier.padding(top = Spacing.xs),
                        )
                    }
                    if (state.selectedNewUsers.isNotEmpty()) {
                        TextButton(
                            onClick = { viewModel.addSelectedMembers() },
                            enabled = !state.isAddingMembers,
                            modifier = Modifier.padding(top = Spacing.sm),
                        ) {
                            if (state.isAddingMembers) {
                                CircularProgressIndicator(modifier = Modifier.size(18.dp), strokeWidth = 2.dp)
                            } else {
                                Text(stringResource(R.string.group_add_members_action), color = ZrpRed)
                            }
                        }
                    }

                    HorizontalDivider(modifier = Modifier.padding(vertical = Spacing.lg))

                    TextButton(onClick = { leaveTargetUserId = currentUserId }) {
                        Icon(Icons.Filled.Logout, contentDescription = null, tint = MaterialTheme.colorScheme.error)
                        Text(
                            text = stringResource(R.string.group_leave_action),
                            color = MaterialTheme.colorScheme.error,
                            modifier = Modifier.padding(start = Spacing.xs),
                        )
                    }
                }
            }
        }
    }

    val target = leaveTargetUserId
    if (target != null) {
        AlertDialog(
            onDismissRequest = { leaveTargetUserId = null },
            title = { Text(stringResource(R.string.group_leave_confirm_title)) },
            text = { Text(stringResource(R.string.group_leave_confirm_body)) },
            confirmButton = {
                TextButton(onClick = {
                    leaveTargetUserId = null
                    viewModel.removeParticipant(target)
                }) {
                    Text(stringResource(R.string.group_leave_action), color = MaterialTheme.colorScheme.error)
                }
            },
            dismissButton = {
                TextButton(onClick = { leaveTargetUserId = null }) { Text(stringResource(R.string.action_cancel)) }
            },
        )
    }
}

@Composable
private fun ParticipantRow(
    participant: ConversationParticipantDto,
    isCurrentUser: Boolean,
    canRemove: Boolean,
    isRemoving: Boolean,
    onClick: () -> Unit,
    onRemove: () -> Unit,
) {
    val user = participant.user
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onClick)
            .padding(vertical = Spacing.sm),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Avatar(url = user.avatarUrl, name = user.name ?: user.username, size = 40.dp)
        Column(modifier = Modifier.weight(1f).padding(start = Spacing.sm)) {
            Text(
                text = (user.name ?: user.username) + if (isCurrentUser) " " + stringResource(R.string.group_you_suffix) else "",
                style = MaterialTheme.typography.bodyMedium,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            Text(
                text = "@${user.username}",
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
        if (participant.role == "OWNER") {
            Surface(
                shape = MaterialTheme.shapes.extraSmall,
                color = MaterialTheme.colorScheme.tertiaryContainer,
                modifier = Modifier.padding(end = Spacing.xs),
            ) {
                Text(
                    text = stringResource(R.string.group_role_owner),
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onTertiaryContainer,
                    modifier = Modifier.padding(horizontal = Spacing.sm, vertical = 2.dp),
                )
            }
        }
        if (canRemove) {
            if (isRemoving) {
                CircularProgressIndicator(modifier = Modifier.size(18.dp), strokeWidth = 2.dp)
            } else {
                IconButton(onClick = onRemove) {
                    Icon(
                        imageVector = Icons.Filled.RemoveCircleOutline,
                        contentDescription = stringResource(R.string.group_remove_member_cd),
                        tint = MaterialTheme.colorScheme.error,
                    )
                }
            }
        }
    }
}
