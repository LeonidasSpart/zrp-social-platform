package one.zrp.social.mobile.ui.settings

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material.icons.filled.MoreVert
import androidx.compose.material.icons.filled.PersonAdd
import androidx.compose.material.icons.filled.PersonRemove
import androidx.compose.material.icons.filled.Shield
import androidx.compose.material.icons.filled.Star
import androidx.compose.material.icons.filled.Visibility
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import one.zrp.social.mobile.R
import one.zrp.social.mobile.data.TeamRepository
import one.zrp.social.mobile.network.TeamMember
import one.zrp.social.mobile.ui.components.Avatar
import one.zrp.social.mobile.ui.theme.Spacing
import one.zrp.social.mobile.ui.theme.ZrpBlue
import one.zrp.social.mobile.ui.theme.ZrpGreen
import one.zrp.social.mobile.ui.theme.ZrpRed
import one.zrp.social.mobile.util.formatRelativeTime

private val TeamOwnerColor = Color(0xFFF59E0B)

/**
 * Team Management (src/app/settings/team/page.tsx) - see TeamViewModel's
 * own KDoc for what's deliberately not reproduced natively (the
 * plan-upgrade CTA). The website's desktop table becomes a card list
 * here, the same restructuring every other settings/list screen in this
 * app already applies - the real columns (role/joined/actions) all
 * still show, just stacked instead of side by side.
 */
