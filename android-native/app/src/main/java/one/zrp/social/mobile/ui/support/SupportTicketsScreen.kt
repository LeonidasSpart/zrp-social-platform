package one.zrp.social.mobile.ui.support

import android.widget.Toast
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
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
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
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
import one.zrp.social.mobile.data.SupportRepository
import one.zrp.social.mobile.network.SupportTicketSummary
import one.zrp.social.mobile.ui.theme.Spacing

/**
 * ZRP Support - ported from src/app/support/tickets/page.tsx: the
 * caller's own tickets, with a New Ticket entry point matching the
 * real page's own link to /support.
 */
@Composable
fun SupportTicketsScreen(onBack: () -> Unit, onOpenTicket: (String) -> Unit, onNewTicket: () -> Unit) {
    val viewModel: SupportTicketsViewModel = viewModel(
        factory = remember { SupportTicketsViewModelFactory(SupportRepository()) },
    )
    val state by viewModel.state.collectAsState()
    val context = LocalContext.current
    var pendingDeleteId by remember { mutableStateOf<String?>(null) }

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
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 8.dp, vertical = 4.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            IconButton(onClick = onBack) {
                Icon(Icons.Filled.ArrowBack, contentDescription = stringResource(R.string.nav_back))
            }
            Text(
                text = stringResource(R.string.support_tickets_page_title),
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.Bold,
                modifier = Modifier.weight(1f).padding(start = 4.dp),
            )
            OutlinedButton(onClick = onNewTicket) {
                Icon(Icons.Filled.Add, contentDescription = null, modifier = Modifier.size(16.dp))
                Text(stringResource(R.string.settings_new_ticket), modifier = Modifier.padding(start = 4.dp))
            }
        }

        if (state.isLoading) {
            Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                CircularProgressIndicator()
            }
        } else if (state.tickets.isEmpty()) {
            Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    Text(
                        text = stringResource(R.string.support_tickets_no_tickets),
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                    TextButton(onClick = onNewTicket) {
                        Text(stringResource(R.string.support_tickets_create_first) + " →")
                    }
                }
            }
        } else {
            LazyColumn(
                contentPadding = PaddingValues(Spacing.lg),
                verticalArrangement = Arrangement.spacedBy(Spacing.md),
            ) {
                items(state.tickets, key = { it.id }) { ticket ->
                    TicketRow(
                        ticket = ticket,
                        isDeleting = state.deletingId == ticket.id,
                        onClick = { onOpenTicket(ticket.id) },
                        onDelete = { pendingDeleteId = ticket.id },
                    )
                }
            }
        }
    }

    val deleteId = pendingDeleteId
    if (deleteId != null) {
        AlertDialog(
            onDismissRequest = { pendingDeleteId = null },
            title = { Text(stringResource(R.string.support_tickets_delete_button)) },
            text = { Text(stringResource(R.string.support_tickets_confirm_delete)) },
            confirmButton = {
                TextButton(onClick = { viewModel.deleteTicket(deleteId); pendingDeleteId = null }) {
                    Text(stringResource(R.string.support_tickets_delete_button), color = MaterialTheme.colorScheme.error)
                }
            },
            dismissButton = {
                TextButton(onClick = { pendingDeleteId = null }) {
                    Text(stringResource(android.R.string.cancel))
                }
            },
        )
    }
}

@Composable
private fun TicketRow(
    ticket: SupportTicketSummary,
    isDeleting: Boolean,
    onClick: () -> Unit,
    onDelete: () -> Unit,
) {
    val isDeletable = ticket.status == "RESOLVED" || ticket.status == "CLOSED"

    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(16.dp))
            .background(MaterialTheme.colorScheme.surfaceContainerLow)
            .clickable(onClick = onClick)
            .padding(Spacing.md),
    ) {
        Column(modifier = Modifier.weight(1f)) {
            Text(text = ticket.subject, fontWeight = FontWeight.Bold, maxLines = 1, overflow = TextOverflow.Ellipsis)
            Text(
                text = "${stringResource(R.string.support_tickets_category_prefix)} ${supportCategoryLabel(ticket.category)} · " +
                    "${stringResource(R.string.support_tickets_created_prefix)} ${formatTicketDate(ticket.createdAt)}",
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.padding(top = 2.dp),
            )
        }

        Column(horizontalAlignment = Alignment.End) {
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
                text = "${ticket._count.replies} ${stringResource(R.string.support_tickets_replies_suffix)}",
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.padding(top = 4.dp),
            )
            if (isDeletable) {
                if (isDeleting) {
                    CircularProgressIndicator(modifier = Modifier.size(16.dp).padding(top = 4.dp), strokeWidth = 2.dp)
                } else {
                    IconButton(onClick = onDelete, modifier = Modifier.size(28.dp)) {
                        Icon(
                            Icons.Filled.Delete,
                            contentDescription = stringResource(R.string.support_tickets_delete_button),
                            tint = MaterialTheme.colorScheme.error,
                            modifier = Modifier.size(16.dp),
                        )
                    }
                }
            }
        }
    }
}
