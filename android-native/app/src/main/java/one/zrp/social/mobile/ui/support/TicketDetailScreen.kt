package one.zrp.social.mobile.ui.support

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import one.zrp.social.mobile.R
import one.zrp.social.mobile.data.SupportRepository
import one.zrp.social.mobile.network.SupportReply
import one.zrp.social.mobile.network.SupportTicketDetail
import one.zrp.social.mobile.ui.theme.Spacing
import one.zrp.social.mobile.ui.theme.ZrpRed

/**
 * ZRP Support - ported from src/app/support/tickets/[id]/page.tsx.
 * See TicketDetailViewModel's own KDoc for the reply-gating behavior.
 * Every reply (including admin-only internal notes, styled with the
 * same yellow "Internal Note" badge) is shown exactly as the real
 * route returns it - the route itself doesn't filter isInternal
 * replies out of a regular owner's own view, so this doesn't either.
 *
 * support_detail_back_to_tickets stays a real, extracted, but
 * deliberately unused translation - the website shows it as its own
 * "← Back to My Tickets" text link inside the body, in addition to
 * having no header back arrow at all; this screen already has the
 * standard top-bar back arrow every other detail screen in this app
 * uses (Journalist, Creator, Trust Passport), so a second, redundant
 * back affordance isn't added just to use this string.
 * support_detail_err_reply_failed is likewise real but unreachable:
 * it's web's own fallback for an empty `error.error`, but the real
 * reply route (src/app/api/support/tickets/[id]/reply/route.ts)
 * always returns a real message on every failure path it has.
 */
@Composable
fun TicketDetailScreen(ticketId: String, onBack: () -> Unit) {
    val viewModel: TicketDetailViewModel = viewModel(
        factory = remember { TicketDetailViewModelFactory(ticketId, SupportRepository()) },
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
                Icon(Icons.Filled.ArrowBack, contentDescription = "Back")
            }
            Text(
                text = state.ticket?.subject ?: stringResource(R.string.support_tickets_page_title),
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.Bold,
                maxLines = 1,
                modifier = Modifier.padding(start = 4.dp),
            )
        }
        HorizontalDivider()

        when {
            state.isLoading -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) { CircularProgressIndicator() }
            state.notFound || state.ticket == null -> Box(Modifier.fillMaxSize().padding(Spacing.xl), contentAlignment = Alignment.Center) {
                Text(stringResource(R.string.support_detail_not_found), color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            else -> TicketDetailBody(ticket = state.ticket!!, state = state, viewModel = viewModel)
        }
    }
}

