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
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import one.zrp.social.mobile.R
import one.zrp.social.mobile.data.AdminRepository
import one.zrp.social.mobile.network.AdminUpgradeRequest
import one.zrp.social.mobile.ui.support.formatTicketDateTime
import one.zrp.social.mobile.ui.theme.Spacing
import one.zrp.social.mobile.ui.theme.ZrpRed

// The real lowercase UpgradeRequest statuses. Like the website's own
// page, the queue opens on "pending" - the only status anything can be
// done from.
private val STATUS_FILTERS = listOf("pending", "approved", "denied")

/**
 * Ported from src/app/admin/upgrade-requests/page.tsx - requests users
 * have filed to move onto a paid plan. Approving writes the requested
 * plan onto their account, so both decisions go through a confirm
 * dialog naming the user and the plan. Full-ADMIN-only, matching
 * requireAdmin on both halves of the route (see AdminApi's own note on
 * why it isn't under /admin at all).
 */
@Composable
fun AdminUpgradeRequestsScreen(isAdmin: Boolean, onBack: () -> Unit) {
    val viewModel: AdminUpgradeRequestsViewModel = viewModel(
        factory = remember { AdminUpgradeRequestsViewModelFactory(AdminRepository()) },
    )
    val state by viewModel.state.collectAsState()
    val context = LocalContext.current

    LaunchedEffect(isAdmin) { if (isAdmin) viewModel.load() }

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
                text = stringResource(R.string.admin_upgrade_requests_title),
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
                    label = { Text(upgradeRequestStatusLabel(status)) },
                )
            }
        }

        if (state.isLoading) {
            Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                CircularProgressIndicator()
            }
        } else if (state.requests.isEmpty()) {
            Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                Text(
                    text = stringResource(R.string.admin_upgrade_requests_none),
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        } else {
            LazyColumn(
                modifier = Modifier.weight(1f),
                contentPadding = PaddingValues(Spacing.lg),
                verticalArrangement = Arrangement.spacedBy(Spacing.md),
            ) {
                items(state.requests, key = { it.id }) { request ->
                    UpgradeRequestRow(
                        request = request,
                        isUpdating = state.updatingId == request.id,
                        onApprove = { viewModel.requestAction(request.id, "approve") },
                        onDeny = { viewModel.requestAction(request.id, "deny") },
                    )
                }
            }
        }
    }

    val pendingAction = state.pendingAction
    val pendingRequest = state.pendingActionId?.let { id -> state.requests.firstOrNull { it.id == id } }
    if (pendingAction != null && pendingRequest != null) {
        val isApprove = pendingAction == "approve"
        val planLabel = adminPlanLabel(pendingRequest.requestedPlan)
        AlertDialog(
            onDismissRequest = { viewModel.cancelAction() },
            title = {
                Text(
                    if (isApprove) {
                        stringResource(R.string.admin_review_approve)
                    } else {
                        stringResource(R.string.admin_upgrade_requests_deny)
                    },
                )
            },
            text = {
                Text(
                    if (isApprove) {
                        stringResource(
                            R.string.admin_upgrade_requests_approve_confirm,
                            pendingRequest.user.username,
                            planLabel,
                        )
                    } else {
                        stringResource(
                            R.string.admin_upgrade_requests_deny_confirm,
                            pendingRequest.user.username,
                            planLabel,
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
                            stringResource(R.string.admin_upgrade_requests_deny)
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
private fun upgradeRequestStatusLabel(status: String): String = when (status) {
    "pending" -> stringResource(R.string.admin_upgrade_requests_status_pending)
    "approved" -> stringResource(R.string.admin_upgrade_requests_status_approved)
    "denied" -> stringResource(R.string.admin_upgrade_requests_status_denied)
    else -> status
}

@Composable
private fun UpgradeRequestRow(
    request: AdminUpgradeRequest,
    isUpdating: Boolean,
    onApprove: () -> Unit,
    onDeny: () -> Unit,
) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(16.dp))
            .background(MaterialTheme.colorScheme.surfaceContainerLow)
            .padding(Spacing.md),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            // The plan they're on now against the one they've asked
            // for - the same before/after pair the web page shows as
            // two badges.
            Text(
                text = stringResource(
                    R.string.admin_upgrade_requests_plan_change,
                    adminPlanLabel(request.user.plan),
                    adminPlanLabel(request.requestedPlan),
                ),
                fontWeight = FontWeight.Bold,
                modifier = Modifier.weight(1f),
            )
            Text(
                text = upgradeRequestStatusLabel(request.status),
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
            text = stringResource(R.string.admin_review_by, request.user.username),
            style = MaterialTheme.typography.labelSmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.padding(top = 4.dp),
        )

        if (!request.paymentMethod.isNullOrBlank()) {
            Text(
                text = stringResource(R.string.admin_upgrade_requests_payment_method, request.paymentMethod),
                style = MaterialTheme.typography.bodySmall,
                modifier = Modifier.padding(top = 4.dp),
            )
        }

        if (!request.message.isNullOrBlank()) {
            Text(
                text = request.message,
                style = MaterialTheme.typography.bodySmall,
                modifier = Modifier.padding(top = 4.dp),
            )
        }

        Text(
            text = stringResource(R.string.admin_finance_requested, formatTicketDateTime(request.createdAt)),
            style = MaterialTheme.typography.labelSmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.padding(top = 4.dp),
        )

        if (isUpdating) {
            CircularProgressIndicator(modifier = Modifier.padding(top = Spacing.sm).size(20.dp), strokeWidth = 2.dp)
        } else if (request.status == "pending") {
            Row(modifier = Modifier.padding(top = Spacing.sm), horizontalArrangement = Arrangement.spacedBy(Spacing.sm)) {
                TextButton(onClick = onApprove) { Text(stringResource(R.string.admin_review_approve)) }
                TextButton(onClick = onDeny) {
                    Text(stringResource(R.string.admin_upgrade_requests_deny), color = ZrpRed)
                }
            }
        }
    }
}
