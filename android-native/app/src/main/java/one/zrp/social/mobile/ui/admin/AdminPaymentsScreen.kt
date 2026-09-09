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
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.CircularProgressIndicator
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
import one.zrp.social.mobile.network.AdminPaymentRequest
import one.zrp.social.mobile.ui.support.formatTicketDateTime
import one.zrp.social.mobile.ui.theme.Spacing
import one.zrp.social.mobile.ui.theme.ZrpRed

/**
 * The four real plan values every financial admin surface deals in -
 * PaymentRequest.plan, UpgradeRequest.requestedPlan and User.plan all
 * carry the same lowercase strings, and PUT /admin/users/{id}/plan
 * validates against exactly this list (see its own validPlans). Shared
 * by the payments queue, the upgrade-request queue and the plan
 * dropdown in AdminUsersScreen.
 */
internal val USER_PLANS = listOf("free", "pro", "business", "enterprise")

@Composable
internal fun adminPlanLabel(plan: String?): String {
    // A user row can genuinely carry no plan at all - User.plan is
    // nullable, and the admin users route selects it as-is.
    if (plan.isNullOrBlank()) return stringResource(R.string.admin_plan_none)
    return when (plan) {
        "free" -> stringResource(R.string.admin_plan_free)
        "pro" -> stringResource(R.string.admin_plan_pro)
        "business" -> stringResource(R.string.admin_plan_business)
        "enterprise" -> stringResource(R.string.admin_plan_enterprise)
        // A payment or upgrade row could name a tier this build doesn't
        // know yet - showing the raw value beats showing nothing.
        else -> plan
    }
}

/**
 * Ported from src/app/admin/payments/page.tsx - the pending manual
 * payment queue. Verifying a row upgrades the payer's plan server-side,
 * so it goes through a confirm dialog naming the amount, the payer and
 * the plan they'd be moved onto. Full-ADMIN-only both here and on the
 * route itself (requireAdmin) - see AdminPaymentsViewModel's own KDoc.
 */
@Composable
fun AdminPaymentsScreen(isAdmin: Boolean, onBack: () -> Unit) {
    val viewModel: AdminPaymentsViewModel = viewModel(
        factory = remember { AdminPaymentsViewModelFactory(AdminRepository()) },
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
                text = stringResource(R.string.admin_payments_title),
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

        if (state.isLoading) {
            Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                CircularProgressIndicator()
            }
        } else if (state.payments.isEmpty()) {
            Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                Text(
                    text = stringResource(R.string.admin_payments_none),
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        } else {
            LazyColumn(
                modifier = Modifier.weight(1f),
                contentPadding = PaddingValues(Spacing.lg),
                verticalArrangement = Arrangement.spacedBy(Spacing.md),
            ) {
                items(state.payments, key = { it.id }) { payment ->
                    PaymentRow(
                        payment = payment,
                        isUpdating = state.updatingId == payment.id,
                        onVerify = { viewModel.requestVerify(payment.id) },
                    )
                }
            }
        }
    }

    // The dialog names the exact amount, payer and plan rather than
    // asking "are you sure?" - this is the step that grants paid access.
    val pendingPayment = state.pendingVerifyId?.let { id -> state.payments.firstOrNull { it.id == id } }
    if (pendingPayment != null) {
        AlertDialog(
            onDismissRequest = { viewModel.cancelVerify() },
            title = { Text(stringResource(R.string.admin_payments_verify)) },
            text = {
                Text(
                    stringResource(
                        R.string.admin_payments_verify_confirm,
                        "${pendingPayment.currency} ${formatMoney(pendingPayment.amount)}",
                        pendingPayment.user.username,
                        adminPlanLabel(pendingPayment.plan),
                    ),
                )
            },
            confirmButton = {
                TextButton(onClick = { viewModel.confirmVerify() }) {
                    Text(stringResource(R.string.admin_payments_verify), color = ZrpRed)
                }
            },
            dismissButton = {
                TextButton(onClick = { viewModel.cancelVerify() }) {
                    Text(stringResource(R.string.admin_reports_cancel))
                }
            },
        )
    }
}

@Composable
private fun PaymentRow(
    payment: AdminPaymentRequest,
    isUpdating: Boolean,
    onVerify: () -> Unit,
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
                text = payment.user.name ?: "@${payment.user.username}",
                fontWeight = FontWeight.Bold,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.weight(1f),
            )
            Text(
                text = adminPlanLabel(payment.plan),
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
            text = stringResource(R.string.admin_review_by, payment.user.username),
            style = MaterialTheme.typography.labelSmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.padding(top = 4.dp),
        )

        Text(
            text = "${payment.currency} ${formatMoney(payment.amount)}",
            style = MaterialTheme.typography.bodyMedium,
            fontWeight = FontWeight.Bold,
            modifier = Modifier.padding(top = 4.dp),
        )

        // transactionId is optional on the model - a payer can file a
        // request without one, which the web page renders as "Not
        // provided" rather than hiding the line.
        val transactionId = payment.transactionId
        val transactionLabel = if (transactionId.isNullOrBlank()) {
            stringResource(R.string.admin_payments_tx_none)
        } else {
            transactionId
        }
        Text(
            text = stringResource(R.string.admin_payments_tx, transactionLabel),
            style = MaterialTheme.typography.labelSmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            maxLines = 2,
            overflow = TextOverflow.Ellipsis,
            modifier = Modifier.padding(top = 4.dp),
        )

        Text(
            text = stringResource(R.string.admin_finance_requested, formatTicketDateTime(payment.createdAt)),
            style = MaterialTheme.typography.labelSmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.padding(top = 4.dp),
        )

        if (isUpdating) {
            CircularProgressIndicator(modifier = Modifier.padding(top = Spacing.sm).size(20.dp), strokeWidth = 2.dp)
        } else {
            Row(modifier = Modifier.padding(top = Spacing.sm), horizontalArrangement = Arrangement.spacedBy(Spacing.sm)) {
                TextButton(onClick = onVerify) {
                    Text(stringResource(R.string.admin_payments_verify), color = ZrpRed)
                }
            }
        }
    }
}
