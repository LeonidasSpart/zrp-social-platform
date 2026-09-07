package one.zrp.social.mobile.ui.admin

import android.widget.Toast
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.RadioButton
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
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import one.zrp.social.mobile.R
import one.zrp.social.mobile.data.AdminRepository
import one.zrp.social.mobile.network.AdminReport
import one.zrp.social.mobile.ui.theme.Spacing
import one.zrp.social.mobile.ui.theme.ZrpRed

private val STATUS_FILTERS = listOf("pending", "reviewed", "dismissed", "actioned", "all")

@Composable
fun AdminReportsScreen(onBack: () -> Unit) {
    val viewModel: AdminReportsViewModel = viewModel(
        factory = remember { AdminReportsViewModelFactory(AdminRepository()) },
    )
    val state by viewModel.state.collectAsState()
    val context = LocalContext.current

    LaunchedEffect(Unit) { viewModel.load() }

    LaunchedEffect(state.error) {
        val message = state.error
        if (message != null) {
            Toast.makeText(context, message, Toast.LENGTH_SHORT).show()
            viewModel.consumeError()
        }
    }

    Column(modifier = Modifier.fillMaxSize()) {
        Row(
            modifier = Modifier.fillMaxWidth().padding(horizontal = 8.dp, vertical = 4.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            IconButton(onClick = onBack) {
                Icon(Icons.Filled.ArrowBack, contentDescription = stringResource(R.string.nav_back))
            }
            Text(
                text = stringResource(R.string.admin_reports_title),
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.Bold,
                modifier = Modifier.padding(start = 4.dp),
            )
        }

        Row(
            modifier = Modifier
                .fillMaxWidth()
                .horizontalScroll(rememberScrollState())
                .padding(horizontal = Spacing.lg, vertical = Spacing.sm),
            horizontalArrangement = Arrangement.spacedBy(Spacing.sm),
        ) {
            STATUS_FILTERS.forEach { status ->
                FilterChip(
                    selected = state.statusFilter == status,
                    onClick = { viewModel.setStatusFilter(status) },
                    label = { Text(statusFilterLabel(status)) },
                )
            }
        }

        if (state.isLoading) {
            Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                CircularProgressIndicator()
            }
        } else if (state.reports.isEmpty()) {
            Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                Text(
                    text = stringResource(R.string.admin_reports_no_reports),
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        } else {
            LazyColumn(
                modifier = Modifier.weight(1f),
                contentPadding = PaddingValues(Spacing.lg),
                verticalArrangement = Arrangement.spacedBy(Spacing.md),
            ) {
                items(state.reports, key = { it.id }) { report ->
                    ReportRow(
                        report = report,
                        isUpdating = state.updatingId == report.id,
                        onReview = { viewModel.markReviewed(report.id) },
                        onDismiss = { viewModel.dismiss(report.id) },
                        onTakeAction = { viewModel.openActionModal(report.id) },
                    )
                }
            }

            if (state.totalPages > 1) {
                Row(
                    modifier = Modifier.fillMaxWidth().padding(Spacing.md),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    TextButton(onClick = { viewModel.setPage(state.page - 1) }, enabled = state.page > 1) {
                        Text(stringResource(R.string.admin_reports_previous))
                    }
                    Text(
                        text = stringResource(R.string.admin_reports_page_of, state.page, state.totalPages),
                        style = MaterialTheme.typography.labelMedium,
                    )
                    TextButton(onClick = { viewModel.setPage(state.page + 1) }, enabled = state.page < state.totalPages) {
                        Text(stringResource(R.string.admin_reports_next))
                    }
                }
            }
        }
    }

    val actionReportId = state.actionModalReportId
    if (actionReportId != null) {
        ActionModal(
            onDismiss = { viewModel.closeActionModal() },
            onConfirm = { actionType, note -> viewModel.submitAction(actionType, note) },
        )
    }
}

@Composable
private fun statusFilterLabel(status: String): String = when (status) {
    "pending" -> stringResource(R.string.admin_reports_status_pending)
    "reviewed" -> stringResource(R.string.admin_reports_status_reviewed)
    "dismissed" -> stringResource(R.string.admin_reports_status_dismissed)
    "actioned" -> stringResource(R.string.admin_reports_status_actioned)
    else -> stringResource(R.string.admin_reports_all)
}

@Composable
private fun ReportRow(
    report: AdminReport,
    isUpdating: Boolean,
    onReview: () -> Unit,
    onDismiss: () -> Unit,
    onTakeAction: () -> Unit,
) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(16.dp))
            .background(MaterialTheme.colorScheme.surfaceContainerLow)
            .padding(Spacing.md),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text(text = report.reason, fontWeight = FontWeight.Bold, modifier = Modifier.weight(1f))
            Text(
                text = statusFilterLabel(report.status),
                style = MaterialTheme.typography.labelSmall,
                fontWeight = FontWeight.Bold,
                color = ZrpRed,
                modifier = Modifier
                    .clip(RoundedCornerShape(50))
                    .background(ZrpRed.copy(alpha = 0.12f))
                    .padding(horizontal = 8.dp, vertical = 2.dp),
            )
        }

        Text(
            text = stringResource(R.string.admin_reports_reported_by, report.reporter.username),
            style = MaterialTheme.typography.labelSmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.padding(top = 4.dp),
        )

        if (!report.details.isNullOrBlank()) {
            Text(
                text = report.details,
                style = MaterialTheme.typography.bodySmall,
                modifier = Modifier.padding(top = 4.dp),
            )
        }

        ReportTargetSummary(report)

        if (!report.actionNote.isNullOrBlank() || report.actionType != null) {
            val noteText = "${report.actionType ?: ""} ${report.actionNote ?: ""}".trim()
            Text(
                text = stringResource(R.string.admin_reports_note, noteText),
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.padding(top = 4.dp),
            )
        }

        if (isUpdating) {
            CircularProgressIndicator(modifier = Modifier.padding(top = Spacing.sm).size(20.dp), strokeWidth = 2.dp)
        } else if (report.status == "pending" || report.status == "reviewed") {
            Row(modifier = Modifier.padding(top = Spacing.sm), horizontalArrangement = Arrangement.spacedBy(Spacing.sm)) {
                if (report.status == "pending") {
                    TextButton(onClick = onReview) { Text(stringResource(R.string.admin_reports_review)) }
                }
                TextButton(onClick = onDismiss) { Text(stringResource(R.string.admin_reports_dismiss)) }
                TextButton(onClick = onTakeAction) {
                    Text(stringResource(R.string.admin_reports_action), color = ZrpRed)
                }
            }
        }
    }
}

