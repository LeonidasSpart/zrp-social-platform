package one.zrp.social.mobile.ui.admin

import android.widget.Toast
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
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
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
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
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import one.zrp.social.mobile.R
import one.zrp.social.mobile.data.AdminRepository
import one.zrp.social.mobile.network.AdminSupportStats
import one.zrp.social.mobile.network.AdminSupportTicket
import one.zrp.social.mobile.ui.support.formatTicketDate
import one.zrp.social.mobile.ui.support.supportCategoryLabel
import one.zrp.social.mobile.ui.support.supportPriorityLabel
import one.zrp.social.mobile.ui.support.supportStatusColor
import one.zrp.social.mobile.ui.support.supportStatusLabel
import one.zrp.social.mobile.ui.theme.Spacing
import one.zrp.social.mobile.ui.theme.ZrpRed

// "" is the website's own empty <select> option (= no filter), the rest
// are the exact wire values the PUT route validates against.
private val STATUS_FILTERS = listOf("", "OPEN", "IN_PROGRESS", "AWAITING_REPLY", "RESOLVED", "CLOSED")
private val PRIORITY_FILTERS = listOf("", "LOW", "NORMAL", "HIGH", "URGENT")

/** Ported from the admin support page's own priorityColors record. */
fun adminTicketPriorityColor(priority: String): Color = when (priority) {
    "LOW" -> Color(0xFF9CA3AF)
    "NORMAL" -> Color(0xFF60A5FA)
    "HIGH" -> Color(0xFFFB923C)
    "URGENT" -> ZrpRed
    else -> Color(0xFF9CA3AF)
}

/**
 * Ported from src/app/admin/support/page.tsx - every user's support
 * ticket, not the caller's own (that's ui/support/SupportTicketsScreen).
 * See AdminSupportTicketsViewModel's own KDoc for why this one screen is
 * full-ADMIN-only rather than staff-wide.
 */
@Composable
fun AdminSupportTicketsScreen(isAdmin: Boolean, onBack: () -> Unit, onOpenTicket: (String) -> Unit) {
    val viewModel: AdminSupportTicketsViewModel = viewModel(
        factory = remember { AdminSupportTicketsViewModelFactory(AdminRepository()) },
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
                text = stringResource(R.string.admin_support_title),
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

        val stats = state.stats
        if (stats != null) {
            StatsRow(stats)
        }

        Row(
            modifier = Modifier
                .fillMaxWidth()
                .horizontalScroll(rememberScrollState())
                .padding(horizontal = Spacing.lg),
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
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .horizontalScroll(rememberScrollState())
                .padding(horizontal = Spacing.lg, vertical = Spacing.sm),
            horizontalArrangement = Arrangement.spacedBy(Spacing.sm),
        ) {
            PRIORITY_FILTERS.forEach { priority ->
                FilterChip(
                    selected = state.priorityFilter == priority,
                    onClick = { viewModel.setPriorityFilter(priority) },
                    label = { Text(priorityFilterLabel(priority)) },
                )
            }
        }

        if (state.isLoading) {
            Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                CircularProgressIndicator()
            }
        } else if (state.tickets.isEmpty()) {
            Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                Text(
                    text = stringResource(R.string.admin_support_no_tickets),
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        } else {
            LazyColumn(
                modifier = Modifier.weight(1f),
                contentPadding = PaddingValues(Spacing.lg),
                verticalArrangement = Arrangement.spacedBy(Spacing.md),
            ) {
                items(state.tickets, key = { it.id }) { ticket ->
                    AdminTicketRow(ticket = ticket, onClick = { onOpenTicket(ticket.id) })
                }
            }

            if (state.totalPages > 1) {
                Row(
                    modifier = Modifier.fillMaxWidth().padding(Spacing.md),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    TextButton(onClick = { viewModel.setPage(state.page - 1) }, enabled = state.page > 1) {
                        Text(stringResource(R.string.admin_support_previous))
                    }
                    Text(
                        text = stringResource(R.string.admin_support_page_of, state.page, state.totalPages),
                        style = MaterialTheme.typography.labelMedium,
                    )
                    TextButton(onClick = { viewModel.setPage(state.page + 1) }, enabled = state.page < state.totalPages) {
                        Text(stringResource(R.string.admin_support_next))
                    }
                }
            }
        }
    }
}

