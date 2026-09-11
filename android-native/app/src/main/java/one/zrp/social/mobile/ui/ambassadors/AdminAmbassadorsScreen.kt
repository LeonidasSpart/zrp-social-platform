package one.zrp.social.mobile.ui.ambassadors

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
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.Search
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
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import one.zrp.social.mobile.R
import one.zrp.social.mobile.data.AmbassadorsRepository
import one.zrp.social.mobile.network.AdminAmbassadorProfile
import one.zrp.social.mobile.ui.theme.Spacing
import one.zrp.social.mobile.ui.theme.ZrpRed

// The real UPPERCASE AmbassadorStatus values, in the same tab order as
// the website's own admin page - "" is its All tab.
private val STATUS_FILTERS = listOf("PENDING", "APPROVED", "SUSPENDED", "REJECTED", "")

/**
 * Ported from src/app/admin/ambassadors/page.tsx - deliberately mirrors
 * AdminJournalistsScreen (tabs, search, card list, confirm/reason
 * dialogs for destructive actions) the same way the web page mirrors
 * /admin/journalists, reusing the same review workflow rather than
 * reinventing it. See AdminAmbassadorsViewModel's own KDoc for the
 * exact status transitions this reflects.
 */
@Composable
fun AdminAmbassadorsScreen(onBack: () -> Unit) {
    val viewModel: AdminAmbassadorsViewModel = viewModel(
        factory = remember { AdminAmbassadorsViewModelFactory(AmbassadorsRepository()) },
    )
    val state by viewModel.state.collectAsState()
    val context = LocalContext.current

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
            modifier = Modifier.fillMaxWidth().padding(horizontal = 8.dp, vertical = 4.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            IconButton(onClick = onBack) {
                Icon(Icons.Filled.ArrowBack, contentDescription = stringResource(R.string.nav_back))
            }
            Column(modifier = Modifier.padding(start = 4.dp)) {
                Text(
                    text = stringResource(R.string.ambassadors_admin_title),
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.Bold,
                )
                Text(
                    text = stringResource(R.string.ambassadors_admin_subtitle),
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }

        OutlinedTextField(
            value = state.search,
            onValueChange = { viewModel.setSearch(it) },
            placeholder = { Text(stringResource(R.string.admin_journalists_search_placeholder)) },
            leadingIcon = { Icon(Icons.Filled.Search, contentDescription = null) },
            singleLine = true,
            keyboardOptions = KeyboardOptions(imeAction = ImeAction.Search),
            keyboardActions = KeyboardActions(onSearch = { viewModel.submitSearch() }),
            modifier = Modifier.fillMaxWidth().padding(horizontal = Spacing.lg, vertical = Spacing.sm),
        )

        Row(
            modifier = Modifier
                .fillMaxWidth()
                .horizontalScroll(rememberScrollState())
                .padding(horizontal = Spacing.lg, vertical = Spacing.sm),
            horizontalArrangement = Arrangement.spacedBy(Spacing.sm),
        ) {
            STATUS_FILTERS.forEach { status ->
                val count = state.counts[status]
                val label = ambassadorStatusLabel(status)
                FilterChip(
                    selected = state.statusFilter == status,
                    onClick = { viewModel.setStatusFilter(status) },
                    label = { Text(if (count != null) "$label ($count)" else label) },
                )
            }
        }

        if (state.isLoading) {
            Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                CircularProgressIndicator()
            }
        } else if (state.profiles.isEmpty()) {
            Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                Text(
                    text = stringResource(R.string.ambassadors_admin_no_applications),
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        } else {
            LazyColumn(
                modifier = Modifier.weight(1f),
                contentPadding = PaddingValues(Spacing.lg),
                verticalArrangement = Arrangement.spacedBy(Spacing.md),
            ) {
                items(state.profiles, key = { it.id }) { profile ->
                    AmbassadorRow(
                        profile = profile,
                        isBusy = state.busyUserId == profile.user.id,
                        onAction = { action -> viewModel.requestAction(profile.user.id, action) },
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

    val confirmAction = state.confirmAction
    if (state.confirmUserId != null && confirmAction != null) {
        AlertDialog(
            onDismissRequest = { viewModel.cancelConfirm() },
            title = { Text(ambassadorActionLabel(confirmAction)) },
            text = {
                Text(
                    if (confirmAction == "restore") {
                        stringResource(R.string.ambassadors_admin_confirm_restore)
                    } else {
                        stringResource(R.string.ambassadors_admin_confirm_approve)
                    },
                )
            },
            confirmButton = {
                TextButton(onClick = { viewModel.confirmAction() }) {
                    Text(stringResource(R.string.admin_reports_confirm_action), color = ZrpRed)
                }
            },
            dismissButton = {
                TextButton(onClick = { viewModel.cancelConfirm() }) {
                    Text(stringResource(R.string.admin_reports_cancel))
                }
            },
        )
    }

    val reasonAction = state.reasonModalAction
    if (state.reasonModalUserId != null && reasonAction != null) {
        AmbassadorReasonDialog(
            action = reasonAction,
            onDismiss = { viewModel.cancelReasonModal() },
            onConfirm = { reason -> viewModel.submitReasonAction(reason) },
        )
    }
}

@Composable
private fun ambassadorStatusLabel(status: String): String = when (status) {
    "PENDING" -> stringResource(R.string.admin_journalists_status_pending)
    "APPROVED" -> stringResource(R.string.ambassadors_admin_status_approved)
    "SUSPENDED" -> stringResource(R.string.admin_journalists_status_suspended)
    "REJECTED" -> stringResource(R.string.admin_journalists_status_rejected)
    else -> stringResource(R.string.admin_reports_all)
}

@Composable
private fun ambassadorActionLabel(action: String): String = when (action) {
    "approve" -> stringResource(R.string.admin_review_approve)
    "reject" -> stringResource(R.string.admin_review_reject)
    "suspend" -> stringResource(R.string.admin_journalists_suspend)
    else -> stringResource(R.string.admin_journalists_restore)
}

@Composable
private fun AmbassadorRow(
    profile: AdminAmbassadorProfile,
    isBusy: Boolean,
    onAction: (String) -> Unit,
) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(16.dp))
            .background(MaterialTheme.colorScheme.surfaceContainerLow)
            .padding(Spacing.md),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Column(modifier = Modifier.weight(1f)) {
                Text(text = profile.user.name ?: profile.user.username, fontWeight = FontWeight.Bold)
                Text(
                    text = "@${profile.user.username}",
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            Text(
                text = ambassadorStatusLabel(profile.status),
                style = MaterialTheme.typography.labelSmall,
                fontWeight = FontWeight.Bold,
                color = ZrpRed,
                modifier = Modifier
                    .clip(RoundedCornerShape(50))
                    .background(ZrpRed.copy(alpha = 0.12f))
                    .padding(horizontal = 8.dp, vertical = 2.dp),
            )
        }

        Row(modifier = Modifier.padding(top = 4.dp), verticalAlignment = Alignment.CenterVertically) {
            Text(text = flagEmoji(profile.countryCode), style = MaterialTheme.typography.bodyMedium)
            Text(
                text = stringResource(R.string.ambassadors_admin_country_label, profile.countryName),
                style = MaterialTheme.typography.bodySmall,
                modifier = Modifier.padding(start = 4.dp),
            )
        }

        if (profile.audienceSize != null) {
            Text(
                text = stringResource(R.string.ambassadors_admin_audience_label, profile.audienceSize),
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.padding(top = 2.dp),
            )
        }

        Text(
            text = stringResource(R.string.ambassadors_admin_motivation_label),
            style = MaterialTheme.typography.labelSmall,
            fontWeight = FontWeight.Bold,
            modifier = Modifier.padding(top = 4.dp),
        )
        Text(
            text = profile.motivation,
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            maxLines = 3,
            overflow = TextOverflow.Ellipsis,
        )

        if (profile.status == "REJECTED" && !profile.rejectionReason.isNullOrBlank()) {
            Text(
                text = stringResource(R.string.admin_review_reason_label, profile.rejectionReason),
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.error,
                modifier = Modifier.padding(top = 4.dp),
            )
        }
        if (profile.status == "SUSPENDED" && !profile.suspensionReason.isNullOrBlank()) {
            Text(
                text = stringResource(R.string.admin_review_reason_label, profile.suspensionReason),
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.error,
                modifier = Modifier.padding(top = 4.dp),
            )
        }

        if (isBusy) {
            CircularProgressIndicator(modifier = Modifier.padding(top = Spacing.sm).size(20.dp), strokeWidth = 2.dp)
        } else {
            Row(modifier = Modifier.padding(top = Spacing.sm), horizontalArrangement = Arrangement.spacedBy(Spacing.sm)) {
                when (profile.status) {
                    "PENDING" -> {
                        TextButton(onClick = { onAction("approve") }) {
                            Text(stringResource(R.string.admin_review_approve))
                        }
                        TextButton(onClick = { onAction("reject") }) {
                            Text(stringResource(R.string.admin_review_reject), color = ZrpRed)
                        }
                    }
                    "APPROVED" -> {
                        TextButton(onClick = { onAction("suspend") }) {
                            Text(stringResource(R.string.admin_journalists_suspend), color = ZrpRed)
                        }
                    }
                    "SUSPENDED" -> {
                        TextButton(onClick = { onAction("restore") }) {
                            Text(stringResource(R.string.admin_journalists_restore))
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun AmbassadorReasonDialog(
    action: String,
    onDismiss: () -> Unit,
    onConfirm: (reason: String) -> Unit,
) {
    var reason by remember { mutableStateOf("") }
    val label = when (action) {
        "reject" -> stringResource(R.string.admin_journalists_reject_reason)
        else -> stringResource(R.string.ambassadors_admin_prompt_suspend_reason)
    }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(ambassadorActionLabel(action)) },
        text = {
            OutlinedTextField(
                value = reason,
                onValueChange = { reason = it },
                label = { Text(label) },
                placeholder = { Text(stringResource(R.string.admin_reports_note_placeholder)) },
                modifier = Modifier.fillMaxWidth(),
            )
        },
        confirmButton = {
            TextButton(onClick = { onConfirm(reason) }) {
                Text(stringResource(R.string.admin_reports_confirm_action), color = ZrpRed)
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) { Text(stringResource(R.string.admin_reports_cancel)) }
        },
    )
}