@Composable
fun TeamScreen(onBack: () -> Unit) {
    val viewModel: TeamViewModel = viewModel(factory = remember { TeamViewModelFactory(TeamRepository()) })
    val state by viewModel.state.collectAsState()

    Column(modifier = Modifier.fillMaxSize()) {
        Row(
            modifier = Modifier.fillMaxWidth().padding(horizontal = 8.dp, vertical = 4.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            IconButton(onClick = onBack) {
                Icon(Icons.Filled.ArrowBack, contentDescription = stringResource(R.string.nav_back))
            }
            Column(modifier = Modifier.padding(start = 4.dp)) {
                Text(text = stringResource(R.string.team_title), style = MaterialTheme.typography.titleMedium)
                Text(
                    text = stringResource(R.string.team_subtitle),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
        HorizontalDivider()

        state.toast?.let { toast ->
            ToastBanner(toast = toast, onDismiss = viewModel::dismissToast)
        }

        when {
            state.isLoading -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) { CircularProgressIndicator() }
            !state.isEligible -> IneligibleBody(message = state.ineligibleMessage)
            state.loadError != null -> Box(Modifier.fillMaxSize().padding(24.dp), contentAlignment = Alignment.Center) {
                Text(
                    text = state.loadError ?: stringResource(R.string.team_err_load_failed),
                    color = MaterialTheme.colorScheme.error,
                    textAlign = TextAlign.Center,
                )
            }
            else -> TeamBody(state = state, viewModel = viewModel)
        }
    }

    if (state.showAddDialog) {
        AddMemberDialog(state = state, viewModel = viewModel)
    }
    if (state.showRemoveDialog && state.removeTarget != null) {
        RemoveMemberDialog(target = state.removeTarget!!, viewModel = viewModel)
    }
}

@Composable
private fun ToastBanner(toast: TeamToast, onDismiss: () -> Unit) {
    val (title, description) = teamToastText(toast)
    val bg = if (toast.type == ToastType.SUCCESS) ZrpGreen.copy(alpha = 0.12f) else MaterialTheme.colorScheme.errorContainer
    val fg = if (toast.type == ToastType.SUCCESS) ZrpGreen else MaterialTheme.colorScheme.onErrorContainer

    Row(
        modifier = Modifier
            .fillMaxWidth()
            .background(bg)
            .padding(Spacing.md),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Column(modifier = Modifier.weight(1f)) {
            Text(text = title, color = fg, style = MaterialTheme.typography.bodyMedium)
            if (description != null) {
                Text(text = description, color = fg, style = MaterialTheme.typography.bodySmall)
            }
        }
        TextButton(onClick = onDismiss) { Text("×") }
    }
}

// Maps the ViewModel's semantic toast (a title key + a raw
// email/role/error string) onto the real translated strings - kept
// here rather than in the ViewModel since stringResource() only
// resolves inside a @Composable.
@Composable
private fun teamToastText(toast: TeamToast): Pair<String, String?> {
    return when (toast.title) {
        "memberAdded" -> stringResource(R.string.team_member_added_title) to
            toast.description?.let { stringResource(R.string.team_member_added_desc, it) }
        "roleUpdated" -> stringResource(R.string.team_role_updated_title) to
            toast.description?.let { stringResource(R.string.team_role_updated_desc, roleLabel(it)) }
        "memberRemoved" -> stringResource(R.string.team_member_removed_title) to
            toast.description?.let { stringResource(R.string.team_member_removed_desc, it) }
        // Matches the website's own showToast calls for failures: a
        // literal, untranslated "Error" title even in every other
        // language - the same real quirk this app mirrors elsewhere
        // rather than "fixing" web behavior it's meant to match.
        else -> "Error" to toast.description
    }
}

@Composable
private fun IneligibleBody(message: String?) {
    Column(
        modifier = Modifier.fillMaxSize().padding(32.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        Text(text = stringResource(R.string.team_upgrade_required), style = MaterialTheme.typography.titleLarge)
        Text(
            text = message ?: stringResource(R.string.team_upgrade_business_desc),
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            textAlign = TextAlign.Center,
            modifier = Modifier.padding(top = Spacing.sm),
        )
    }
}

@Composable
private fun TeamBody(state: TeamUiState, viewModel: TeamViewModel) {
    LazyColumn(modifier = Modifier.fillMaxSize().padding(Spacing.md)) {
        item {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Column {
                    Text(text = stringResource(R.string.team_team_members), style = MaterialTheme.typography.titleMedium)
                    Text(
                        text = stringResource(R.string.team_member_count, state.members.size, if (state.members.size != 1) "s" else ""),
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
                Button(onClick = viewModel::openAddDialog) {
                    Icon(Icons.Filled.PersonAdd, contentDescription = null, modifier = Modifier.padding(end = Spacing.xs))
                    Text(stringResource(R.string.team_add_member))
                }
            }
            Spacer(modifier = Modifier.height(Spacing.md))
        }

        state.owner?.let { owner ->
            item {
                MemberRow(
                    avatarUrl = owner.avatarUrl,
                    displayName = owner.name ?: owner.username,
                    username = owner.username,
                    email = owner.email,
                    role = "OWNER",
                    trailingText = stringResource(R.string.team_account_owner),
                    onChangeRole = null,
                    onRemove = null,
                )
                HorizontalDivider(modifier = Modifier.padding(vertical = Spacing.xs))
            }
        }

        if (state.members.isEmpty()) {
            item {
                Box(Modifier.fillMaxWidth().padding(Spacing.lg), contentAlignment = Alignment.Center) {
                    Text(
                        text = stringResource(R.string.team_no_members),
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }
        } else {
            items(state.members, key = { it.id }) { member ->
                MemberRow(
                    avatarUrl = member.user.avatarUrl,
                    displayName = member.user.name ?: member.user.username,
                    username = member.user.username,
                    email = member.user.email,
                    role = member.role,
                    trailingText = formatRelativeTime(member.createdAt),
                    onChangeRole = { role -> viewModel.updateMemberRole(member.id, role) },
                    onRemove = { viewModel.openRemoveDialog(member) },
                )
                HorizontalDivider(modifier = Modifier.padding(vertical = Spacing.xs))
            }
        }

        item {
            Spacer(modifier = Modifier.height(Spacing.lg))
            PlanInfoCard(state = state)
        }
    }
}

@Composable
private fun MemberRow(
    avatarUrl: String?,
    displayName: String,
    username: String,
    email: String,
    role: String,
    trailingText: String,
    onChangeRole: ((String) -> Unit)?,
    onRemove: (() -> Unit)?,
) {
    var menuOpen by remember { mutableStateOf(false) }

    Row(
        modifier = Modifier.fillMaxWidth().padding(vertical = Spacing.xs),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Avatar(url = avatarUrl, name = displayName, size = 40.dp)
        Column(modifier = Modifier.padding(start = Spacing.sm).weight(1f)) {
            Text(text = displayName, style = MaterialTheme.typography.bodyMedium)
            Text(text = "@$username", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            Text(text = email, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            RoleBadge(role = role)
        }
        Column(horizontalAlignment = Alignment.End) {
            Text(text = trailingText, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            if (onChangeRole != null && onRemove != null) {
                Box {
                    IconButton(onClick = { menuOpen = true }) {
                        Icon(Icons.Filled.MoreVert, contentDescription = stringResource(R.string.team_col_actions))
                    }
                    DropdownMenu(expanded = menuOpen, onDismissRequest = { menuOpen = false }) {
                        DropdownMenuItem(
                            text = { Text(stringResource(R.string.team_role_admin)) },
                            onClick = { menuOpen = false; onChangeRole("ADMIN") },
                        )
                        DropdownMenuItem(
                            text = { Text(stringResource(R.string.team_role_editor)) },
                            onClick = { menuOpen = false; onChangeRole("EDITOR") },
                        )
                        DropdownMenuItem(
                            text = { Text(stringResource(R.string.team_role_viewer)) },
                            onClick = { menuOpen = false; onChangeRole("VIEWER") },
                        )
                        HorizontalDivider()
                        DropdownMenuItem(
                            text = { Text(stringResource(R.string.team_remove), color = MaterialTheme.colorScheme.error) },
                            leadingIcon = { Icon(Icons.Filled.PersonRemove, contentDescription = null, tint = MaterialTheme.colorScheme.error) },
                            onClick = { menuOpen = false; onRemove() },
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun roleIcon(role: String): Pair<ImageVector, Color> = when (role) {
    "OWNER" -> Icons.Filled.Star to TeamOwnerColor
    "ADMIN" -> Icons.Filled.Shield to ZrpRed
    "EDITOR" -> Icons.Filled.Edit to ZrpBlue
    else -> Icons.Filled.Visibility to MaterialTheme.colorScheme.onSurfaceVariant
}

@Composable
private fun roleLabel(role: String): String = when (role) {
    "OWNER" -> stringResource(R.string.team_role_owner)
    "ADMIN" -> stringResource(R.string.team_role_admin)
    "EDITOR" -> stringResource(R.string.team_role_editor)
    else -> stringResource(R.string.team_role_viewer)
}

@Composable
private fun RoleBadge(role: String) {
    val (icon, color) = roleIcon(role)
    Row(
        modifier = Modifier
            .padding(top = Spacing.xs)
            .clip(RoundedCornerShape(50))
            .background(color.copy(alpha = 0.15f))
            .padding(horizontal = Spacing.sm, vertical = 2.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(icon, contentDescription = null, tint = color, modifier = Modifier.padding(end = 4.dp).width(14.dp).height(14.dp))
        Text(text = roleLabel(role), style = MaterialTheme.typography.labelSmall, color = color)
    }
}

@Composable
private fun PlanInfoCard(state: TeamUiState) {
    Column(modifier = Modifier.fillMaxWidth()) {
        Text(text = stringResource(R.string.team_plan_info), style = MaterialTheme.typography.titleMedium)
        Text(
            text = stringResource(R.string.team_plan_info_desc),
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Spacer(modifier = Modifier.height(Spacing.sm))
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .clip(RoundedCornerShape(8.dp))
                .background(MaterialTheme.colorScheme.surfaceVariant)
                .padding(Spacing.md),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Column {
                Text(text = stringResource(R.string.team_current_plan), style = MaterialTheme.typography.bodyMedium)
                Text(text = state.plan.replaceFirstChar { it.uppercase() }, style = MaterialTheme.typography.bodySmall)
            }
            Text(
                text = stringResource(R.string.team_team_enabled),
                color = ZrpGreen,
                style = MaterialTheme.typography.labelMedium,
            )
        }
        Spacer(modifier = Modifier.height(Spacing.sm))
        Text(text = stringResource(R.string.team_role_owner_desc), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        Text(text = stringResource(R.string.team_role_admin_desc), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        Text(text = stringResource(R.string.team_role_editor_desc), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        Text(text = stringResource(R.string.team_role_viewer_desc), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}

@Composable
private fun AddMemberDialog(state: TeamUiState, viewModel: TeamViewModel) {
    var roleMenuOpen by remember { mutableStateOf(false) }

    AlertDialog(
        onDismissRequest = viewModel::dismissAddDialog,
        title = { Text(stringResource(R.string.team_add_dialog_title)) },
        text = {
            Column {
                Text(text = stringResource(R.string.team_email_address), style = MaterialTheme.typography.labelMedium)
                OutlinedTextField(
                    value = state.newMemberEmail,
                    onValueChange = viewModel::onNewMemberEmailChange,
                    placeholder = { Text(stringResource(R.string.team_email_placeholder)) },
                    enabled = !state.isSubmitting,
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth(),
                )
                Spacer(modifier = Modifier.height(Spacing.md))
                Text(text = stringResource(R.string.team_role), style = MaterialTheme.typography.labelMedium)
                Box {
                    TextButton(onClick = { roleMenuOpen = true }, enabled = !state.isSubmitting) {
                        Text(roleLabel(state.newMemberRole))
                    }
                    DropdownMenu(expanded = roleMenuOpen, onDismissRequest = { roleMenuOpen = false }) {
                        listOf("ADMIN", "EDITOR", "VIEWER").forEach { role ->
                            DropdownMenuItem(
                                text = { Text(roleLabel(role)) },
                                onClick = { roleMenuOpen = false; viewModel.onNewMemberRoleChange(role) },
                            )
                        }
                    }
                }
            }
        },
        confirmButton = {
            TextButton(onClick = viewModel::addMember, enabled = !state.isSubmitting) {
                Text(if (state.isSubmitting) stringResource(R.string.team_adding) else stringResource(R.string.team_add_member))
            }
        },
        dismissButton = {
            TextButton(onClick = viewModel::dismissAddDialog, enabled = !state.isSubmitting) {
                Text(stringResource(R.string.team_cancel))
            }
        },
    )
}

@Composable
private fun RemoveMemberDialog(target: TeamMember, viewModel: TeamViewModel) {
    AlertDialog(
        onDismissRequest = viewModel::dismissRemoveDialog,
        title = { Text(stringResource(R.string.team_remove_dialog_title)) },
        text = { Text(stringResource(R.string.team_remove_confirm, target.user.email)) },
        confirmButton = {
            TextButton(onClick = viewModel::confirmRemoveMember) {
                Text(stringResource(R.string.team_remove), color = MaterialTheme.colorScheme.error)
            }
        },
        dismissButton = {
            TextButton(onClick = viewModel::dismissRemoveDialog) { Text(stringResource(R.string.team_cancel)) }
        },
    )
}
