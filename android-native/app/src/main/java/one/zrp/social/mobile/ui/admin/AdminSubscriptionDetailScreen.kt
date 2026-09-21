package one.zrp.social.mobile.ui.admin

import android.widget.Toast
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
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
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import one.zrp.social.mobile.R
import one.zrp.social.mobile.data.AdminRepository
import one.zrp.social.mobile.network.AdminSubscriptionPayment
import one.zrp.social.mobile.ui.support.formatTicketDateTime
import one.zrp.social.mobile.ui.theme.Spacing
import one.zrp.social.mobile.ui.theme.ZrpRed
import one.zrp.social.mobile.util.localizedError

private val GRANT_PLANS = listOf("pro", "business", "enterprise")
private val GRANT_INTERVALS = listOf("monthly", "yearly")

/**
 * Ported from src/app/admin/subscriptions/[userId]/page.tsx - see
 * AdminSubscriptionDetailViewModel's own KDoc. All three admin actions
 * change real billing state (granting extends paid access with no
 * payment behind it, canceling takes it away immediately, restoring
 * undoes a cancellation), so each sits behind its own confirm dialog,
 * matching this module's own precedent (AdminUsersScreen's plan-change
 * dialog, AdminWithdrawalsScreen's approve/reject dialogs).
 */
@Composable
fun AdminSubscriptionDetailScreen(userId: String, onBack: () -> Unit) {
    val viewModel: AdminSubscriptionDetailViewModel = viewModel(
        factory = remember(userId) { AdminSubscriptionDetailViewModelFactory(userId, AdminRepository()) },
    )
    val state by viewModel.state.collectAsState()
    val context = LocalContext.current

    LaunchedEffect(userId) { viewModel.load() }

    val localizedErrorMessage = localizedError(state.error)
    LaunchedEffect(state.error) {
        val message = localizedErrorMessage
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
                text = state.user?.let { "@${it.username}" } ?: stringResource(R.string.admin_subscriptions_title),
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.Bold,
                modifier = Modifier.padding(start = 4.dp),
            )
        }

        when {
            state.isLoading -> {
                Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    CircularProgressIndicator()
                }
            }
            state.notFound -> {
                Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    Text(
                        text = stringResource(R.string.admin_subscription_detail_not_found),
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }
            else -> {
                Column(
                    modifier = Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(Spacing.lg),
                ) {
                    val sub = state.subscription
                    SectionTitle(stringResource(R.string.admin_subscription_detail_current_subscription))
                    if (sub == null) {
                        Text(
                            text = stringResource(R.string.admin_subscription_detail_no_subscription_record),
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    } else {
                        DetailCard {
                            FieldRow(stringResource(R.string.admin_subscription_detail_field_plan), adminPlanLabel(sub.plan))
                            FieldRow(stringResource(R.string.admin_subscription_detail_field_status), subscriptionStatusLabel(sub.status))
                            sub.billingInterval?.let {
                                FieldRow(stringResource(R.string.admin_subscription_detail_field_interval), intervalLabel(it))
                            }
                            FieldRow(
                                stringResource(R.string.admin_subscription_detail_field_days_remaining),
                                sub.daysRemaining?.toString() ?: stringResource(R.string.admin_subscription_detail_not_yet),
                            )
                            sub.currentPeriodStart?.let {
                                FieldRow(stringResource(R.string.admin_subscription_detail_field_period_start), formatTicketDateTime(it))
                            }
                            sub.currentPeriodEnd?.let {
                                FieldRow(stringResource(R.string.admin_subscription_detail_field_period_end), formatTicketDateTime(it))
                            }
                            FieldRow(
                                stringResource(R.string.admin_subscription_detail_field_last_payment),
                                sub.lastPaymentAt?.let { formatTicketDateTime(it) } ?: stringResource(R.string.admin_subscription_detail_not_yet),
                            )
                            FieldRow(
                                stringResource(R.string.admin_subscription_detail_field_reminder_sent),
                                sub.reminderSentAt?.let { formatTicketDateTime(it) } ?: stringResource(R.string.admin_subscription_detail_not_yet),
                            )
                            sub.canceledAt?.let {
                                FieldRow(stringResource(R.string.admin_subscription_detail_field_canceled_at), formatTicketDateTime(it))
                            }
                            sub.expiredAt?.let {
                                FieldRow(stringResource(R.string.admin_subscription_detail_field_expired_at), formatTicketDateTime(it))
                            }
                            FieldRow(
                                stringResource(R.string.admin_subscription_detail_field_legacy_backfill),
                                if (sub.isLegacyBackfill) stringResource(R.string.admin_subscription_detail_yes) else stringResource(R.string.admin_subscription_detail_no),
                            )
                        }
                    }

                    SectionTitle(stringResource(R.string.admin_subscription_detail_admin_controls))
                    Row(horizontalArrangement = Arrangement.spacedBy(Spacing.sm)) {
                        if (state.actionBusy) {
                            CircularProgressIndicator(modifier = Modifier.size(20.dp), strokeWidth = 2.dp)
                        } else {
                            Button(onClick = { viewModel.openGrantDialog() }) {
                                Text(stringResource(R.string.admin_subscription_detail_grant_extend))
                            }
                            if (sub != null && sub.status == "ACTIVE") {
                                OutlinedButton(onClick = { viewModel.openCancelDialog() }) {
                                    Text(stringResource(R.string.admin_subscription_detail_cancel_remaining), color = MaterialTheme.colorScheme.error)
                                }
                            }
                            if (sub != null && sub.status == "CANCELED") {
                                OutlinedButton(onClick = { viewModel.openRestoreDialog() }) {
                                    Text(stringResource(R.string.admin_subscription_detail_restore))
                                }
                            }
                        }
                    }

                    SectionTitle(stringResource(R.string.admin_subscription_detail_payment_history))
                    val payments = sub?.payments.orEmpty()
                    if (payments.isEmpty()) {
                        Text(
                            text = stringResource(R.string.admin_subscription_detail_no_payments),
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    } else {
                        payments.forEach { payment -> PaymentRow(payment) }
                    }
                }
            }
        }
    }

    if (state.grantDialogOpen) {
        GrantDialog(
            plan = state.grantPlan,
            interval = state.grantInterval,
            onPlanChange = { viewModel.setGrantPlan(it) },
            onIntervalChange = { viewModel.setGrantInterval(it) },
            onConfirm = { viewModel.confirmGrant() },
            onDismiss = { viewModel.closeGrantDialog() },
        )
    }

    if (state.cancelDialogOpen) {
        AlertDialog(
            onDismissRequest = { viewModel.closeCancelDialog() },
            title = { Text(stringResource(R.string.admin_subscription_detail_cancel_remaining)) },
            text = {
                Column {
                    Text(
                        text = stringResource(R.string.admin_subscription_detail_cancel_reason_prompt),
                        style = MaterialTheme.typography.labelMedium,
                    )
                    OutlinedTextField(
                        value = state.cancelReason,
                        onValueChange = { viewModel.setCancelReason(it) },
                        singleLine = true,
                        modifier = Modifier.fillMaxWidth().padding(top = Spacing.xs),
                    )
                }
            },
            confirmButton = {
                TextButton(onClick = { viewModel.confirmCancel() }) {
                    Text(stringResource(R.string.admin_subscription_detail_cancel_remaining), color = MaterialTheme.colorScheme.error)
                }
            },
            dismissButton = {
                TextButton(onClick = { viewModel.closeCancelDialog() }) { Text(stringResource(android.R.string.cancel)) }
            },
        )
    }

    if (state.restoreDialogOpen) {
        AlertDialog(
            onDismissRequest = { viewModel.closeRestoreDialog() },
            title = { Text(stringResource(R.string.admin_subscription_detail_restore)) },
            confirmButton = {
                TextButton(onClick = { viewModel.confirmRestore() }) {
                    Text(stringResource(R.string.admin_subscription_detail_restore), color = ZrpRed)
                }
            },
            dismissButton = {
                TextButton(onClick = { viewModel.closeRestoreDialog() }) { Text(stringResource(android.R.string.cancel)) }
            },
        )
    }
}

