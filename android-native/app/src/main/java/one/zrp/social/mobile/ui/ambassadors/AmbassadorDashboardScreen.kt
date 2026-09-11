package one.zrp.social.mobile.ui.ambassadors

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.ContentCopy
import androidx.compose.material.icons.filled.Info
import androidx.compose.material.icons.filled.Public
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.Shield
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalClipboardManager
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import one.zrp.social.mobile.R
import one.zrp.social.mobile.data.AmbassadorsRepository
import one.zrp.social.mobile.network.AmbassadorProfile
import one.zrp.social.mobile.ui.components.EmptyStateAction
import one.zrp.social.mobile.ui.components.ZrpEmptyState
import one.zrp.social.mobile.ui.theme.Radius
import one.zrp.social.mobile.ui.theme.Spacing

/**
 * My Ambassador Status - ported from src/app/ambassadors/dashboard/page.tsx.
 * See AmbassadorDashboardViewModel's own KDoc for why this diverges from
 * the web page on network-failure handling. "Community activity" /
 * "Achievements" / "Global position" are deliberately not rendered:
 * ZRP has no Community model, activity feed or leaderboard for
 * ambassadors yet, and this screen never fabricates numbers to fill a
 * section that has no real data behind it (same reasoning as the web
 * page's own top comment).
 */
