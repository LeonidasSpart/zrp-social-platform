package one.zrp.social.mobile.ui.admin

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
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Search
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
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
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import one.zrp.social.mobile.R
import one.zrp.social.mobile.data.AdminRepository
import one.zrp.social.mobile.network.AdminUser
import one.zrp.social.mobile.ui.components.BadgeSize
import one.zrp.social.mobile.ui.components.VerifiedBadge
import one.zrp.social.mobile.ui.theme.Spacing
import one.zrp.social.mobile.ui.theme.ZrpRed
import one.zrp.social.mobile.util.localizedError

private val ROLE_FILTERS = listOf("ALL", "USER", "MODERATOR", "ADMIN")
private val STATUS_FILTERS = listOf("ALL", "ACTIVE", "BANNED")
private val ASSIGNABLE_ROLES = listOf("USER", "MODERATOR", "ADMIN")

// Matches web's own BADGE_OPTIONS in src/app/admin/users/page.tsx
// exactly: null/"" (clear) plus the four badge types this generic route
// is meant to be used for. "journalist" is a real, server-accepted
// badgeType value too (VALID_BADGE_TYPES on the route includes it), but
// the website's own dropdown deliberately never offers it here - a
// journalist badge is only ever meant to be set together with a
// JournalistProfile row via the dedicated Journalists grant flow (see
// the route's own comment), so this list matches the website's actual
// selectable options, not just what the route would technically accept.
private val ASSIGNABLE_BADGES: List<String?> = listOf(null, "verified", "organization", "government", "team")

/**
 * Ported from src/app/admin/users/page.tsx. isAdmin gates the
 * role-change, plan-change and delete controls - see
 * AdminUsersViewModel's own KDoc for why that's a UI-only convenience,
 * not the real authorization boundary.
 */