@Composable
private fun ReportTargetSummary(report: AdminReport) {
    val label = when {
        report.post != null -> "${stringResource(R.string.admin_reports_view_post)}: \"${report.post.content.take(80)}\" - @${report.post.author.username}"
        report.comment != null -> "${stringResource(R.string.admin_reports_view_comment)}: \"${report.comment.content.take(80)}\" - @${report.comment.author.username}"
        report.listing != null -> "${report.listing.title} - @${report.listing.seller.username}"
        report.challenge != null -> "${stringResource(R.string.admin_reports_view_challenge)}: ${report.challenge.title}"
        report.opportunity != null -> "${report.opportunity.title} - @${report.opportunity.poster.username}"
        report.campaign != null -> "${report.campaign.title} - @${report.campaign.organizer.username}"
        else -> null
    }
    if (label != null) {
        Text(
            text = label,
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            maxLines = 2,
            overflow = TextOverflow.Ellipsis,
            modifier = Modifier.padding(top = 4.dp),
        )
    }
}

private val ACTION_TYPES = listOf("DELETE_POST", "WARN_USER", "BAN_USER", "MUTE_USER", "DELETE_COMMENT", "OTHER")

@Composable
private fun actionTypeLabel(type: String): String = when (type) {
    "DELETE_POST" -> stringResource(R.string.admin_reports_action_delete_post)
    "WARN_USER" -> stringResource(R.string.admin_reports_action_warn_user)
    "BAN_USER" -> stringResource(R.string.admin_reports_action_ban_user)
    "MUTE_USER" -> stringResource(R.string.admin_reports_action_mute_user)
    "DELETE_COMMENT" -> stringResource(R.string.admin_reports_action_delete_comment)
    else -> stringResource(R.string.admin_reports_action_other)
}

@Composable
private fun ActionModal(onDismiss: () -> Unit, onConfirm: (actionType: String, note: String) -> Unit) {
    var selectedType by remember { mutableStateOf(ACTION_TYPES.first()) }
    var note by remember { mutableStateOf("") }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(stringResource(R.string.admin_reports_choose_action)) },
        text = {
            Column {
                ACTION_TYPES.forEach { type ->
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .selectable(selected = selectedType == type, onClick = { selectedType = type }),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        RadioButton(selected = selectedType == type, onClick = { selectedType = type })
                        Text(actionTypeLabel(type))
                    }
                }
                OutlinedTextField(
                    value = note,
                    onValueChange = { note = it },
                    label = { Text(stringResource(R.string.admin_reports_note_optional)) },
                    placeholder = { Text(stringResource(R.string.admin_reports_note_placeholder)) },
                    modifier = Modifier.fillMaxWidth().padding(top = Spacing.sm),
                )
            }
        },
        confirmButton = {
            TextButton(onClick = { onConfirm(selectedType, note) }) {
                Text(stringResource(R.string.admin_reports_confirm_action), color = ZrpRed)
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) { Text(stringResource(R.string.admin_reports_cancel)) }
        },
    )
}