@Composable
private fun TicketDetailBody(ticket: SupportTicketDetail, state: TicketDetailUiState, viewModel: TicketDetailViewModel) {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(Spacing.lg),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text(
                text = stringResource(R.string.support_detail_status_label),
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.padding(end = 6.dp),
            )
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
        }
        Text(
            text = "${stringResource(R.string.support_detail_priority_label)} ${supportPriorityLabel(ticket.priority)}  ·  " +
                "${stringResource(R.string.support_detail_category_label)} ${supportCategoryLabel(ticket.category)}",
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.padding(top = Spacing.sm),
        )
        Text(
            text = "${stringResource(R.string.support_detail_created_label)} ${formatTicketDateTime(ticket.createdAt)}",
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.padding(top = 2.dp),
        )

        Surface(
            shape = RoundedCornerShape(12.dp),
            color = MaterialTheme.colorScheme.surfaceContainerLow,
            modifier = Modifier.fillMaxWidth().padding(top = Spacing.lg),
        ) {
            Column(modifier = Modifier.padding(Spacing.md)) {
                UserLine(username = ticket.user.username, dateTime = formatTicketDateTime(ticket.createdAt))
                Text(
                    text = ticket.message,
                    style = MaterialTheme.typography.bodyMedium,
                    modifier = Modifier.padding(top = Spacing.sm),
                )
            }
        }

        ticket.replies.forEach { reply ->
            ReplyCard(reply)
        }

        when {
            ticket.status != "CLOSED" && ticket.status != "RESOLVED" -> {
                Surface(
                    shape = RoundedCornerShape(12.dp),
                    color = MaterialTheme.colorScheme.surfaceContainerLow,
                    modifier = Modifier.fillMaxWidth().padding(top = Spacing.lg),
                ) {
                    Column(modifier = Modifier.padding(Spacing.md)) {
                        OutlinedTextField(
                            value = state.replyMessage,
                            onValueChange = viewModel::onReplyMessageChange,
                            placeholder = { Text(stringResource(R.string.support_detail_reply_placeholder)) },
                            enabled = !state.isSending,
                            minLines = 4,
                            modifier = Modifier.fillMaxWidth(),
                        )
                        if (state.error != null) {
                            Text(
                                text = state.error ?: "",
                                color = MaterialTheme.colorScheme.error,
                                style = MaterialTheme.typography.bodySmall,
                                modifier = Modifier.padding(top = Spacing.sm),
                            )
                        }
                        Row(modifier = Modifier.fillMaxWidth().padding(top = Spacing.sm), horizontalArrangement = Arrangement.End) {
                            Button(
                                onClick = { viewModel.sendReply() },
                                enabled = state.replyMessage.isNotBlank() && !state.isSending,
                            ) {
                                if (state.isSending) {
                                    CircularProgressIndicator(modifier = Modifier.size(18.dp), strokeWidth = 2.dp)
                                    Text(stringResource(R.string.support_detail_sending), modifier = Modifier.padding(start = 6.dp))
                                } else {
                                    Text(stringResource(R.string.support_detail_send_reply))
                                }
                            }
                        }
                    }
                }
            }
            ticket.status == "RESOLVED" -> NoticeBanner(
                text = stringResource(R.string.support_detail_resolved_notice),
                color = Color(0xFF15803D),
            )
            ticket.status == "CLOSED" -> NoticeBanner(
                text = stringResource(R.string.support_detail_closed_notice),
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
}

@Composable
private fun UserLine(username: String, dateTime: String) {
    Row(verticalAlignment = Alignment.CenterVertically) {
        InitialAvatar(username)
        Text(text = username, fontWeight = FontWeight.Bold, modifier = Modifier.padding(start = Spacing.sm))
        Text(
            text = dateTime,
            style = MaterialTheme.typography.labelSmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.padding(start = Spacing.sm),
        )
    }
}

@Composable
private fun InitialAvatar(username: String) {
    Surface(shape = CircleShape, color = ZrpRed.copy(alpha = 0.2f)) {
        Box(modifier = Modifier.size(32.dp), contentAlignment = Alignment.Center) {
            Text(
                text = username.take(1).uppercase(),
                color = ZrpRed,
                fontWeight = FontWeight.Bold,
                style = MaterialTheme.typography.labelMedium,
            )
        }
    }
}

@Composable
private fun ReplyCard(reply: SupportReply) {
    Surface(
        shape = RoundedCornerShape(12.dp),
        color = if (reply.isInternal) {
            Color(0xFFFEF9C3)
        } else {
            MaterialTheme.colorScheme.surfaceContainerLow
        },
        modifier = Modifier.fillMaxWidth().padding(top = Spacing.md),
    ) {
        Column(modifier = Modifier.padding(Spacing.md)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                InitialAvatar(reply.user.username)
                Text(text = reply.user.username, fontWeight = FontWeight.Bold, modifier = Modifier.padding(start = Spacing.sm))
                if (reply.user.role == "ADMIN") {
                    Text(
                        text = "(${stringResource(R.string.support_detail_support_badge)})",
                        style = MaterialTheme.typography.labelSmall,
                        color = ZrpRed,
                        modifier = Modifier.padding(start = 4.dp),
                    )
                }
                if (reply.isInternal) {
                    Text(
                        text = stringResource(R.string.support_detail_internal_note),
                        style = MaterialTheme.typography.labelSmall,
                        modifier = Modifier
                            .padding(start = 4.dp)
                            .clip(RoundedCornerShape(4.dp))
                            .background(Color(0xFFFDE68A))
                            .padding(horizontal = 6.dp, vertical = 2.dp),
                    )
                }
                Text(
                    text = formatTicketDateTime(reply.createdAt),
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.padding(start = Spacing.sm),
                )
            }
            Text(
                text = reply.message,
                style = MaterialTheme.typography.bodyMedium,
                modifier = Modifier.padding(top = Spacing.sm),
            )
        }
    }
}

@Composable
private fun NoticeBanner(text: String, color: Color) {
    Surface(
        shape = RoundedCornerShape(12.dp),
        color = color.copy(alpha = 0.12f),
        modifier = Modifier.fillMaxWidth().padding(top = Spacing.lg),
    ) {
        Text(
            text = text,
            color = color,
            style = MaterialTheme.typography.bodyMedium,
            textAlign = TextAlign.Center,
            modifier = Modifier.fillMaxWidth().padding(Spacing.md),
        )
    }
}