@Composable
fun AdminUsersScreen(isAdmin: Boolean, onBack: () -> Unit, onOpenProfile: (String) -> Unit) {
    val viewModel: AdminUsersViewModel = viewModel(
        factory = remember { AdminUsersViewModelFactory(AdminRepository()) },
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
                text = stringResource(R.string.admin_users_title),
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.Bold,
                modifier = Modifier.padding(start = 4.dp),
            )
        }

        OutlinedTextField(
            value = state.search,
            onValueChange = { viewModel.setSearch(it) },
            placeholder = { Text(stringResource(R.string.admin_users_search_placeholder)) },
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
            ROLE_FILTERS.forEach { role ->
                FilterChip(selected = state.roleFilter == role, onClick = { viewModel.setRoleFilter(role) }, label = { Text(roleFilterLabel(role)) })
            }
        }
        Row(
            modifier = Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()).padding(horizontal = Spacing.lg, vertical = Spacing.sm),
            horizontalArrangement = Arrangement.spacedBy(Spacing.sm),
        ) {
            STATUS_FILTERS.forEach { status ->
                FilterChip(selected = state.statusFilter == status, onClick = { viewModel.setStatusFilter(status) }, label = { Text(statusFilterLabel(status)) })
            }
        }

        if (state.isLoading) {
            Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                CircularProgressIndicator()
            }
        } else if (state.users.isEmpty()) {
            Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                Text(text = stringResource(R.string.admin_users_no_match), color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        } else {
            LazyColumn(
                modifier = Modifier.weight(1f),
                contentPadding = PaddingValues(Spacing.lg),
                verticalArrangement = Arrangement.spacedBy(Spacing.md),
            ) {
                items(state.users, key = { it.id }) { user ->
                    UserRow(
                        user = user,
                        isAdmin = isAdmin,
                        isBusy = state.busyUserId == user.id,
                        onToggleBan = { viewModel.toggleBan(user.id) },
                        onChangeRole = { role -> viewModel.changeRole(user.id, role) },
                        onChangePlan = { plan -> viewModel.requestPlanChange(user.id, plan) },
                        onChangeBadge = { badgeType -> viewModel.changeBadge(user.id, badgeType) },
                        onDelete = { viewModel.requestDelete(user.id) },
                        onOpenProfile = onOpenProfile,
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

    // A plan change grants (or takes away) paid access on its own, with
    // no payment or upgrade request behind it, so it confirms first -
    // naming the user and the plan, the same way the payments and
    // upgrade-request queues do.
    val pendingPlan = state.pendingPlan
    val pendingPlanUser = state.pendingPlanUserId?.let { id -> state.users.firstOrNull { it.id == id } }
    if (pendingPlan != null && pendingPlanUser != null) {
        AlertDialog(
            onDismissRequest = { viewModel.cancelPlanChange() },
            title = { Text(stringResource(R.string.admin_users_change_plan)) },
            text = {
                Text(
                    stringResource(
                        R.string.admin_users_plan_confirm,
                        pendingPlanUser.username,
                        adminPlanLabel(pendingPlan),
                    ),
                )
            },
            confirmButton = {
                TextButton(onClick = { viewModel.confirmPlanChange() }) {
                    Text(stringResource(R.string.admin_users_change_plan), color = ZrpRed)
                }
            },
            dismissButton = {
                TextButton(onClick = { viewModel.cancelPlanChange() }) {
                    Text(stringResource(android.R.string.cancel))
                }
            },
        )
    }

    val deleteId = state.pendingDeleteId
    if (deleteId != null) {
        AlertDialog(
            onDismissRequest = { viewModel.cancelDelete() },
            title = { Text(stringResource(R.string.admin_users_delete)) },
            text = { Text(stringResource(R.string.admin_users_delete_confirm)) },
            confirmButton = {
                TextButton(onClick = { viewModel.confirmDelete() }) {
                    Text(stringResource(R.string.admin_users_delete), color = MaterialTheme.colorScheme.error)
                }
            },
            dismissButton = {
                TextButton(onClick = { viewModel.cancelDelete() }) { Text(stringResource(android.R.string.cancel)) }
            },
        )
    }
}

@Composable
private fun roleFilterLabel(role: String): String = when (role) {
    "USER" -> stringResource(R.string.admin_users_role_user)
    "MODERATOR" -> stringResource(R.string.admin_users_role_moderator)
    "ADMIN" -> stringResource(R.string.admin_users_role_admin)
    else -> stringResource(R.string.admin_users_all_roles)
}

@Composable
private fun adminBadgeLabel(badgeType: String?): String = when (badgeType) {
    "verified" -> stringResource(R.string.admin_badge_verified)
    "organization" -> stringResource(R.string.admin_badge_organization)
    "government" -> stringResource(R.string.admin_badge_government)
    "team" -> stringResource(R.string.admin_badge_team)
    null -> stringResource(R.string.admin_badge_none)
    // A badgeType this dropdown doesn't offer (journalist, editorial, or
    // one a future build doesn't know yet) - showing the raw value beats
    // showing nothing, matching adminPlanLabel's own fallback.
    else -> badgeType
}

@Composable
private fun statusFilterLabel(status: String): String = when (status) {
    "ACTIVE" -> stringResource(R.string.admin_users_status_active)
    "BANNED" -> stringResource(R.string.admin_users_status_banned)
    else -> stringResource(R.string.admin_users_status_all)
}

@Composable
private fun UserRow(
    user: AdminUser,
    isAdmin: Boolean,
    isBusy: Boolean,
    onToggleBan: () -> Unit,
    onChangeRole: (String) -> Unit,
    onChangePlan: (String) -> Unit,
    onChangeBadge: (String?) -> Unit,
    onDelete: () -> Unit,
    onOpenProfile: (String) -> Unit,
) {
    var roleMenuOpen by remember { mutableStateOf(false) }
    var planMenuOpen by remember { mutableStateOf(false) }
    var badgeMenuOpen by remember { mutableStateOf(false) }

    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(16.dp))
            .background(MaterialTheme.colorScheme.surfaceContainerLow)
            .padding(Spacing.md),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Column(
                modifier = Modifier
                    .weight(1f)
                    .clickable(onClick = { onOpenProfile(user.username) }, role = Role.Button),
            ) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(
                        text = "@${user.username}",
                        fontWeight = FontWeight.Bold,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                        modifier = Modifier.weight(1f, fill = false),
                    )
                    VerifiedBadge(badgeType = user.badgeType, size = BadgeSize.small)
                }
                Text(text = user.email, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            if (user.banned) {
                Text(
                    text = stringResource(R.string.admin_users_status_banned),
                    style = MaterialTheme.typography.labelSmall,
                    fontWeight = FontWeight.Bold,
                    color = MaterialTheme.colorScheme.error,
                    modifier = Modifier
                        .clip(RoundedCornerShape(50))
                        .background(MaterialTheme.colorScheme.error.copy(alpha = 0.12f))
                        .padding(horizontal = 8.dp, vertical = 2.dp),
                )
            }
        }

        // Scrollable because this row now carries two chips plus the
        // ban/delete controls, and a long role or plan label in a
        // wordier locale would otherwise run off a narrow screen.
        Row(
            modifier = Modifier
                .padding(top = Spacing.sm)
                .horizontalScroll(rememberScrollState()),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Box {
                Text(
                    text = roleFilterLabel(user.role),
                    style = MaterialTheme.typography.labelSmall,
                    fontWeight = FontWeight.Bold,
                    color = ZrpRed,
                    modifier = Modifier
                        .clip(RoundedCornerShape(50))
                        .background(ZrpRed.copy(alpha = 0.12f))
                        .let { if (isAdmin) it.clickable { roleMenuOpen = true } else it }
                        .padding(horizontal = 8.dp, vertical = 2.dp),
                )
                if (isAdmin) {
                    DropdownMenu(expanded = roleMenuOpen, onDismissRequest = { roleMenuOpen = false }) {
                        ASSIGNABLE_ROLES.forEach { role ->
                            DropdownMenuItem(
                                text = { Text(roleFilterLabel(role)) },
                                onClick = { roleMenuOpen = false; onChangeRole(role) },
                            )
                        }
                    }
                }
            }

            // The same dropdown pattern as the role chip beside it,
            // against PUT /admin/users/{id}/plan - also ADMIN-only
            // server-side, so it's shown on the same isAdmin gate. The
            // chip is neutral rather than ZrpRed: a plan is billing
            // state, not a staff privilege.
            Box(modifier = Modifier.padding(start = Spacing.sm)) {
                Text(
                    text = adminPlanLabel(user.plan),
                    style = MaterialTheme.typography.labelSmall,
                    fontWeight = FontWeight.Bold,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier
                        .clip(RoundedCornerShape(50))
                        .background(MaterialTheme.colorScheme.surfaceVariant)
                        .let { if (isAdmin) it.clickable { planMenuOpen = true } else it }
                        .padding(horizontal = 8.dp, vertical = 2.dp),
                )
                if (isAdmin) {
                    DropdownMenu(expanded = planMenuOpen, onDismissRequest = { planMenuOpen = false }) {
                        USER_PLANS.forEach { plan ->
                            DropdownMenuItem(
                                text = { Text(adminPlanLabel(plan)) },
                                onClick = { planMenuOpen = false; onChangePlan(plan) },
                            )
                        }
                    }
                }
            }

            // Same dropdown pattern again, against PUT /admin/users/{id}
            // with a badgeType field - ADMIN-only server-side (see
            // AdminApi.updateUserBadge's own KDoc), so it's shown on the
            // same isAdmin gate as role/plan.
            Box(modifier = Modifier.padding(start = Spacing.sm)) {
                Text(
                    text = adminBadgeLabel(user.badgeType),
                    style = MaterialTheme.typography.labelSmall,
                    fontWeight = FontWeight.Bold,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier
                        .clip(RoundedCornerShape(50))
                        .background(MaterialTheme.colorScheme.surfaceVariant)
                        .let { if (isAdmin) it.clickable { badgeMenuOpen = true } else it }
                        .padding(horizontal = 8.dp, vertical = 2.dp),
                )
                if (isAdmin) {
                    DropdownMenu(expanded = badgeMenuOpen, onDismissRequest = { badgeMenuOpen = false }) {
                        ASSIGNABLE_BADGES.forEach { badgeType ->
                            DropdownMenuItem(
                                text = { Text(adminBadgeLabel(badgeType)) },
                                onClick = { badgeMenuOpen = false; onChangeBadge(badgeType) },
                            )
                        }
                    }
                }
            }

            if (isBusy) {
                CircularProgressIndicator(modifier = Modifier.padding(start = Spacing.md).size(18.dp), strokeWidth = 2.dp)
            } else {
                TextButton(onClick = onToggleBan, modifier = Modifier.padding(start = Spacing.sm)) {
                    Text(if (user.banned) stringResource(R.string.admin_users_unban) else stringResource(R.string.admin_users_ban))
                }
                if (isAdmin) {
                    IconButton(onClick = onDelete) {
                        Icon(
                            Icons.Filled.Delete,
                            contentDescription = stringResource(R.string.admin_users_delete),
                            tint = MaterialTheme.colorScheme.error,
                            modifier = Modifier.size(18.dp),
                        )
                    }
                }
            }
        }
    }
}
