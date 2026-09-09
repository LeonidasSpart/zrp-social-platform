package one.zrp.social.mobile.ui.admin

import android.widget.Toast
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.Checkbox
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
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
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import one.zrp.social.mobile.R
import one.zrp.social.mobile.data.AdminRepository
import one.zrp.social.mobile.network.AdminSupportTicketDetail
import one.zrp.social.mobile.network.AdminTicketReply
import one.zrp.social.mobile.ui.support.formatTicketDateTime
import one.zrp.social.mobile.ui.support.supportCategoryLabel
import one.zrp.social.mobile.ui.support.supportPriorityLabel
import one.zrp.social.mobile.ui.support.supportStatusColor
import one.zrp.social.mobile.ui.support.supportStatusLabel
import one.zrp.social.mobile.ui.theme.Spacing
import one.zrp.social.mobile.ui.theme.ZrpRed

// The exact enum values the PUT route validates against.
private val TICKET_STATUSES = listOf("OPEN", "IN_PROGRESS", "AWAITING_REPLY", "RESOLVED", "CLOSED")
private val TICKET_PRIORITIES = listOf("LOW", "NORMAL", "HIGH", "URGENT")

/**
 * Ported from src/app/admin/support/[id]/page.tsx - see
 * AdminSupportTicketDetailViewModel's own KDoc. Internal notes get the
 * same yellow treatment as the user-facing TicketDetailScreen so the
 * two views of one thread read the same way; the difference here is
 * that an admin can also write one.
 */
