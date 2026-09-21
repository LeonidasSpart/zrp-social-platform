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
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.Search
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
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import one.zrp.social.mobile.R
import one.zrp.social.mobile.data.AdminRepository
import one.zrp.social.mobile.network.AdminSubscriptionRow
import one.zrp.social.mobile.ui.components.BadgeSize
import one.zrp.social.mobile.ui.components.VerifiedBadge
import one.zrp.social.mobile.ui.theme.Spacing
import one.zrp.social.mobile.ui.theme.ZrpRed
import one.zrp.social.mobile.util.localizedError

private val PLAN_FILTERS = listOf("ALL", "free", "pro", "business", "enterprise")
private val STATUS_FILTERS =
    listOf("ALL", "PAID", "FREE", "ACTIVE", "EXPIRED", "CANCELED", "PENDING", "NO_SUBSCRIPTION")

/**
 * Ported from src/app/admin/subscriptions/page.tsx (list half) - see
 * AdminSubscriptionsViewModel's own KDoc. ADMIN-only, gated at the call
 * site the same way the financial queues are, so this screen (unlike
 * AdminUsersScreen) takes no isAdmin flag of its own to branch on - its
 * one entry point in AdminDashboardScreen is already behind `if
 * (isAdmin)`.
 */
@Composable
fun AdminSubscriptionsScreen(onBack: () -> Unit, onOpenDetail: (String) -> Unit) {
    val viewModel: AdminSubscriptionsViewModel = viewModel(
        factory = remember { AdminSubscriptionsViewModelFactory(AdminRepository()) },
    )
    val state by viewModel.state.collectAsState()
    val context = LocalContext.current

    LaunchedEffect(Unit) { viewModel.load() }

    val localizedErrorMessage = localizedError(state.error)
    LaunchedEffect(state.error) {
        val message = localizedErrorMessage
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
                text = stringResource(R.string.admin_subscriptions_title),
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.Bold,
                modifier = Modifier.padding(start = 4.dp),
            )
        }

        OutlinedTextField(
            value = state.search,
            onValueChange = { viewModel.setSearch(it) },
            placeholder = { Text(stringResource(R.string.admin_subscriptions_search_placeholder)) },
            leadingIcon = { Icon(Icons.Filled.Search, contentDescription = null) },
            singleLine = true,
            keyboardOptions = KeyboardOptions(imeAction = ImeAction.Search),
            keyboardActions = KeyboardActions(onSearch = { viewModel.submitSearch() }),
            modifier = Modifier.fillMaxWidth().padding(horizontal = Spacing.lg, vertical = Spacing.sm),
        )

        Row(
            modifier = Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()).padding(horizontal = Spacing.lg),
            horizontalArrangement = Arrangement.spacedBy(Spacing.sm),
        ) {
            PLAN_FILTERS.forEach { plan ->
                FilterChip(
                    selected = state.planFilter == plan,
                    onClick = { viewModel.setPlanFilter(plan) },
                    label = { Text(if (plan == "ALL") stringResource(R.string.admin_subscriptions_plan_all) else adminPlanLabel(plan)) },
                )
            }
        }
        Row(
            modifier = Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()).padding(horizontal = Spacing.lg, vertical = Spacing.sm),
            horizontalArrangement = Arrangement.spacedBy(Spacing.sm),
        ) {
            STATUS_FILTERS.forEach { status ->
                FilterChip(
                    selected = state.statusFilter == status,
                    onClick = { viewModel.setStatusFilter(status) },
                    label = { Text(subscriptionStatusLabel(status)) },
                )
            }
        }

        if (state.isLoading) {
            Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                CircularProgressIndicator()
            }
        } else if (state.subscriptions.isEmpty()) {
            Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                Text(text = stringResource(R.string.admin_subscriptions_empty), color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        } else {
            LazyColumn(
                modifier = Modifier.weight(1f),
                contentPadding = PaddingValues(Spacing.lg),
                verticalArrangement = Arrangement.spacedBy(Spacing.md),
            ) {
                items(state.subscriptions, key = { it.userId }) { row ->
                    SubscriptionRow(row = row, onView = { onOpenDetail(row.userId) })
                }
            }

            if (state.totalPages > 1) {
                Row(
                    modifier = Modifier.fillMaxWidth().padding(Spacing.md),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    TextButton(onClick = { viewModel.setPage(state.page - 1) }, enabled = state.page > 1) {
                        Text(stringResource(R.string.admin_users_previous))
                    }
                    Text(
                        text = stringResource(R.string.admin_users_page_of, state.page, state.totalPages),
                        style = MaterialTheme.typography.labelMedium,
                    )
                    TextButton(onClick = { viewModel.setPage(state.page + 1) }, enabled = state.page < state.totalPages) {
                        Text(stringResource(R.string.admin_users_next))
                    }
                }
            }
        }
    }
}