@Composable
private fun GrantDialog(
    plan: String,
    interval: String,
    onPlanChange: (String) -> Unit,
    onIntervalChange: (String) -> Unit,
    onConfirm: () -> Unit,
    onDismiss: () -> Unit,
) {
    var planMenuOpen by remember { mutableStateOf(false) }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(stringResource(R.string.admin_subscription_detail_grant_extend)) },
        text = {
            Column {
                Text(
                    text = stringResource(R.string.admin_subscription_detail_grant_extend_note),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                Text(
                    text = stringResource(R.string.admin_subscription_detail_plan_label),
                    style = MaterialTheme.typography.labelMedium,
                    modifier = Modifier.padding(top = Spacing.md),
                )
                Box {
                    OutlinedButton(onClick = { planMenuOpen = true }, modifier = Modifier.fillMaxWidth()) {
                        Text(grantPlanLabel(plan))
                    }
                    DropdownMenu(expanded = planMenuOpen, onDismissRequest = { planMenuOpen = false }) {
                        GRANT_PLANS.forEach { p ->
                            DropdownMenuItem(
                                text = { Text(grantPlanLabel(p)) },
                                onClick = { planMenuOpen = false; onPlanChange(p) },
                            )
                        }
                    }
                }
                Text(
                    text = stringResource(R.string.admin_subscription_detail_interval_label),
                    style = MaterialTheme.typography.labelMedium,
                    modifier = Modifier.padding(top = Spacing.md),
                )
                Row(horizontalArrangement = Arrangement.spacedBy(Spacing.sm)) {
                    GRANT_INTERVALS.forEach { i ->
                        FilterChip(selected = interval == i, onClick = { onIntervalChange(i) }, label = { Text(intervalLabel(i)) })
                    }
                }
            }
        },
        confirmButton = {
            TextButton(onClick = onConfirm) {
                Text(stringResource(R.string.admin_subscription_detail_grant_extend), color = ZrpRed)
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) { Text(stringResource(android.R.string.cancel)) }
        },
    )
}