@Composable
private fun StatsRow(stats: AdminSupportStats) {
    val cards = listOf(
        stringResource(R.string.support_tickets_status_open) to stats.open,
        stringResource(R.string.support_tickets_status_in_progress) to stats.inProgress,
        stringResource(R.string.support_tickets_status_awaiting_reply) to stats.awaitingReply,
        stringResource(R.string.support_tickets_status_resolved) to stats.resolved,
        stringResource(R.string.admin_support_stat_total) to stats.total,
    )
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .horizontalScroll(rememberScrollState())
            .padding(horizontal = Spacing.lg, vertical = Spacing.sm),
        horizontalArrangement = Arrangement.spacedBy(Spacing.md),
    ) {
        cards.forEach { (label, value) ->
            Column(
                modifier = Modifier
                    .clip(RoundedCornerShape(16.dp))
                    .background(MaterialTheme.colorScheme.surfaceContainerLow)
                    .padding(horizontal = Spacing.md, vertical = Spacing.sm),
            ) {
                Text(
                    text = value.toString(),
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.Bold,
                    color = ZrpRed,
                )
                Text(
                    text = label,
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
    }
}

@Composable
private fun statusFilterLabel(status: String): String =
    if (status.isEmpty()) stringResource(R.string.admin_support_all_status) else supportStatusLabel(status)

@Composable
private fun priorityFilterLabel(priority: String): String =
    if (priority.isEmpty()) stringResource(R.string.admin_support_all_priority) else supportPriorityLabel(priority)

@Composable
private fun AdminTicketRow(ticket: AdminSupportTicket, onClick: () -> Unit) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(16.dp))
            .background(MaterialTheme.colorScheme.surfaceContainerLow)
            .clickable(onClick = onClick)
            .padding(Spacing.md),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text(
                text = ticket.subject,
                fontWeight = FontWeight.Bold,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.weight(1f),
            )
            Text(
                text = supportStatusLabel(ticket.status),
                style = MaterialTheme.typography.labelSmall,
                fontWeight = FontWeight.Bold,
                color = supportStatusColor(ticket.status),
                modifier = Modifier
                    .padding(start = Spacing.sm)
                    .clip(RoundedCornerShape(50))
                    .background(supportStatusColor(ticket.status).copy(alpha = 0.12f))
                    .padding(horizontal = 8.dp, vertical = 2.dp),
            )
        }

        Row(modifier = Modifier.padding(top = 4.dp), verticalAlignment = Alignment.CenterVertically) {
            Text(
                text = "@${ticket.user.username}" + (ticket.user.plan?.let { " · $it" } ?: ""),
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.weight(1f),
            )
            Text(
                text = supportPriorityLabel(ticket.priority),
                style = MaterialTheme.typography.labelSmall,
                fontWeight = FontWeight.Bold,
                color = adminTicketPriorityColor(ticket.priority),
            )
        }

        Text(
            text = "${supportCategoryLabel(ticket.category)} · ${formatTicketDate(ticket.createdAt)} · " +
                "${ticket._count.replies} ${stringResource(R.string.support_tickets_replies_suffix)}",
            style = MaterialTheme.typography.labelSmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.padding(top = 2.dp),
        )

        Text(
            text = stringResource(
                R.string.admin_support_assigned_to,
                ticket.assignedAdmin?.username ?: stringResource(R.string.admin_support_unassigned),
            ),
            style = MaterialTheme.typography.labelSmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.padding(top = 2.dp),
        )
    }
}
