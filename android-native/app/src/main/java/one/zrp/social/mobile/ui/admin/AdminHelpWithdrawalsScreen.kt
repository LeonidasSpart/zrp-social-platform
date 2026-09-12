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
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
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
import one.zrp.social.mobile.network.AdminHelpWithdrawal
import one.zrp.social.mobile.ui.support.formatTicketDateTime
import one.zrp.social.mobile.ui.theme.Spacing
import one.zrp.social.mobile.ui.theme.ZrpRed

// The real WithdrawalStatus enum, verbatim - same enum /admin/withdrawals
// uses. There's no "all" chip here because the route filters on exactly
// one status - it has no all-value branch (see its own `where: { status }`).
private val STATUS_FILTERS = listOf("PENDING", "PROCESSING", "COMPLETED", "FAILED", "REJECTED")

/**
 * The HELP-campaign fund release queue (GET /admin/help-withdrawals) -
 * see AdminHelpWithdrawalsViewModel's own KDoc for how this differs from
 * the creator earnings payout queue at /admin/withdrawals (which has its
 * own screen, AdminWithdrawalsScreen).
 *
 * Approving sends real USDC on-chain, so both actions sit behind a
 * confirm dialog naming the amount, the organizer and the campaign.
 * Full-ADMIN-only, matching requireAdmin on every route behind it.
 */
@Composable
fun AdminHelpWithdrawalsScreen(isAdmin: Boolean, onBack: () -> Unit) {
    val viewModel: AdminHelpWithdrawalsViewModel = viewModel(
        factory = remember { AdminHelpWithdrawalsViewModelFactory(AdminRepository()) },
    )
    val state by viewModel.state.collectAsState()
    val context = LocalContext.current

    LaunchedEffect(isAdmin) { if (isAdmin) viewModel.load() }

    LaunchedEffect(state.error) {
        val message = state.error
        if (message != null) {
            Toast.makeText(context, message, Toast.LENGTH_LONG).show()
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
                text = stringResource(R.string.admin_help_withdrawals_title),
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.Bold,
                modifier = Modifier.padding(start = 4.dp),
            )
        }

        if (!isAdmin) {
            Box(modifier = Modifier.fillMaxSize().padding(Spacing.xl), contentAlignment = Alignment.Center) {
                Text(
                    text = stringResource(R.string.admin_access_denied),
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            return@Column
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
                    label = { Text(helpWithdrawalStatusLabel(status)) },
                )
            }
        }

        if (state.isLoading) {
            Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                CircularProgressIndicator()
            }
        } else if (state.withdrawals.isEmpty()) {
            Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                Text(
                    text = stringResource(R.string.admin_help_withdrawals_none),
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        } else {
            LazyColumn(
                modifier = Modifier.weight(1f),
                contentPadding = PaddingValues(Spacing.lg),
                verticalArrangement = Arrangement.spacedBy(Spacing.md),
            ) {
                items(state.withdrawals, key = { it.id }) { withdrawal ->
                    HelpWithdrawalRow(
                        withdrawal = withdrawal,
                        isUpdating = state.updatingId == withdrawal.id,
                        onApprove = { viewModel.requestAction(withdrawal.id, "approve") },
                        onReject = { viewModel.requestAction(withdrawal.id, "reject") },
                    )
                }
            }
        }
    }

    val pendingAction = state.pendingAction
    val pendingWithdrawal = state.pendingActionId?.let { id -> state.withdrawals.firstOrNull { it.id == id } }
    if (pendingAction != null && pendingWithdrawal != null) {
        val amount = "${pendingWithdrawal.currency} ${formatMoney(pendingWithdrawal.amount)}"
        val isApprove = pendingAction == "approve"
        AlertDialog(
            onDismissRequest = { viewModel.cancelAction() },
            title = {
                Text(
                    if (isApprove) {
                        stringResource(R.string.admin_review_approve)
                    } else {
                        stringResource(R.string.admin_review_reject)
                    },
                )
            },
            text = {
                Text(
                    if (isApprove) {
                        stringResource(
                            R.string.admin_help_withdrawals_approve_confirm,
                            amount,
                            pendingWithdrawal.organizer.username,
                            pendingWithdrawal.campaign.title,
                        )
                    } else {
                        stringResource(
                            R.string.admin_help_withdrawals_reject_confirm,
                            amount,
                            pendingWithdrawal.campaign.title,
                        )
                    },
                )
            },
            confirmButton = {
                TextButton(onClick = { viewModel.confirmAction() }) {
                    Text(
                        text = if (isApprove) {
                            stringResource(R.string.admin_review_approve)
                        } else {
                            stringResource(R.string.admin_review_reject)
                        },
                        color = ZrpRed,
                    )
                }
            },
            dismissButton = {
                TextButton(onClick = { viewModel.cancelAction() }) {
                    Text(stringResource(R.string.admin_reports_cancel))
                }
            },
        )
    }
}

