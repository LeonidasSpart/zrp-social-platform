package one.zrp.social.mobile.ui.admin

import android.widget.Toast
import androidx.compose.foundation.background
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
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
import one.zrp.social.mobile.network.AdminAdCampaign
import one.zrp.social.mobile.ui.theme.Spacing
import one.zrp.social.mobile.ui.theme.ZrpRed
import one.zrp.social.mobile.util.localizedError

// The real AdCampaignStatus values the website's own review page
// filters on, verbatim - "all" is the route's own escape hatch for no
// status filter at all. PAYMENT_PENDING/SUSPENDED joined the tab list
// alongside the on-chain payment step and staff suspend/resume/cancel
// actions added to lib/ads/lifecycle.ts.
private val STATUS_FILTERS = listOf("PENDING_REVIEW", "PAYMENT_PENDING", "ACTIVE", "SUSPENDED", "REJECTED", "all")

/** Ported from src/app/admin/ads/page.tsx - see AdminApi's own KDoc. */
@Composable
fun AdminAdsScreen(onBack: () -> Unit) {
    val viewModel: AdminAdsViewModel = viewModel(
        factory = remember { AdminAdsViewModelFactory(AdminRepository()) },
    )
    val state by viewModel.state.collectAsState()
    val context = LocalContext.current

    LaunchedEffect(Unit) { viewModel.load() }

    val localizedStateError = localizedError(state.error)
    LaunchedEffect(state.error) {
        val message = localizedStateError
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
                text = stringResource(R.string.admin_ads_title),
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
                    label = { Text(adStatusLabel(status)) },
                )
            }
        }

        if (state.isLoading) {
            Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                CircularProgressIndicator()
            }
        } else if (state.campaigns.isEmpty()) {
            Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                Text(
                    text = stringResource(R.string.admin_ads_no_campaigns),
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        } else {
            LazyColumn(
                modifier = Modifier.weight(1f),
                contentPadding = PaddingValues(Spacing.lg),
                verticalArrangement = Arrangement.spacedBy(Spacing.md),
            ) {
                items(state.campaigns, key = { it.id }) { campaign ->
                    AdCampaignRow(
                        campaign = campaign,
                        isUpdating = state.updatingId == campaign.id,
                        noteDraft = state.noteDrafts[campaign.id],
                        onApprove = { viewModel.approve(campaign.id) },
                        onReject = { viewModel.openReasonPrompt(campaign.id, "reject") },
                        onSuspend = { viewModel.openReasonPrompt(campaign.id, "suspend") },
                        onResume = { viewModel.resume(campaign.id) },
                        onCancel = { viewModel.openReasonPrompt(campaign.id, "cancel") },
                        onNoteDraftChange = { text -> viewModel.updateNoteDraft(campaign.id, text) },
                        onSaveNote = { viewModel.saveNote(campaign.id) },
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

    val reasonPromptCampaignId = state.reasonPromptCampaignId
    val reasonPromptAction = state.reasonPromptAction
    if (reasonPromptCampaignId != null && reasonPromptAction != null) {
        ReasonDialog(
            action = reasonPromptAction,
            onDismiss = { viewModel.closeReasonPrompt() },
            onConfirm = { reason -> viewModel.submitReasonPrompt(reason) },
        )
    }
}

@Composable
private fun adStatusLabel(status: String): String = when (status) {
    "PENDING_REVIEW" -> stringResource(R.string.admin_review_status_pending_review)
    "PAYMENT_PENDING" -> stringResource(R.string.admin_ads_status_payment_pending)
    "PAYMENT_FAILED" -> stringResource(R.string.admin_ads_status_payment_failed)
    "ACTIVE" -> stringResource(R.string.admin_review_status_active)
    "SUSPENDED" -> stringResource(R.string.admin_ads_status_suspended)
    "CANCELLED" -> stringResource(R.string.admin_ads_status_cancelled)
    "REJECTED" -> stringResource(R.string.admin_review_status_rejected)
    else -> stringResource(R.string.admin_reports_all)
}

@Composable
private fun AdCampaignRow(
    campaign: AdminAdCampaign,
    isUpdating: Boolean,
    noteDraft: String?,
    onApprove: () -> Unit,
    onReject: () -> Unit,
    onSuspend: () -> Unit,
    onResume: () -> Unit,
    onCancel: () -> Unit,
    onNoteDraftChange: (String) -> Unit,
    onSaveNote: () -> Unit,
) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(16.dp))
            .background(MaterialTheme.colorScheme.surfaceContainerLow)
            .padding(Spacing.md),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text(text = campaign.name, fontWeight = FontWeight.Bold, modifier = Modifier.weight(1f))
            Text(
                text = adStatusLabel(campaign.status),
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
            text = stringResource(R.string.admin_review_by, campaign.advertiser.username),
            style = MaterialTheme.typography.labelSmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.padding(top = 4.dp),
        )

        val post = campaign.post
        if (post != null) {
            Text(
                text = post.content,
                style = MaterialTheme.typography.bodySmall,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.padding(top = 4.dp),
            )
        }

        // bidAmount/budgetTotal arrive as plain JSON numbers (the real
        // Decimal columns are converted server-side, see AdminApi's
        // note) - formatted here rather than passed straight into the
        // resource so "5" never renders as "5.0".
        Text(
            text = stringResource(
                R.string.admin_ads_budget,
                campaign.bidType,
                formatMoney(campaign.bidAmount),
                formatMoney(campaign.budgetTotal),
            ),
            style = MaterialTheme.typography.labelSmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.padding(top = 4.dp),
        )

        // The on-chain payment step's own status line, independent of
        // the campaign's lifecycle status above - a campaign can sit in
        // PAYMENT_PENDING with no paidAt yet, or (once system moves it
        // to ACTIVE) show what was actually paid and with which tx.
        Text(
            text = if (campaign.paidAt != null) {
                stringResource(
                    R.string.admin_ads_paid_label,
                    formatMoney(campaign.budgetTotal),
                    truncateTxId(campaign.paymentTransactionId),
                )
            } else {
                stringResource(R.string.admin_ads_not_paid_label)
            },
            style = MaterialTheme.typography.labelSmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.padding(top = 4.dp),
        )

        if (!campaign.rejectionReason.isNullOrBlank()) {
            Text(
                text = stringResource(R.string.admin_review_reason_label, campaign.rejectionReason),
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.padding(top = 4.dp),
            )
        }

        OutlinedTextField(
            value = noteDraft ?: campaign.adminNote ?: "",
            onValueChange = onNoteDraftChange,
            label = { Text(stringResource(R.string.admin_ads_admin_note_label)) },
            placeholder = { Text(stringResource(R.string.admin_ads_admin_note_placeholder)) },
            textStyle = MaterialTheme.typography.bodySmall,
            minLines = 1,
            maxLines = 3,
            modifier = Modifier.fillMaxWidth().padding(top = Spacing.sm),
        )

        if (isUpdating) {
            CircularProgressIndicator(modifier = Modifier.padding(top = Spacing.sm).size(20.dp), strokeWidth = 2.dp)
        } else {
            Row(modifier = Modifier.padding(top = Spacing.sm), horizontalArrangement = Arrangement.spacedBy(Spacing.sm)) {
                if (campaign.status == "PENDING_REVIEW") {
                    TextButton(onClick = onApprove) { Text(stringResource(R.string.admin_review_approve)) }
                    TextButton(onClick = onReject) {
                        Text(stringResource(R.string.admin_review_reject), color = ZrpRed)
                    }
                }
                if (campaign.status == "ACTIVE" || campaign.status == "PAUSED") {
                    TextButton(onClick = onSuspend) {
                        Text(stringResource(R.string.admin_ads_suspend), color = ZrpRed)
                    }
                }
                if (campaign.status == "SUSPENDED") {
                    TextButton(onClick = onResume) { Text(stringResource(R.string.admin_ads_resume)) }
                }
                if (campaign.status in CANCELLABLE_STATUSES) {
                    TextButton(onClick = onCancel) {
                        Text(stringResource(R.string.admin_ads_cancel), color = ZrpRed)
                    }
                }
            }

            // Only shown once the draft actually diverges from the saved
            // note, matching the same "dirty" check the note textarea's
            // save button uses on web.
            if (noteDraft != null && noteDraft != (campaign.adminNote ?: "")) {
                Row(modifier = Modifier.padding(top = Spacing.xs)) {
                    TextButton(onClick = onSaveNote) { Text(stringResource(R.string.action_save)) }
                }
            }
        }
    }
}

private val CANCELLABLE_STATUSES = setOf("ACTIVE", "PAUSED", "SUSPENDED", "PAYMENT_PENDING", "PAYMENT_FAILED")

/** "5gT9…k2Qp"-style truncation so a full base58 signature never wraps the row. */
private fun truncateTxId(txId: String?): String {
    if (txId.isNullOrBlank()) return ""
    return if (txId.length <= 12) txId else "${txId.take(6)}…${txId.takeLast(4)}"
}

@Composable
private fun ReasonDialog(action: String, onDismiss: () -> Unit, onConfirm: (reason: String) -> Unit) {
    var reason by remember { mutableStateOf("") }

    val title = when (action) {
        "suspend" -> stringResource(R.string.admin_ads_suspend)
        "cancel" -> stringResource(R.string.admin_ads_cancel)
        else -> stringResource(R.string.admin_review_reject)
    }
    // Cancel deliberately reuses the suspend placeholder, same as
    // src/app/admin/ads/page.tsx does (there is no separate cancel
    // placeholder string - both are staff-facing reasons shown to the
    // advertiser, unlike the note field below which never is).
    val placeholder = when (action) {
        "suspend", "cancel" -> stringResource(R.string.admin_ads_suspend_placeholder)
        else -> stringResource(R.string.admin_ads_rejection_placeholder)
    }
    val confirmLabel = when (action) {
        "suspend" -> stringResource(R.string.admin_ads_confirm_suspend)
        "cancel" -> stringResource(R.string.admin_ads_confirm_cancel)
        else -> stringResource(R.string.admin_reports_confirm_action)
    }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(title) },
        text = {
            OutlinedTextField(
                value = reason,
                onValueChange = { reason = it },
                label = { Text(stringResource(R.string.admin_reports_note_optional)) },
                placeholder = { Text(placeholder) },
                modifier = Modifier.fillMaxWidth(),
            )
        },
        confirmButton = {
            TextButton(onClick = { onConfirm(reason) }) {
                Text(confirmLabel, color = ZrpRed)
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) { Text(stringResource(R.string.admin_reports_cancel)) }
        },
    )
}