@Composable
internal fun subscriptionStatusLabel(status: String): String = when (status) {
    "PAID" -> stringResource(R.string.admin_subscriptions_status_paid)
    "FREE" -> stringResource(R.string.admin_subscriptions_status_free)
    "ACTIVE" -> stringResource(R.string.admin_subscriptions_status_active)
    "EXPIRED" -> stringResource(R.string.admin_subscriptions_status_expired)
    "CANCELED" -> stringResource(R.string.admin_subscriptions_status_canceled)
    "PENDING" -> stringResource(R.string.admin_subscriptions_status_pending)
    "NO_SUBSCRIPTION" -> stringResource(R.string.admin_subscriptions_status_no_subscription)
    else -> stringResource(R.string.admin_subscriptions_status_all)
}

@Composable
private fun SubscriptionRow(row: AdminSubscriptionRow, onView: () -> Unit) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(16.dp))
            .background(MaterialTheme.colorScheme.surfaceContainerLow)
            .padding(Spacing.md),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Row(modifier = Modifier.weight(1f), verticalAlignment = Alignment.CenterVertically) {
                Text(
                    text = "@${row.user.username}",
                    fontWeight = FontWeight.Bold,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    modifier = Modifier.weight(1f, fill = false),
                )
                VerifiedBadge(badgeType = row.user.badgeType, size = BadgeSize.small)
            }
            Text(
                text = subscriptionStatusLabel(row.status),
                style = MaterialTheme.typography.labelSmall,
                fontWeight = FontWeight.Bold,
                color = ZrpRed,
                modifier = Modifier
                    .clip(RoundedCornerShape(50))
                    .background(ZrpRed.copy(alpha = 0.12f))
                    .padding(horizontal = 8.dp, vertical = 2.dp),
            )
        }

        Row(modifier = Modifier.padding(top = Spacing.sm), verticalAlignment = Alignment.CenterVertically) {
            Text(
                text = adminPlanLabel(row.plan),
                style = MaterialTheme.typography.labelSmall,
                fontWeight = FontWeight.Bold,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier
                    .clip(RoundedCornerShape(50))
                    .background(MaterialTheme.colorScheme.surfaceVariant)
                    .padding(horizontal = 8.dp, vertical = 2.dp),
            )
            if (row.isLegacyBackfill) {
                Text(
                    text = stringResource(R.string.admin_subscriptions_legacy),
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.padding(start = Spacing.sm),
                )
            }
            if (row.needsReconciliation) {
                Text(
                    text = stringResource(R.string.admin_subscriptions_needs_reconciliation_badge),
                    style = MaterialTheme.typography.labelSmall,
                    fontWeight = FontWeight.Bold,
                    color = MaterialTheme.colorScheme.error,
                    modifier = Modifier.padding(start = Spacing.sm),
                )
            }
        }

        if (row.daysRemaining != null) {
            Text(
                text = "${stringResource(R.string.admin_subscriptions_days_left)}: ${row.daysRemaining}",
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.padding(top = 4.dp),
            )
        }
        row.lastPayment?.let { payment ->
            Text(
                text = "${stringResource(R.string.admin_subscriptions_last_payment)}: " +
                    "${payment.currency} ${formatMoney(payment.amount)}",
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.padding(top = 4.dp),
            )
        }

        TextButton(onClick = onView, modifier = Modifier.padding(top = Spacing.sm)) {
            Text(stringResource(R.string.admin_subscriptions_view))
        }
    }
}
