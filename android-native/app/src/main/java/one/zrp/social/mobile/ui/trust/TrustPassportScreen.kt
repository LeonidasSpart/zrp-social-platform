package one.zrp.social.mobile.ui.trust

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.CalendarMonth
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.Circle
import androidx.compose.material.icons.filled.Description
import androidx.compose.material.icons.filled.EmojiEvents
import androidx.compose.material.icons.filled.Group
import androidx.compose.material.icons.filled.Info
import androidx.compose.material.icons.filled.Insights
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material.icons.filled.Shield
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import one.zrp.social.mobile.R
import one.zrp.social.mobile.data.TrustRepository
import one.zrp.social.mobile.network.TrustAdditionalSignal
import one.zrp.social.mobile.network.TrustPassportResponse
import one.zrp.social.mobile.network.TrustSignal
import one.zrp.social.mobile.ui.components.Avatar
import one.zrp.social.mobile.ui.components.VerifiedBadge
import one.zrp.social.mobile.ui.theme.Spacing
import one.zrp.social.mobile.ui.theme.ZrpRed
import one.zrp.social.mobile.util.formatCount

/**
 * ZRP Trust Passport - ported from src/app/trust/[username]/page.tsx.
 * See TrustApi's own KDoc for the full real GET
 * /api/users/{username}/trust contract this renders (no auth
 * required - any account's Trust Passport is public).
 */
@Composable
fun TrustPassportScreen(username: String, onBack: () -> Unit, onOpenProfile: (String) -> Unit) {
    val viewModel: TrustPassportViewModel = viewModel(
        factory = remember(username) { TrustPassportViewModelFactory(TrustRepository(), username) },
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
                Icon(Icons.Filled.ArrowBack, contentDescription = stringResource(R.string.trust_back_to_profile))
            }
            Column(modifier = Modifier.padding(start = 4.dp)) {
                Text(text = stringResource(R.string.trust_header_title), style = MaterialTheme.typography.titleMedium)
                Text(
                    text = stringResource(R.string.trust_header_subtitle),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }

        when {
            state.isLoading -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) { CircularProgressIndicator() }
            state.error || state.data == null -> TrustErrorBody(onOpenProfile = { onOpenProfile(username) })
            else -> TrustPassportBody(data = state.data!!, onOpenProfile = onOpenProfile)
        }
    }
}