@Composable
fun AmbassadorDashboardScreen(onBack: () -> Unit, onApply: () -> Unit) {
    val viewModel: AmbassadorDashboardViewModel = viewModel(
        factory = remember { AmbassadorDashboardViewModelFactory(AmbassadorsRepository()) },
    )
    val state by viewModel.state.collectAsState()

    Column(modifier = Modifier.fillMaxSize()) {
        Row(
            modifier = Modifier.fillMaxWidth().padding(horizontal = 8.dp, vertical = 4.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            IconButton(onClick = onBack) {
                Icon(Icons.Filled.ArrowBack, contentDescription = stringResource(R.string.ambassadors_apply_back))
            }
            Text(
                text = stringResource(R.string.ambassadors_dashboard_title),
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.Bold,
                modifier = Modifier.padding(start = 4.dp),
            )
        }
        HorizontalDivider()

        when {
            state.isLoading -> {
                Column(modifier = Modifier.fillMaxSize(), horizontalAlignment = Alignment.CenterHorizontally) {
                    Spacer(modifier = Modifier.height(Spacing.xxl))
                    CircularProgressIndicator()
                }
            }
            state.error -> {
                ZrpEmptyState(
                    icon = Icons.Filled.Refresh,
                    title = stringResource(R.string.ambassadors_dashboard_err_load),
                    primaryAction = EmptyStateAction(
                        label = stringResource(R.string.action_retry),
                        onClick = { viewModel.load() },
                    ),
                )
            }
            state.profile == null -> {
                ZrpEmptyState(
                    icon = Icons.Filled.Public,
                    title = stringResource(R.string.ambassadors_dashboard_not_applied_title),
                    body = stringResource(R.string.ambassadors_dashboard_not_applied_body),
                    primaryAction = EmptyStateAction(
                        label = stringResource(R.string.ambassadors_dashboard_not_applied_cta),
                        onClick = onApply,
                    ),
                )
            }
            else -> {
                DashboardBody(profile = state.profile!!, countryName = state.countryName, onApply = onApply)
            }
        }
    }
}

@Composable
private fun DashboardBody(profile: AmbassadorProfile, countryName: String?, onApply: () -> Unit) {
    val clipboard = LocalClipboardManager.current
    val invitationLink = "https://zrp.one/signup?ref=${profile.invitationCode}"

    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        contentPadding = PaddingValues(Spacing.lg),
        verticalArrangement = Arrangement.spacedBy(Spacing.md),
    ) {
        when (profile.status) {
            "PENDING" -> item {
                StatusBanner(
                    title = stringResource(R.string.ambassadors_dashboard_pending_title),
                    body = stringResource(R.string.ambassadors_dashboard_pending_body),
                    isSevere = false,
                )
            }
            "REJECTED" -> item {
                StatusBanner(
                    title = stringResource(R.string.ambassadors_dashboard_rejected_title),
                    body = stringResource(R.string.ambassadors_dashboard_rejected_body),
                    isSevere = false,
                ) {
                    OutlinedButton(onClick = onApply, modifier = Modifier.padding(top = Spacing.sm)) {
                        Text(stringResource(R.string.ambassadors_dashboard_reapply_cta))
                    }
                }
            }
            "SUSPENDED" -> item {
                StatusBanner(
                    title = stringResource(R.string.ambassadors_dashboard_suspended_title),
                    body = stringResource(R.string.ambassadors_dashboard_suspended_body),
                    isSevere = true,
                    icon = Icons.Filled.Shield,
                )
            }
        }

        item {
            Row(horizontalArrangement = Arrangement.spacedBy(Spacing.md)) {
                DashboardCard(label = stringResource(R.string.ambassadors_dashboard_my_country), modifier = Modifier.weight(1f)) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text(text = flagEmoji(profile.countryCode), style = MaterialTheme.typography.headlineSmall)
                        Column(modifier = Modifier.padding(start = Spacing.sm)) {
                            Text(
                                text = countryName ?: profile.countryCode,
                                style = MaterialTheme.typography.bodyLarge,
                                fontWeight = FontWeight.Bold,
                            )
                            if (!profile.cityRegion.isNullOrBlank()) {
                                Text(
                                    text = profile.cityRegion,
                                    style = MaterialTheme.typography.bodySmall,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                                )
                            }
                        }
                    }
                }
                DashboardCard(label = stringResource(R.string.ambassadors_dashboard_my_level), modifier = Modifier.weight(1f)) {
                    Text(text = levelLabel(profile.level), style = MaterialTheme.typography.bodyLarge, fontWeight = FontWeight.Bold)
                }
            }
        }

        if (profile.status == "APPROVED") {
            item {
                DashboardCard(label = stringResource(R.string.ambassadors_dashboard_my_invitation_link)) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        OutlinedTextField(
                            value = invitationLink,
                            onValueChange = {},
                            readOnly = true,
                            singleLine = true,
                            modifier = Modifier.weight(1f),
                        )
                        IconButton(onClick = { clipboard.setText(AnnotatedString(invitationLink)) }) {
                            Icon(
                                Icons.Filled.ContentCopy,
                                contentDescription = stringResource(R.string.ambassadors_dashboard_copy_link),
                            )
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun levelLabel(level: String): String = when (level) {
    "EXPLORER" -> stringResource(R.string.ambassadors_level_explorer)
    "AMBASSADOR" -> stringResource(R.string.ambassadors_level_ambassador)
    "COMMUNITY_LEADER" -> stringResource(R.string.ambassadors_level_community_leader)
    "GLOBAL_AMBASSADOR" -> stringResource(R.string.ambassadors_level_global_ambassador)
    else -> level
}

@Composable
private fun DashboardCard(label: String, modifier: Modifier = Modifier, content: @Composable () -> Unit) {
    Surface(
        shape = RoundedCornerShape(Radius.md),
        tonalElevation = 1.dp,
        modifier = modifier.fillMaxWidth(),
    ) {
        Column(modifier = Modifier.padding(Spacing.md)) {
            Text(
                text = label,
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Spacer(modifier = Modifier.height(Spacing.xs))
            content()
        }
    }
}

@Composable
private fun StatusBanner(
    title: String,
    body: String,
    isSevere: Boolean,
    icon: ImageVector = Icons.Filled.Info,
    content: @Composable (() -> Unit)? = null,
) {
    val containerColor = if (isSevere) MaterialTheme.colorScheme.errorContainer else MaterialTheme.colorScheme.surfaceVariant
    val contentColor = if (isSevere) MaterialTheme.colorScheme.onErrorContainer else MaterialTheme.colorScheme.onSurfaceVariant

    Surface(
        shape = RoundedCornerShape(Radius.md),
        color = containerColor,
        modifier = Modifier.fillMaxWidth(),
    ) {
        Row(modifier = Modifier.padding(Spacing.md)) {
            Icon(icon, contentDescription = null, tint = contentColor, modifier = Modifier.padding(top = 2.dp))
            Column(modifier = Modifier.padding(start = Spacing.sm)) {
                Text(text = title, style = MaterialTheme.typography.bodyLarge, fontWeight = FontWeight.Bold, color = contentColor)
                Text(text = body, style = MaterialTheme.typography.bodyMedium, color = contentColor, modifier = Modifier.padding(top = 2.dp))
                content?.invoke()
            }
        }
    }
}