@Composable
private fun helpWithdrawalStatusLabel(status: String): String = when (status) {
    "PENDING" -> stringResource(R.string.admin_withdrawals_status_pending)
    "PROCESSING" -> stringResource(R.string.admin_withdrawals_status_processing)
    "COMPLETED" -> stringResource(R.string.admin_withdrawals_status_completed)
    "FAILED" -> stringResource(R.string.admin_withdrawals_status_failed)
    "REJECTED" -> stringResource(R.string.admin_withdrawals_status_rejected)
    else -> status
}

@Composable
private fun HelpWithdrawalRow(
    withdrawal: AdminHelpWithdrawal,
    isUpdating: Boolean,
    onApprove: () -> Unit,
    onReject: () -> Unit,
) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(16.dp))
            .background(MaterialTheme.colorScheme.surfaceContainerLow)
            .padding(Spacing.md),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text(
                text = "${withdrawal.currency} ${formatMoney(withdrawal.amount)}",
                fontWeight = FontWeight.Bold,
                modifier = Modifier.weight(1f),
            )
            Text(
                text = helpWithdrawalStatusLabel(withdrawal.status),
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
            text = stringResource(R.string.admin_help_withdrawals_campaign, withdrawal.campaign.title),
            style = MaterialTheme.typography.bodySmall,
            fontWeight = FontWeight.Bold,
            modifier = Modifier.padding(top = 4.dp),
        )

        Text(
            text = stringResource(R.string.admin_review_by, withdrawal.organizer.username),
            style = MaterialTheme.typography.labelSmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.padding(top = 4.dp),
        )

        // The destination wallet is the one field an admin has to be
        // able to read in full before approving a transfer, so it wraps
        // rather than ellipsing on the first line.
        Text(
            text = stringResource(R.string.admin_withdrawals_wallet, withdrawal.walletAddress),
            style = MaterialTheme.typography.bodySmall,
            modifier = Modifier.padding(top = 4.dp),
        )

        if (!withdrawal.transactionHash.isNullOrBlank()) {
            Text(
                text = stringResource(R.string.admin_withdrawals_tx_hash, withdrawal.transactionHash),
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.padding(top = 4.dp),
            )
        }

        Text(
            text = stringResource(R.string.admin_finance_requested, formatTicketDateTime(withdrawal.createdAt)),
            style = MaterialTheme.typography.labelSmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.padding(top = 4.dp),
        )

        if (isUpdating) {
            CircularProgressIndicator(modifier = Modifier.padding(top = Spacing.sm).size(20.dp), strokeWidth = 2.dp)
        } else if (withdrawal.status == "PENDING") {
            // Only a PENDING withdrawal can be actioned - every other
            // status is already terminal or claimed by another admin,
            // and the route 400s/409s on it.
            Row(modifier = Modifier.padding(top = Spacing.sm), horizontalArrangement = Arrangement.spacedBy(Spacing.sm)) {
                TextButton(onClick = onApprove) { Text(stringResource(R.string.admin_review_approve)) }
                TextButton(onClick = onReject) {
                    Text(stringResource(R.string.admin_review_reject), color = ZrpRed)
                }
            }
        }
    }
}