@Composable
private fun TrustErrorBody(onOpenProfile: () -> Unit) {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(32.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        Icon(
            Icons.Filled.Shield,
            contentDescription = null,
            modifier = Modifier.size(56.dp),
            tint = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Text(
            text = stringResource(R.string.trust_unavailable_title),
            style = MaterialTheme.typography.titleLarge,
            modifier = Modifier.padding(top = Spacing.md),
        )
        // Matches the website's own error handling: `error` is only
        // ever set from its catch block to `t("trust.errUnableToLoad")`
        // (never left empty once a load fails), so its own
        // `{error || t("trust.notFoundFallback")}` fallback text is
        // real but unreachable there too - not a native gap.
        Text(
            text = stringResource(R.string.trust_err_unable_to_load),
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            textAlign = TextAlign.Center,
            modifier = Modifier.padding(top = Spacing.sm),
        )
        Button(
            onClick = onOpenProfile,
            colors = ButtonDefaults.buttonColors(containerColor = ZrpRed),
            modifier = Modifier.padding(top = Spacing.lg),
        ) {
            Text(stringResource(R.string.trust_back_to_profile))
        }
    }
}

@Composable
private fun TrustPassportBody(data: TrustPassportResponse, onOpenProfile: (String) -> Unit) {
    val score = data.passport.score.coerceIn(0, 100)
    val scoreColor = if (score >= 55) ZrpRed else MaterialTheme.colorScheme.onSurfaceVariant
    val categories = listOf("SECURITY", "PROFILE", "HISTORY", "COMMUNITY", "ZRP")
    val groupedSignals = categories.map { category -> category to data.signals.filter { it.category == category } }
    val accountAgeText = trustAccountAgeText(data.user.accountAgeMonths)

    Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(horizontal = Spacing.lg),
    ) {
        // ─── User ─────────────────────────────────────────────────
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(top = Spacing.lg, bottom = Spacing.md),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Box {
                Avatar(url = data.user.avatarUrl, name = data.user.name ?: data.user.username, size = 96.dp)
                Box(
                    modifier = Modifier
                        .align(Alignment.BottomEnd)
                        .size(36.dp)
                        .clip(CircleShape)
                        .background(MaterialTheme.colorScheme.surface),
                    contentAlignment = Alignment.Center,
                ) {
                    Icon(Icons.Filled.Shield, contentDescription = null, tint = ZrpRed, modifier = Modifier.size(28.dp))
                }
            }

            Row(
                modifier = Modifier.padding(top = Spacing.sm),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(
                    text = data.user.name ?: data.user.username,
                    style = MaterialTheme.typography.titleLarge,
                    fontWeight = FontWeight.Bold,
                )
                VerifiedBadge(badgeType = data.user.badgeType)
            }
            Text(
                text = "@${data.user.username}",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )

            Surface(
                shape = RoundedCornerShape(50),
                color = if (score >= 55) ZrpRed.copy(alpha = 0.1f) else MaterialTheme.colorScheme.surfaceContainerHigh,
                modifier = Modifier.padding(top = Spacing.sm),
            ) {
                Row(
                    modifier = Modifier.padding(horizontal = Spacing.md, vertical = Spacing.xs),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Icon(Icons.Filled.Shield, contentDescription = null, modifier = Modifier.size(14.dp), tint = scoreColor)
                    // No maxLines/softWrap here let a long translation (French
                    // "Confiance en construction" being the reported case)
                    // wrap mid-pill once the icon ate into the available
                    // width - the same failure mode ProfileScreen.kt's own
                    // trust pill already guards against with this exact
                    // fix, applied here for the second real render location.
                    Text(
                        text = trustLevelLabel(data.passport.level),
                        style = MaterialTheme.typography.labelMedium,
                        fontWeight = FontWeight.Bold,
                        color = scoreColor,
                        maxLines = 1,
                        softWrap = false,
                        overflow = TextOverflow.Ellipsis,
                        modifier = Modifier.padding(start = Spacing.xs),
                    )
                }
            }
        }

        // ─── Score ────────────────────────────────────────────────
        Surface(
            shape = MaterialTheme.shapes.large,
            color = ZrpRed.copy(alpha = 0.05f),
            border = BorderStroke(1.dp, ZrpRed.copy(alpha = 0.2f)),
            modifier = Modifier.fillMaxWidth(),
        ) {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(Spacing.lg),
                horizontalAlignment = Alignment.CenterHorizontally,
            ) {
                Box(
                    modifier = Modifier
                        .size(112.dp)
                        .clip(CircleShape)
                        .border(8.dp, ZrpRed.copy(alpha = 0.2f), CircleShape),
                    contentAlignment = Alignment.Center,
                ) {
                    Column(horizontalAlignment = Alignment.CenterHorizontally) {
                        Text(text = score.toString(), style = MaterialTheme.typography.headlineLarge, fontWeight = FontWeight.Black, color = scoreColor)
                        Text(
                            text = stringResource(R.string.trust_out_of_100),
                            style = MaterialTheme.typography.labelSmall,
                            fontWeight = FontWeight.Bold,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                }

                Text(
                    text = trustLevelLabel(data.passport.level),
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.Bold,
                    modifier = Modifier.padding(top = Spacing.sm),
                )
                Text(
                    text = trustLevelDescription(data.passport.level),
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    textAlign = TextAlign.Center,
                    modifier = Modifier.padding(top = 2.dp),
                )

                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(top = Spacing.sm)
                        .height(8.dp)
                        .clip(RoundedCornerShape(50))
                        .background(MaterialTheme.colorScheme.surfaceContainerHigh),
                ) {
                    Box(
                        modifier = Modifier
                            .fillMaxSize(score / 100f)
                            .clip(RoundedCornerShape(50))
                            .background(ZrpRed),
                    )
                }
                Text(
                    text = stringResource(R.string.trust_score_footnote),
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    textAlign = TextAlign.Center,
                    modifier = Modifier.padding(top = Spacing.xs),
                )
            }
        }

        // ─── Account overview ────────────────────────────────────
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(top = Spacing.md)
                .height(90.dp),
            horizontalArrangement = Arrangement.spacedBy(Spacing.sm),
        ) {
            Box(Modifier.weight(1f)) { TrustStatCard(Icons.Filled.Description, formatCount(data.counts.posts), stringResource(R.string.trust_stat_posts)) }
            Box(Modifier.weight(1f)) { TrustStatCard(Icons.Filled.Group, formatCount(data.counts.followers), stringResource(R.string.trust_stat_followers)) }
            Box(Modifier.weight(1f)) { TrustStatCard(Icons.Filled.CalendarMonth, accountAgeText, stringResource(R.string.trust_stat_on_zrp)) }
        }

        // ─── Account history detail ──────────────────────────────
        TrustInfoCard(
            icon = Icons.Filled.CalendarMonth,
            title = stringResource(R.string.trust_account_history_title),
            modifier = Modifier.padding(top = Spacing.md),
        ) {
            Text(
                text = stringResource(R.string.trust_joined_in, formatTrustJoinDate(data.user.createdAt)),
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.padding(top = 2.dp),
            )
            Text(
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.padding(top = 2.dp),
                text = stringResource(R.string.trust_account_age_label) + " " + accountAgeText + " · " +
                    stringResource(R.string.trust_days_suffix, data.user.accountAgeDays),
            )
            Text(
                text = stringResource(R.string.trust_account_age_footnote),
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.padding(top = Spacing.xs),
            )
        }

        // ─── Trust signals ────────────────────────────────────────
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(top = Spacing.lg, bottom = Spacing.sm),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Icon(Icons.Filled.Shield, contentDescription = null, tint = ZrpRed, modifier = Modifier.size(20.dp))
            Column(modifier = Modifier.padding(start = Spacing.sm)) {
                Text(text = stringResource(R.string.trust_trust_signals_title), style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.Bold)
                Text(
                    text = stringResource(R.string.trust_trust_signals_subtitle),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }

        groupedSignals.forEach { (category, signals) ->
            if (signals.isNotEmpty()) {
                Text(
                    text = trustCategoryLabel(category),
                    style = MaterialTheme.typography.labelSmall,
                    fontWeight = FontWeight.Bold,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.padding(top = Spacing.md, bottom = Spacing.xs),
                )
                Surface(shape = MaterialTheme.shapes.medium, tonalElevation = 1.dp, modifier = Modifier.fillMaxWidth()) {
                    Column {
                        signals.forEachIndexed { index, signal ->
                            TrustSignalRow(signal, data.user.accountAgeMonths)
                            if (index != signals.lastIndex) {
                                HorizontalDivider()
                            }
                        }
                    }
                }
            }
        }

        // ─── Additional signals ──────────────────────────────────
        if (data.additionalSignals.isNotEmpty()) {
            Text(
                text = stringResource(R.string.trust_additional_signals_heading),
                style = MaterialTheme.typography.labelSmall,
                fontWeight = FontWeight.Bold,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.padding(top = Spacing.lg),
            )
            Text(
                text = stringResource(R.string.trust_additional_signals_note),
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.padding(top = 2.dp, bottom = Spacing.xs),
            )
            Surface(shape = MaterialTheme.shapes.medium, tonalElevation = 1.dp, modifier = Modifier.fillMaxWidth()) {
                Column {
                    data.additionalSignals.forEachIndexed { index, signal ->
                        TrustAdditionalSignalRow(signal)
                        if (index != data.additionalSignals.lastIndex) {
                            HorizontalDivider()
                        }
                    }
                }
            }
        }

        // ─── Community participation ─────────────────────────────
        TrustInfoCard(
            icon = Icons.Filled.Insights,
            title = stringResource(R.string.trust_community_participation_title),
            modifier = Modifier.padding(top = Spacing.lg),
        ) {
            Text(
                text = stringResource(
                    R.string.trust_community_participation_desc,
                    formatCount(data.counts.posts),
                    formatCount(data.counts.followers),
                ),
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.padding(top = 2.dp),
            )
        }

        // ─── Private account ──────────────────────────────────────
        if (data.user.isPrivate) {
            TrustInfoCard(
                icon = Icons.Filled.Lock,
                title = stringResource(R.string.trust_private_account_title),
                modifier = Modifier.padding(top = Spacing.md),
            ) {
                Text(
                    text = stringResource(R.string.trust_private_account_desc),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.padding(top = 2.dp),
                )
            }
        }

        // ─── What this means ──────────────────────────────────────
        Surface(
            shape = MaterialTheme.shapes.medium,
            color = ZrpRed.copy(alpha = 0.05f),
            border = BorderStroke(1.dp, ZrpRed.copy(alpha = 0.2f)),
            modifier = Modifier
                .fillMaxWidth()
                .padding(top = Spacing.md),
        ) {
            Row(modifier = Modifier.padding(Spacing.md)) {
                Icon(Icons.Filled.EmojiEvents, contentDescription = null, tint = ZrpRed, modifier = Modifier.size(20.dp))
                Column(modifier = Modifier.padding(start = Spacing.sm)) {
                    Text(text = stringResource(R.string.trust_what_it_means_title), style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.Bold)
                    Text(
                        text = stringResource(R.string.trust_what_it_means_desc),
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.padding(top = 2.dp),
                    )
                }
            }
        }

        // ─── Transparency notice ─────────────────────────────────
        Surface(
            shape = MaterialTheme.shapes.medium,
            color = MaterialTheme.colorScheme.surfaceContainerHigh,
            modifier = Modifier
                .fillMaxWidth()
                .padding(top = Spacing.md),
        ) {
            Row(modifier = Modifier.padding(Spacing.md)) {
                Icon(Icons.Filled.Info, contentDescription = null, tint = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.size(18.dp))
                Text(
                    text = stringResource(R.string.trust_transparency_notice),
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.padding(start = Spacing.sm),
                )
            }
        }

        // ─── Back to profile ──────────────────────────────────────
        OutlinedButton(
            onClick = { onOpenProfile(data.user.username) },
            modifier = Modifier
                .fillMaxWidth()
                .padding(vertical = Spacing.lg),
        ) {
            Text(stringResource(R.string.trust_back_to_username, data.user.username))
        }
    }
}