@Composable
fun AdminSupportTicketDetailScreen(ticketId: String, isAdmin: Boolean, onBack: () -> Unit) {
    if (!isAdmin) {
        Column(modifier = Modifier.fillMaxSize()) {
            DetailTopBar(title = stringResource(R.string.admin_support_title), onBack = onBack, onDelete = null)
            HorizontalDivider()
            Box(modifier = Modifier.fillMaxSize().padding(Spacing.xl), contentAlignment = Alignment.Center) {
                Text(
                    text = stringResource(R.string.admin_access_denied),
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
        return
    }

    val viewModel: AdminSupportTicketDetailViewModel = viewModel(
        factory = remember(ticketId) { AdminSupportTicketDetailViewModelFactory(ticketId, AdminRepository()) },
    )
    val state by viewModel.state.collectAsState()
    val context = LocalContext.current
    var showDeleteConfirm by remember { mutableStateOf(false) }
    var showUpdateConfirm by remember { mutableStateOf(false) }
    var showResolveDialog by remember { mutableStateOf(false) }

    LaunchedEffect(state.error) {
        val message = state.error
        if (message != null) {
            Toast.makeText(context, message, Toast.LENGTH_SHORT).show()
            viewModel.consumeError()
        }
    }

    LaunchedEffect(state.deleted) { if (state.deleted) onBack() }

    Column(modifier = Modifier.fillMaxSize()) {
        DetailTopBar(
            title = state.ticket?.subject ?: stringResource(R.string.admin_support_title),
            onBack = onBack,
            onDelete = if (state.ticket != null) ({ showDeleteConfirm = true }) else null,
        )
        HorizontalDivider()

        when {
            state.isLoading -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                CircularProgressIndicator()
            }
            state.notFound || state.ticket == null -> Box(
                Modifier.fillMaxSize().padding(Spacing.xl),
                contentAlignment = Alignment.Center,
            ) {
                Text(
                    text = stringResource(R.string.support_detail_not_found),
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            else -> AdminTicketBody(
                ticket = state.ticket!!,
                state = state,
                viewModel = viewModel,
                onRequestUpdate = { showUpdateConfirm = true },
                onRequestResolve = { showResolveDialog = true },
            )
        }
    }

    if (showDeleteConfirm) {
        AlertDialog(
            onDismissRequest = { showDeleteConfirm = false },
            title = { Text(stringResource(R.string.admin_ticket_delete)) },
            text = { Text(stringResource(R.string.admin_ticket_delete_confirm)) },
            confirmButton = {
                TextButton(onClick = { showDeleteConfirm = false; viewModel.delete() }) {
                    Text(stringResource(R.string.admin_ticket_delete), color = MaterialTheme.colorScheme.error)
                }
            },
            dismissButton = {
                TextButton(onClick = { showDeleteConfirm = false }) { Text(stringResource(android.R.string.cancel)) }
            },
        )
    }

    if (showUpdateConfirm) {
        AlertDialog(
            onDismissRequest = { showUpdateConfirm = false },
            title = { Text(stringResource(R.string.admin_ticket_update)) },
            text = { Text(stringResource(R.string.admin_ticket_update_confirm)) },
            confirmButton = {
                TextButton(onClick = { showUpdateConfirm = false; viewModel.submitUpdate() }) {
                    Text(stringResource(R.string.admin_ticket_update), color = ZrpRed)
                }
            },
            dismissButton = {
                TextButton(onClick = { showUpdateConfirm = false }) { Text(stringResource(android.R.string.cancel)) }
            },
        )
    }

    if (showResolveDialog) {
        ResolveDialog(
            onDismiss = { showResolveDialog = false },
            onConfirm = { resolution -> showResolveDialog = false; viewModel.resolve(resolution) },
        )
    }
}

@Composable
private fun DetailTopBar(title: String, onBack: () -> Unit, onDelete: (() -> Unit)?) {
    Row(
        modifier = Modifier.fillMaxWidth().padding(horizontal = 8.dp, vertical = 4.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        IconButton(onClick = onBack) {
            Icon(Icons.Filled.ArrowBack, contentDescription = stringResource(R.string.nav_back))
        }
        Text(
            text = title,
            style = MaterialTheme.typography.titleMedium,
            fontWeight = FontWeight.Bold,
            maxLines = 1,
            modifier = Modifier.weight(1f).padding(start = 4.dp),
        )
        if (onDelete != null) {
            IconButton(onClick = onDelete) {
                Icon(
                    Icons.Filled.Delete,
                    contentDescription = stringResource(R.string.admin_ticket_delete),
                    tint = MaterialTheme.colorScheme.error,
                    modifier = Modifier.size(20.dp),
                )
            }
        }
    }
}

@Composable
private fun AdminTicketBody(
    ticket: AdminSupportTicketDetail,
    state: AdminSupportTicketDetailUiState,
    viewModel: AdminSupportTicketDetailViewModel,
    onRequestUpdate: () -> Unit,
    onRequestResolve: () -> Unit,
) {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(Spacing.lg),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text(
                text = stringResource(R.string.support_detail_status_label),
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.padding(end = 6.dp),
            )
            Text(
                text = supportStatusLabel(ticket.status),
                style = MaterialTheme.typography.labelSmall,
                fontWeight = FontWeight.Bold,
                color = supportStatusColor(ticket.status),
                modifier = Modifier
                    .clip(RoundedCornerShape(50))
                    .background(supportStatusColor(ticket.status).copy(alpha = 0.12f))
                    .padding(horizontal = 8.dp, vertical = 2.dp),
            )
            Text(
                text = supportPriorityLabel(ticket.priority),
                style = MaterialTheme.typography.labelSmall,
                fontWeight = FontWeight.Bold,
                color = adminTicketPriorityColor(ticket.priority),
                modifier = Modifier.padding(start = Spacing.sm),
            )
        }

        Text(
            text = stringResource(R.string.admin_ticket_from, ticket.user.username),
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.padding(top = Spacing.sm),
        )
        val plan = ticket.user.plan
        if (!plan.isNullOrBlank()) {
            Text(
                text = stringResource(R.string.admin_ticket_plan, plan),
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.padding(top = 2.dp),
            )
        }
        Text(
            text = "${stringResource(R.string.support_detail_category_label)} ${supportCategoryLabel(ticket.category)}  ·  " +
                "${stringResource(R.string.support_detail_created_label)} ${formatTicketDateTime(ticket.createdAt)}",
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.padding(top = 2.dp),
        )
        val resolution = ticket.resolution
        if (!resolution.isNullOrBlank()) {
            Text(
                text = stringResource(R.string.admin_ticket_resolution_note, resolution),
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.padding(top = 2.dp),
            )
        }

        AdminControlsCard(
            state = state,
            viewModel = viewModel,
            onRequestUpdate = onRequestUpdate,
            onRequestResolve = onRequestResolve,
        )

        Surface(
            shape = RoundedCornerShape(12.dp),
            color = MaterialTheme.colorScheme.surfaceContainerLow,
            modifier = Modifier.fillMaxWidth().padding(top = Spacing.lg),
        ) {
            Column(modifier = Modifier.padding(Spacing.md)) {
                UserLine(username = ticket.user.username, dateTime = formatTicketDateTime(ticket.createdAt), isAdmin = false)
                Text(
                    text = ticket.message,
                    style = MaterialTheme.typography.bodyMedium,
                    modifier = Modifier.padding(top = Spacing.sm),
                )
            }
        }

        ticket.replies.forEach { reply -> ReplyCard(reply) }

        ReplyComposer(state = state, viewModel = viewModel)
    }
}

@Composable
private fun AdminControlsCard(
    state: AdminSupportTicketDetailUiState,
    viewModel: AdminSupportTicketDetailViewModel,
    onRequestUpdate: () -> Unit,
    onRequestResolve: () -> Unit,
) {
    Surface(
        shape = RoundedCornerShape(12.dp),
        color = MaterialTheme.colorScheme.surfaceContainerLow,
        modifier = Modifier.fillMaxWidth().padding(top = Spacing.lg),
    ) {
        Column(modifier = Modifier.padding(Spacing.md)) {
            Row(horizontalArrangement = Arrangement.spacedBy(Spacing.lg)) {
                FieldDropdown(
                    label = stringResource(R.string.admin_ticket_status_field),
                    value = state.status,
                    options = TICKET_STATUSES,
                    optionLabel = { supportStatusLabel(it) },
                    onSelect = viewModel::setStatus,
                )
                FieldDropdown(
                    label = stringResource(R.string.admin_ticket_priority_field),
                    value = state.priority,
                    options = TICKET_PRIORITIES,
                    optionLabel = { supportPriorityLabel(it) },
                    onSelect = viewModel::setPriority,
                )
            }

            OutlinedTextField(
                value = state.assignedTo,
                onValueChange = viewModel::onAssignedToChange,
                label = { Text(stringResource(R.string.admin_ticket_assign_to)) },
                placeholder = { Text(stringResource(R.string.admin_ticket_admin_id_placeholder)) },
                singleLine = true,
                enabled = !state.isUpdating,
                modifier = Modifier.fillMaxWidth().padding(top = Spacing.md),
            )
            Text(
                text = stringResource(R.string.admin_ticket_assign_hint),
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.padding(top = 2.dp),
            )

            Row(
                modifier = Modifier.fillMaxWidth().padding(top = Spacing.md),
                horizontalArrangement = Arrangement.spacedBy(Spacing.sm),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Button(
                    onClick = onRequestUpdate,
                    enabled = state.hasPendingChanges && !state.isUpdating,
                ) {
                    if (state.isUpdating) {
                        CircularProgressIndicator(modifier = Modifier.size(18.dp), strokeWidth = 2.dp)
                    } else {
                        Text(stringResource(R.string.admin_ticket_update))
                    }
                }
                OutlinedButton(onClick = onRequestResolve, enabled = !state.isResolving) {
                    if (state.isResolving) {
                        CircularProgressIndicator(modifier = Modifier.size(18.dp), strokeWidth = 2.dp)
                    } else {
                        Text(stringResource(R.string.admin_ticket_resolve))
                    }
                }
            }
        }
    }
}

@Composable
private fun FieldDropdown(
    label: String,
    value: String,
    options: List<String>,
    optionLabel: @Composable (String) -> String,
    onSelect: (String) -> Unit,
) {
    var menuOpen by remember { mutableStateOf(false) }

    Column {
        Text(
            text = label,
            style = MaterialTheme.typography.labelSmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Box {
            Text(
                text = if (value.isEmpty()) "-" else optionLabel(value),
                style = MaterialTheme.typography.labelMedium,
                fontWeight = FontWeight.Bold,
                color = ZrpRed,
                modifier = Modifier
                    .padding(top = 4.dp)
                    .clip(RoundedCornerShape(50))
                    .background(ZrpRed.copy(alpha = 0.12f))
                    .clickable { menuOpen = true }
                    .padding(horizontal = 10.dp, vertical = 4.dp),
            )
            DropdownMenu(expanded = menuOpen, onDismissRequest = { menuOpen = false }) {
                options.forEach { option ->
                    DropdownMenuItem(
                        text = { Text(optionLabel(option)) },
                        onClick = { menuOpen = false; onSelect(option) },
                    )
                }
            }
        }
    }
}

@Composable
private fun ReplyComposer(state: AdminSupportTicketDetailUiState, viewModel: AdminSupportTicketDetailViewModel) {
    Surface(
        shape = RoundedCornerShape(12.dp),
        color = MaterialTheme.colorScheme.surfaceContainerLow,
        modifier = Modifier.fillMaxWidth().padding(top = Spacing.lg),
    ) {
        Column(modifier = Modifier.padding(Spacing.md)) {
            OutlinedTextField(
                value = state.replyMessage,
                onValueChange = viewModel::onReplyMessageChange,
                placeholder = { Text(stringResource(R.string.support_detail_reply_placeholder)) },
                enabled = !state.isSending,
                minLines = 4,
                modifier = Modifier.fillMaxWidth(),
            )
            Row(
                modifier = Modifier.fillMaxWidth().padding(top = Spacing.sm),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Checkbox(
                    checked = state.isInternal,
                    onCheckedChange = viewModel::setInternal,
                    enabled = !state.isSending,
                )
                Text(
                    text = stringResource(R.string.admin_ticket_internal_note_checkbox),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.weight(1f),
                )
                Button(
                    onClick = { viewModel.sendReply() },
                    enabled = state.replyMessage.isNotBlank() && !state.isSending,
                ) {
                    if (state.isSending) {
                        CircularProgressIndicator(modifier = Modifier.size(18.dp), strokeWidth = 2.dp)
                        Text(stringResource(R.string.support_detail_sending), modifier = Modifier.padding(start = 6.dp))
                    } else {
                        Text(stringResource(R.string.support_detail_send_reply))
                    }
                }
            }
        }
    }
}

@Composable
private fun ResolveDialog(onDismiss: () -> Unit, onConfirm: (String) -> Unit) {
    var resolution by remember { mutableStateOf("") }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(stringResource(R.string.admin_ticket_resolve)) },
        text = {
            Column {
                OutlinedTextField(
                    value = resolution,
                    onValueChange = { resolution = it },
                    label = { Text(stringResource(R.string.admin_ticket_resolution_label)) },
                    minLines = 3,
                    modifier = Modifier.fillMaxWidth(),
                )
                Text(
                    text = stringResource(R.string.admin_ticket_resolution_hint),
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.padding(top = Spacing.sm),
                )
            }
        },
        confirmButton = {
            TextButton(onClick = { onConfirm(resolution) }) {
                Text(stringResource(R.string.admin_ticket_resolve), color = ZrpRed)
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) { Text(stringResource(android.R.string.cancel)) }
        },
    )
}

@Composable
private fun UserLine(username: String, dateTime: String, isAdmin: Boolean) {
    Row(verticalAlignment = Alignment.CenterVertically) {
        InitialAvatar(username)
        Text(text = username, fontWeight = FontWeight.Bold, modifier = Modifier.padding(start = Spacing.sm))
        if (isAdmin) {
            Text(
                text = stringResource(R.string.admin_ticket_admin_badge),
                style = MaterialTheme.typography.labelSmall,
                color = ZrpRed,
                modifier = Modifier.padding(start = 4.dp),
            )
        }
        Text(
            text = dateTime,
            style = MaterialTheme.typography.labelSmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.padding(start = Spacing.sm),
        )
    }
}

@Composable
private fun InitialAvatar(username: String) {
    Surface(shape = CircleShape, color = ZrpRed.copy(alpha = 0.2f)) {
        Box(modifier = Modifier.size(32.dp), contentAlignment = Alignment.Center) {
            Text(
                text = username.take(1).uppercase(),
                color = ZrpRed,
                fontWeight = FontWeight.Bold,
                style = MaterialTheme.typography.labelMedium,
            )
        }
    }
}

@Composable
private fun ReplyCard(reply: AdminTicketReply) {
    Surface(
        shape = RoundedCornerShape(12.dp),
        color = if (reply.isInternal) Color(0xFFFEF9C3) else MaterialTheme.colorScheme.surfaceContainerLow,
        modifier = Modifier.fillMaxWidth().padding(top = Spacing.md),
    ) {
        Column(modifier = Modifier.padding(Spacing.md)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                UserLine(
                    username = reply.user.username,
                    dateTime = formatTicketDateTime(reply.createdAt),
                    isAdmin = reply.user.role == "ADMIN",
                )
                if (reply.isInternal) {
                    Text(
                        text = stringResource(R.string.support_detail_internal_note),
                        style = MaterialTheme.typography.labelSmall,
                        modifier = Modifier
                            .padding(start = 4.dp)
                            .clip(RoundedCornerShape(4.dp))
                            .background(Color(0xFFFDE68A))
                            .padding(horizontal = 6.dp, vertical = 2.dp),
                    )
                }
            }
            Text(
                text = reply.message,
                style = MaterialTheme.typography.bodyMedium,
                modifier = Modifier.padding(top = Spacing.sm),
            )
        }
    }
}
