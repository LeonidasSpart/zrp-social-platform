package one.zrp.social.mobile.ui.settings

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.Balance
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
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
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import one.zrp.social.mobile.R
import one.zrp.social.mobile.data.AppealsRepository
import one.zrp.social.mobile.network.Appeal
import one.zrp.social.mobile.network.EligibleReport
import one.zrp.social.mobile.ui.theme.Spacing
import one.zrp.social.mobile.ui.theme.ZrpGreen
import one.zrp.social.mobile.ui.theme.ZrpRed
import one.zrp.social.mobile.util.formatRelativeTime

// Real Prisma enum values (report.status/appeal.status), the same
// action-type strings admin/reports.tsx already writes - reused
// verbatim, not re-parsed into a native-only enum.
private fun actionLabel(actionType: String?): String =
    actionType?.replace('_', ' ')?.replaceFirstChar { it.uppercase() } ?: ""

/**
 * The real Moderation Appeals screen (matches
 * src/app/settings/appeals/page.tsx exactly) - a user whose post,
 * comment, or account a moderator actioned can appeal it here and see
 * staff's resolution. Reached from Settings, and from an
 * "appeal_resolved" notification once its resolution lands (see
 * NotificationsScreen's own routing).
 */
@Composable
fun AppealsScreen(onBack: () -> Unit) {
    val viewModel: AppealsViewModel = viewModel(
        factory = remember { AppealsViewModelFactory(AppealsRepository()) },
    )
    val state by viewModel.state.collectAsState()

    Column(modifier = Modifier.fillMaxSize()) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 8.dp, vertical = 4.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            IconButton(onClick = onBack) {
                Icon(Icons.Filled.ArrowBack, contentDescription = stringResource(R.string.nav_back))
            }
            Text(
                text = stringResource(R.string.appeals_title),
                style = MaterialTheme.typography.titleMedium,
                modifier = Modifier.padding(start = 4.dp),
            )
        }
        HorizontalDivider()

        if (state.isLoading) {
            Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                CircularProgressIndicator()
            }
        } else {
            Column(
                modifier = Modifier
                    .fillMaxSize()
                    .verticalScroll(rememberScrollState())
                    .padding(Spacing.lg),
            ) {
                if (state.error != null) {
                    Text(
                        text = state.error ?: "",
                        color = MaterialTheme.colorScheme.error,
                        style = MaterialTheme.typography.bodySmall,
                        modifier = Modifier.padding(bottom = Spacing.md),
                    )
                }

                Text(
                    text = stringResource(R.string.appeals_explanation),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.padding(bottom = Spacing.lg),
                )

                Text(text = stringResource(R.string.appeals_eligible_heading), style = MaterialTheme.typography.titleSmall)
                if (state.eligibleReports.isEmpty()) {
                    Text(
                        text = stringResource(R.string.appeals_no_eligible),
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.padding(top = Spacing.xs, bottom = Spacing.lg),
                    )
                } else {
                    Column(modifier = Modifier.padding(top = Spacing.sm)) {
                        state.eligibleReports.forEach { report ->
                            EligibleReportCard(
                                report = report,
                                isOpen = state.openReportId == report.id,
                                draftMessage = state.draftMessage,
                                isSubmitting = state.isSubmitting,
                                submitError = state.submitError,
                                onFileAppealClick = { viewModel.openAppealForm(report.id) },
                                onCancelClick = { viewModel.cancelAppealForm() },
                                onDraftMessageChange = { viewModel.onDraftMessageChange(it) },
                                onSubmitClick = { viewModel.submitAppeal() },
                            )
                            Spacer(modifier = Modifier.height(Spacing.sm))
                        }
                    }
                }

                HorizontalDivider(modifier = Modifier.padding(vertical = Spacing.lg))

                Text(text = stringResource(R.string.appeals_filed_heading), style = MaterialTheme.typography.titleSmall)
                if (state.appeals.isEmpty()) {
                    Text(
                        text = stringResource(R.string.appeals_no_filed),
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.padding(top = Spacing.xs),
                    )
                } else {
                    Column(modifier = Modifier.padding(top = Spacing.sm)) {
                        state.appeals.forEach { appeal ->
                            FiledAppealCard(appeal)
                            Spacer(modifier = Modifier.height(Spacing.sm))
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun EligibleReportCard(
    report: EligibleReport,
    isOpen: Boolean,
    draftMessage: String,
    isSubmitting: Boolean,
    submitError: String?,
    onFileAppealClick: () -> Unit,
    onCancelClick: () -> Unit,
    onDraftMessageChange: (String) -> Unit,
    onSubmitClick: () -> Unit,
) {
    Surface(
        shape = RoundedCornerShape(12.dp),
        color = MaterialTheme.colorScheme.surfaceContainerLow,
        modifier = Modifier.fillMaxWidth(),
    ) {
        Column(modifier = Modifier.padding(Spacing.md)) {
            ActionChip(actionLabel(report.actionType).ifBlank { stringResource(R.string.appeals_action_other) })
            Text(
                text = report.reason,
                style = MaterialTheme.typography.bodyMedium,
                modifier = Modifier.padding(top = Spacing.xs),
            )
            if (report.actionNote != null) {
                Text(
                    text = report.actionNote,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.padding(top = Spacing.xs),
                )
            }
            if (report.actionedAt != null) {
                Text(
                    text = formatRelativeTime(report.actionedAt),
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.padding(top = Spacing.xs),
                )
            }

            if (isOpen) {
                Column(modifier = Modifier.padding(top = Spacing.md)) {
                    OutlinedTextField(
                        value = draftMessage,
                        onValueChange = { if (it.length <= 2000) onDraftMessageChange(it) },
                        placeholder = { Text(stringResource(R.string.appeals_message_placeholder)) },
                        enabled = !isSubmitting,
                        minLines = 4,
                        modifier = Modifier.fillMaxWidth(),
                    )
                    if (submitError != null) {
                        Text(
                            text = submitError,
                            color = MaterialTheme.colorScheme.error,
                            style = MaterialTheme.typography.bodySmall,
                            modifier = Modifier.padding(top = Spacing.xs),
                        )
                    }
                    Row(modifier = Modifier.padding(top = Spacing.sm), horizontalArrangement = Arrangement.spacedBy(Spacing.sm)) {
                        Button(
                            onClick = onSubmitClick,
                            enabled = !isSubmitting && draftMessage.isNotBlank(),
                            colors = ButtonDefaults.buttonColors(containerColor = ZrpRed),
                        ) {
                            if (isSubmitting) {
                                CircularProgressIndicator(modifier = Modifier.padding(2.dp), color = MaterialTheme.colorScheme.onPrimary)
                            } else {
                                Text(stringResource(R.string.appeals_submit))
                            }
                        }
                        TextButton(onClick = onCancelClick, enabled = !isSubmitting) {
                            Text(stringResource(R.string.action_cancel))
                        }
                    }
                }
            } else {
                TextButton(onClick = onFileAppealClick, modifier = Modifier.padding(top = Spacing.sm)) {
                    Icon(Icons.Filled.Balance, contentDescription = null, modifier = Modifier.padding(end = Spacing.xs))
                    Text(stringResource(R.string.appeals_file_appeal))
                }
            }
        }
    }
}

@Composable
private fun FiledAppealCard(appeal: Appeal) {
    Surface(
        shape = RoundedCornerShape(12.dp),
        color = MaterialTheme.colorScheme.surfaceContainerLow,
        modifier = Modifier.fillMaxWidth(),
    ) {
        Column(modifier = Modifier.padding(Spacing.md)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                StatusChip(appeal.status)
                ActionChip(
                    actionLabel(appeal.report.actionType).ifBlank { stringResource(R.string.appeals_action_other) },
                    modifier = Modifier.padding(start = Spacing.xs),
                )
            }
            Text(
                text = appeal.report.reason,
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.padding(top = Spacing.xs),
            )
            Text(
                text = appeal.message,
                style = MaterialTheme.typography.bodyMedium,
                modifier = Modifier.padding(top = Spacing.sm),
            )
            if (appeal.resolutionNote != null) {
                Text(
                    text = appeal.resolutionNote,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.padding(top = Spacing.sm),
                )
            }
            Text(
                text = formatRelativeTime(appeal.createdAt),
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.padding(top = Spacing.sm),
            )
        }
    }
}

@Composable
private fun ActionChip(label: String, modifier: Modifier = Modifier) {
    Surface(
        shape = RoundedCornerShape(4.dp),
        color = MaterialTheme.colorScheme.surfaceContainerHighest,
        modifier = modifier,
    ) {
        Text(
            text = label.uppercase(),
            style = MaterialTheme.typography.labelSmall,
            modifier = Modifier.padding(horizontal = Spacing.xs, vertical = 2.dp),
        )
    }
}

@Composable
private fun StatusChip(status: String) {
    val (color, labelRes) = when (status) {
        "overturned" -> ZrpGreen to R.string.appeals_status_overturned
        "upheld" -> MaterialTheme.colorScheme.onSurfaceVariant to R.string.appeals_status_upheld
        else -> Color(0xFFF59E0B) to R.string.appeals_status_pending
    }
    Surface(shape = RoundedCornerShape(50), color = color.copy(alpha = 0.15f)) {
        Text(
            text = stringResource(labelRes).uppercase(),
            style = MaterialTheme.typography.labelSmall,
            color = color,
            modifier = Modifier.padding(horizontal = Spacing.sm, vertical = 2.dp),
        )
    }
}