@Composable
private fun TrustStatCard(icon: ImageVector, value: String, label: String) {
    Surface(shape = MaterialTheme.shapes.medium, tonalElevation = 1.dp, modifier = Modifier.fillMaxSize()) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(Spacing.sm),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Center,
        ) {
            Icon(icon, contentDescription = null, tint = ZrpRed, modifier = Modifier.size(18.dp))
            Text(text = value, style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.Bold, modifier = Modifier.padding(top = 2.dp))
            Text(text = label, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant, textAlign = TextAlign.Center)
        }
    }
}

@Composable
private fun TrustInfoCard(
    icon: ImageVector,
    title: String,
    modifier: Modifier = Modifier,
    content: @Composable () -> Unit,
) {
    Surface(shape = MaterialTheme.shapes.medium, tonalElevation = 1.dp, modifier = modifier.fillMaxWidth()) {
        Row(modifier = Modifier.padding(Spacing.md)) {
            Icon(icon, contentDescription = null, tint = ZrpRed, modifier = Modifier.size(20.dp))
            Column(modifier = Modifier.padding(start = Spacing.sm)) {
                Text(text = title, style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.Bold)
                content()
            }
        }
    }
}

@Composable
private fun TrustSignalRow(signal: TrustSignal, accountAgeMonths: Int) {
    val (title, description) = trustSignalTitleAndDescription(signal, accountAgeMonths)
    Row(modifier = Modifier.padding(Spacing.md)) {
        Icon(
            imageVector = if (signal.verified) Icons.Filled.CheckCircle else Icons.Filled.Circle,
            contentDescription = null,
            tint = if (signal.verified) ZrpRed else MaterialTheme.colorScheme.outlineVariant,
            modifier = Modifier.size(20.dp),
        )
        Column(modifier = Modifier.padding(start = Spacing.sm)) {
            Text(
                text = title,
                style = MaterialTheme.typography.bodyMedium,
                fontWeight = FontWeight.Medium,
                color = if (signal.verified) MaterialTheme.colorScheme.onSurface else MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Text(
                text = description,
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.padding(top = 2.dp),
            )
        }
    }
}

@Composable
private fun TrustAdditionalSignalRow(signal: TrustAdditionalSignal) {
    val title = if (signal.key == "walletVerified") stringResource(R.string.trust_signal_wallet_verified_title) else signal.title
    val description = if (signal.key == "walletVerified") stringResource(R.string.trust_signal_wallet_verified_desc) else signal.description
    Row(modifier = Modifier.padding(Spacing.md)) {
        Icon(
            imageVector = if (signal.verified) Icons.Filled.CheckCircle else Icons.Filled.Circle,
            contentDescription = null,
            tint = if (signal.verified) ZrpRed else MaterialTheme.colorScheme.outlineVariant,
            modifier = Modifier.size(20.dp),
        )
        Column(modifier = Modifier.padding(start = Spacing.sm)) {
            Text(
                text = title,
                style = MaterialTheme.typography.bodyMedium,
                fontWeight = FontWeight.Medium,
                color = if (signal.verified) MaterialTheme.colorScheme.onSurface else MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Text(
                text = description,
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.padding(top = 2.dp),
            )
        }
    }
}
