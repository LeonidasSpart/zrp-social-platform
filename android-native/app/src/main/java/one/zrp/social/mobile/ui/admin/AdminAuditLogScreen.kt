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
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.Search
import androidx.compose.material3.CircularProgressIndicator
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
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import one.zrp.social.mobile.R
import one.zrp.social.mobile.data.AdminRepository
import one.zrp.social.mobile.network.AdminAuditEntry
import one.zrp.social.mobile.ui.support.formatTicketDateTime
import one.zrp.social.mobile.ui.theme.Spacing
import one.zrp.social.mobile.ui.theme.ZrpRed

/**
 * The audit log viewer - see AdminAuditLogViewModel's own KDoc. Every
 * row shows exactly the columns the AuditLog model has: who acted,
 * what action was recorded, what it targeted, when, and the raw
 * metadata JSON for that action. There are no controls on a row: this
 * screen only reads a log that nothing is allowed to rewrite.
 */
@Composable
fun AdminAuditLogScreen(onBack: () -> Unit) {
    val viewModel: AdminAuditLogViewModel = viewModel(
        factory = remember { AdminAuditLogViewModelFactory(AdminRepository()) },
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
            Text(
                text = stringResource(R.string.admin_audit_title),
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.Bold,
                modifier = Modifier.weight(1f).padding(start = 4.dp),
            )
            IconButton(onClick = { viewModel.toggleFilters() }) {
                Icon(Icons.Filled.Search, contentDescription = stringResource(R.string.admin_audit_filters))
            }
        }

        Text(
            text = stringResource(R.string.admin_audit_subtitle),
            style = MaterialTheme.typography.labelSmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.padding(horizontal = Spacing.lg, vertical = Spacing.xs),
        )

        if (state.filtersExpanded) {
            AuditFilters(
                action = state.actionFilter,
                targetType = state.targetTypeFilter,
                targetId = state.targetIdFilter,
                onActionChange = { viewModel.setActionFilter(it) },
                onTargetTypeChange = { viewModel.setTargetTypeFilter(it) },
                onTargetIdChange = { viewModel.setTargetIdFilter(it) },
                onApply = { viewModel.applyFilters() },
                onClear = { viewModel.clearFilters() },
            )
        }

        if (state.isLoading) {
            Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                CircularProgressIndicator()
            }
        } else if (state.entries.isEmpty()) {
            Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                Text(
                    text = stringResource(R.string.admin_audit_no_entries),
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.padding(Spacing.lg),
                )
            }
        } else {
            LazyColumn(
                modifier = Modifier.weight(1f),
                contentPadding = PaddingValues(Spacing.lg),
                verticalArrangement = Arrangement.spacedBy(Spacing.md),
            ) {
                items(state.entries, key = { it.id }) { entry ->
                    AuditEntryRow(entry)
                }
                if (!state.endReached) {
                    item {
                        Box(modifier = Modifier.fillMaxWidth(), contentAlignment = Alignment.Center) {
                            if (state.isLoadingMore) {
                                CircularProgressIndicator(modifier = Modifier.size(20.dp), strokeWidth = 2.dp)
                            } else {
                                TextButton(onClick = { viewModel.loadMore() }) {
                                    Text(stringResource(R.string.admin_audit_load_more))
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun AuditFilters(
    action: String,
    targetType: String,
    targetId: String,
    onActionChange: (String) -> Unit,
    onTargetTypeChange: (String) -> Unit,
    onTargetIdChange: (String) -> Unit,
    onApply: () -> Unit,
    onClear: () -> Unit,
) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = Spacing.lg, vertical = Spacing.sm)
            .clip(RoundedCornerShape(16.dp))
            .background(MaterialTheme.colorScheme.surfaceContainerLow)
            .padding(Spacing.md),
    ) {
        // The route matches each of these exactly (Prisma equality, not
        // a contains/search), so the hints spell out real stored values
        // rather than suggesting a free-text search.
        OutlinedTextField(
            value = action,
            onValueChange = onActionChange,
            label = { Text(stringResource(R.string.admin_audit_filter_action)) },
            placeholder = { Text(stringResource(R.string.admin_audit_filter_action_placeholder)) },
            singleLine = true,
            keyboardOptions = KeyboardOptions(imeAction = ImeAction.Next),
            modifier = Modifier.fillMaxWidth(),
        )
        OutlinedTextField(
            value = targetType,
            onValueChange = onTargetTypeChange,
            label = { Text(stringResource(R.string.admin_audit_filter_target_type)) },
            placeholder = { Text(stringResource(R.string.admin_audit_filter_target_type_placeholder)) },
            singleLine = true,
            keyboardOptions = KeyboardOptions(imeAction = ImeAction.Next),
            modifier = Modifier.fillMaxWidth().padding(top = Spacing.sm),
        )
        OutlinedTextField(
            value = targetId,
            onValueChange = onTargetIdChange,
            label = { Text(stringResource(R.string.admin_audit_filter_target_id)) },
            singleLine = true,
            keyboardOptions = KeyboardOptions(imeAction = ImeAction.Search),
            keyboardActions = KeyboardActions(onSearch = { onApply() }),
            modifier = Modifier.fillMaxWidth().padding(top = Spacing.sm),
        )
        Row(modifier = Modifier.padding(top = Spacing.sm), horizontalArrangement = Arrangement.spacedBy(Spacing.sm)) {
            TextButton(onClick = onApply) {
                Text(stringResource(R.string.admin_audit_apply_filters), color = ZrpRed)
            }
            TextButton(onClick = onClear) { Text(stringResource(R.string.admin_audit_clear_filters)) }
        }
    }
}

@Composable
private fun AuditEntryRow(entry: AdminAuditEntry) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(16.dp))
            .background(MaterialTheme.colorScheme.surfaceContainerLow)
            .padding(Spacing.md),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text(
                text = entry.action,
                fontWeight = FontWeight.Bold,
                fontFamily = FontFamily.Monospace,
                style = MaterialTheme.typography.bodySmall,
                modifier = Modifier.weight(1f),
            )
            Text(
                text = formatTicketDateTime(entry.createdAt),
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }

        // actorUsername is nullable on the model (logAdminAction stores
        // null when the session carries no username), so the actor's id
        // - which is never null - is shown instead in that case.
        val actorUsername = entry.actorUsername
        Text(
            text = if (actorUsername != null) {
                stringResource(R.string.admin_audit_actor, actorUsername)
            } else {
                stringResource(R.string.admin_audit_actor_id, entry.actorId)
            },
            style = MaterialTheme.typography.labelSmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.padding(top = 4.dp),
        )

        // targetType/targetId are both optional and are written as a
        // pair, so the line only appears when there is a target at all.
        if (!entry.targetType.isNullOrBlank() || !entry.targetId.isNullOrBlank()) {
            Text(
                text = stringResource(
                    R.string.admin_audit_target,
                    entry.targetType.orEmpty(),
                    entry.targetId.orEmpty(),
                ).trim(),
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.padding(top = 2.dp),
            )
        }

        // Free-form JSON whose keys differ per action - shown as the
        // stored JSON rather than mapped onto invented field labels.
        val metadata = entry.metadata
        if (metadata != null && !metadata.isJsonNull) {
            Text(
                text = stringResource(R.string.admin_audit_metadata, metadata.toString()),
                style = MaterialTheme.typography.labelSmall,
                fontFamily = FontFamily.Monospace,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                maxLines = 4,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.padding(top = 4.dp),
            )
        }
    }
}