@Composable
private fun grantPlanLabel(plan: String): String = when (plan) {
    "pro" -> stringResource(R.string.admin_subscription_detail_plan_pro)
    "business" -> stringResource(R.string.admin_subscription_detail_plan_business)
    "enterprise" -> stringResource(R.string.admin_subscription_detail_plan_enterprise)
    else -> plan
}

@Composable
private fun intervalLabel(interval: String): String = when (interval) {
    "monthly" -> stringResource(R.string.admin_subscription_detail_interval_monthly)
    "yearly" -> stringResource(R.string.admin_subscription_detail_interval_yearly)
    else -> interval
}

@Composable
private fun SectionTitle(title: String) {
    Text(
        text = title,
        style = MaterialTheme.typography.titleSmall,
        fontWeight = FontWeight.Bold,
        modifier = Modifier.padding(top = Spacing.xl, bottom = Spacing.md),
    )
}

@Composable
private fun DetailCard(content: @Composable ColumnScope.() -> Unit) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(16.dp))
            .background(MaterialTheme.colorScheme.surfaceContainerLow)
            .padding(Spacing.md),
        content = content,
    )
}

@Composable
private fun FieldRow(label: String, value: String) {
    Row(
        modifier = Modifier.fillMaxWidth().padding(vertical = 2.dp),
        horizontalArrangement = Arrangement.SpaceBetween,
    ) {
        Text(text = label, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        Text(text = value, style = MaterialTheme.typography.labelSmall, fontWeight = FontWeight.Bold)
    }
}

@Composable
private fun PaymentRow(payment: AdminSubscriptionPayment) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .padding(bottom = Spacing.sm)
            .clip(RoundedCornerShape(16.dp))
            .background(MaterialTheme.colorScheme.surfaceContainerLow)
            .padding(Spacing.md),
    ) {
        Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
            Text(text = "${payment.currency} ${formatMoney(payment.amount)}", fontWeight = FontWeight.Bold)
            Text(
                text = "${adminPlanLabel(payment.plan)} · ${intervalLabel(payment.billingInterval)}",
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
        Text(
            text = formatTicketDateTime(payment.createdAt),
            style = MaterialTheme.typography.labelSmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.padding(top = 2.dp),
        )
        Text(
            text = payment.paymentMethod,
            style = MaterialTheme.typography.labelSmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
}
