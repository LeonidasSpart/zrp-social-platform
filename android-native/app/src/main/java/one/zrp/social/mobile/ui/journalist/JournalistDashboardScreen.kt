package one.zrp.social.mobile.ui.journalist

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.Block
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Description
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material.icons.filled.Info
import androidx.compose.material.icons.filled.Newspaper
import androidx.compose.material.icons.filled.Schedule
import androidx.compose.material.icons.filled.Visibility
import androidx.compose.material3.Button
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
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import one.zrp.social.mobile.R
import one.zrp.social.mobile.data.JournalistRepository
import one.zrp.social.mobile.network.JournalistArticleSummary
import one.zrp.social.mobile.ui.components.VerifiedBadge
import one.zrp.social.mobile.ui.theme.Spacing
import one.zrp.social.mobile.ui.theme.ZrpRed

/**
 * ZRP Journalist - ported from journalist/page.tsx exactly. See
 * JournalistDashboardViewModel's own KDoc for the full status-branch
 * precedence this mirrors. Reachable from Settings (matching the
 * Creator Studio entry-point precedent) rather than the website's own
 * two separate entry points (a role-gated Sidebar link once already a
 * journalist, a footer link to apply) - both of those land on this
 * exact same page, which does its own internal isJournalist/status
 * branching regardless of how it was reached, so one native entry
 * point is functionally equivalent.
 */
@Composable
fun JournalistDashboardScreen(
    onBack: () -> Unit,
    onCreateArticle: () -> Unit,
    onEditArticle: (String) -> Unit,
    onViewArticle: (String) -> Unit,
) {
    val viewModel: JournalistDashboardViewModel = viewModel(
        factory = remember { JournalistDashboardViewModelFactory(JournalistRepository()) },
    )
    val state by viewModel.state.collectAsState()

    LaunchedEffect(Unit) { viewModel.load() }

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
            if (state.isJournalist && state.profile?.status != "PENDING" && state.profile?.status != "SUSPENDED") {
                Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.padding(start = 4.dp)) {
                    Text(text = stringResource(R.string.journalist_dash_title), style = MaterialTheme.typography.titleMedium)
                    VerifiedBadge(badgeType = "journalist", modifier = Modifier.padding(start = 6.dp))
                }
            }
        }
        HorizontalDivider()

        when {
            state.isLoading -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) { CircularProgressIndicator() }
            !state.isJournalist -> ApplyFormBody(state = state, viewModel = viewModel)
            state.profile?.status == "PENDING" -> CenteredStatusCard(
                icon = Icons.Filled.Schedule,
                iconTint = MaterialTheme.colorScheme.tertiary,
                title = stringResource(R.string.journalist_dash_pending_title),
                description = stringResource(R.string.journalist_dash_pending_desc),
            )
            state.profile?.status == "SUSPENDED" -> CenteredStatusCard(
                icon = Icons.Filled.Block,
                iconTint = MaterialTheme.colorScheme.error,
                title = stringResource(R.string.journalist_dash_suspended_title),
                description = state.profile?.suspensionReason?.takeIf { it.isNotBlank() }
                    ?: stringResource(R.string.journalist_dash_suspended_default_reason),
            )
            else -> DashboardBody(
                articles = state.articles,
                totalArticles = state.counts?.total ?: 0,
                drafts = state.counts?.draft ?: 0,
                pendingReview = state.counts?.pendingReview ?: 0,
                published = state.counts?.published ?: 0,
                rejected = state.counts?.rejected ?: 0,
                onCreateArticle = onCreateArticle,
                onEditArticle = onEditArticle,
                onViewArticle = onViewArticle,
            )
        }
    }
}

@Composable
private fun ApplyFormBody(state: JournalistDashboardUiState, viewModel: JournalistDashboardViewModel) {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(Spacing.lg),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Surface(shape = RoundedCornerShape(12.dp), color = ZrpRed.copy(alpha = 0.1f)) {
                Icon(
                    imageVector = Icons.Filled.Newspaper,
                    contentDescription = null,
                    tint = ZrpRed,
                    modifier = Modifier.padding(12.dp).size(24.dp),
                )
            }
            Column(modifier = Modifier.padding(start = Spacing.md)) {
                Text(text = stringResource(R.string.journalist_dash_become_title), style = MaterialTheme.typography.headlineSmall)
                Text(
                    text = stringResource(R.string.journalist_dash_become_subtitle),
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }

        if (state.profile?.status == "REJECTED") {
            Surface(
                modifier = Modifier.fillMaxWidth().padding(top = Spacing.lg),
                shape = RoundedCornerShape(12.dp),
                color = MaterialTheme.colorScheme.errorContainer,
            ) {
                Row(modifier = Modifier.padding(Spacing.md)) {
                    Icon(Icons.Filled.Info, contentDescription = null, tint = MaterialTheme.colorScheme.error)
                    Column(modifier = Modifier.padding(start = Spacing.sm)) {
                        Text(
                            text = stringResource(R.string.journalist_dash_rejected_notice_title),
                            style = MaterialTheme.typography.labelLarge,
                            color = MaterialTheme.colorScheme.onErrorContainer,
                        )
                        state.profile.rejectionReason?.takeIf { it.isNotBlank() }?.let {
                            Text(it, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onErrorContainer, modifier = Modifier.padding(top = 2.dp))
                        }
                        Text(
                            text = stringResource(R.string.journalist_dash_rejected_notice_hint),
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onErrorContainer,
                            modifier = Modifier.padding(top = 2.dp),
                        )
                    }
                }
            }
        }

        state.applyError?.let { error ->
            val message = when (error) {
                JournalistDashboardViewModel.pitchRequiredError -> stringResource(R.string.journalist_dash_err_pitch_required)
                JournalistDashboardViewModel.failedSubmitError -> stringResource(R.string.journalist_dash_err_failed_submit)
                else -> error
            }
            Text(
                text = message,
                color = MaterialTheme.colorScheme.error,
                style = MaterialTheme.typography.bodySmall,
                modifier = Modifier.padding(top = Spacing.md),
            )
        }

        OutlinedTextField(
            value = state.outlet,
            onValueChange = viewModel::onOutletChange,
            label = { Text(stringResource(R.string.journalist_dash_outlet_label)) },
            placeholder = { Text(stringResource(R.string.journalist_dash_outlet_placeholder)) },
            modifier = Modifier.fillMaxWidth().padding(top = Spacing.lg),
        )
        OutlinedTextField(
            value = state.portfolioUrl,
            onValueChange = viewModel::onPortfolioUrlChange,
            label = { Text(stringResource(R.string.journalist_dash_portfolio_label)) },
            placeholder = { Text(stringResource(R.string.journalist_dash_portfolio_placeholder)) },
            modifier = Modifier.fillMaxWidth().padding(top = Spacing.md),
        )
        OutlinedTextField(
            value = state.pitch,
            onValueChange = viewModel::onPitchChange,
            label = { Text(stringResource(R.string.journalist_dash_pitch_label)) },
            placeholder = { Text(stringResource(R.string.journalist_dash_pitch_placeholder)) },
            minLines = 5,
            modifier = Modifier.fillMaxWidth().padding(top = Spacing.md),
        )

        Button(
            onClick = viewModel::apply,
            enabled = !state.applying,
            modifier = Modifier.padding(top = Spacing.lg),
        ) {
            Text(stringResource(R.string.journalist_dash_submit_application))
        }
    }
}

@Composable
private fun CenteredStatusCard(icon: ImageVector, iconTint: androidx.compose.ui.graphics.Color, title: String, description: String) {
    Box(modifier = Modifier.fillMaxSize().padding(Spacing.lg), contentAlignment = Alignment.Center) {
        Surface(shape = RoundedCornerShape(16.dp), tonalElevation = 1.dp) {
            Column(
                modifier = Modifier.padding(Spacing.xl),
                horizontalAlignment = Alignment.CenterHorizontally,
            ) {
                Icon(icon, contentDescription = null, tint = iconTint, modifier = Modifier.size(40.dp))
                Text(text = title, style = MaterialTheme.typography.titleLarge, modifier = Modifier.padding(top = Spacing.md))
                Text(
                    text = description,
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    textAlign = TextAlign.Center,
                    modifier = Modifier.padding(top = Spacing.sm),
                )
            }
        }
    }
}

@Composable
private fun DashboardBody(
    articles: List<JournalistArticleSummary>,
    totalArticles: Int,
    drafts: Int,
    pendingReview: Int,
    published: Int,
    rejected: Int,
    onCreateArticle: () -> Unit,
    onEditArticle: (String) -> Unit,
    onViewArticle: (String) -> Unit,
) {
    Column(modifier = Modifier.fillMaxSize()) {
        Row(
            modifier = Modifier.fillMaxWidth().padding(Spacing.lg),
            horizontalArrangement = Arrangement.End,
        ) {
            Button(onClick = onCreateArticle) {
                Icon(Icons.Filled.Add, contentDescription = null, modifier = Modifier.size(18.dp))
                Text(stringResource(R.string.journalist_dash_create_article), modifier = Modifier.padding(start = 6.dp))
            }
        }

        LazyVerticalGrid(
            columns = GridCells.Fixed(2),
            modifier = Modifier.fillMaxWidth().height(180.dp).padding(horizontal = Spacing.lg),
            horizontalArrangement = Arrangement.spacedBy(Spacing.sm),
            verticalArrangement = Arrangement.spacedBy(Spacing.sm),
        ) {
            item { StatCard(stringResource(R.string.journalist_dash_stat_total_articles), totalArticles, Icons.Filled.Description) }
            item { StatCard(stringResource(R.string.journalist_dash_stat_drafts), drafts, Icons.Filled.Description) }
            item { StatCard(stringResource(R.string.journalist_dash_stat_pending_review), pendingReview, Icons.Filled.Schedule) }
            item { StatCard(stringResource(R.string.journalist_dash_stat_published), published, Icons.Filled.CheckCircle) }
            item { StatCard(stringResource(R.string.journalist_dash_stat_rejected), rejected, Icons.Filled.Close) }
        }

        Text(
            text = stringResource(R.string.journalist_dash_recent_articles),
            style = MaterialTheme.typography.titleSmall,
            modifier = Modifier.padding(horizontal = Spacing.lg, vertical = Spacing.sm),
        )
        HorizontalDivider()

        if (articles.isEmpty()) {
            Box(Modifier.fillMaxSize().padding(Spacing.xl), contentAlignment = Alignment.TopCenter) {
                Text(
                    text = stringResource(R.string.journalist_dash_no_articles_yet),
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    style = MaterialTheme.typography.bodyMedium,
                )
            }
        } else {
            LazyColumn(contentPadding = PaddingValues(bottom = Spacing.lg)) {
                items(articles, key = { it.id }) { article ->
                    ArticleRow(article = article, onEditArticle = onEditArticle, onViewArticle = onViewArticle)
                    HorizontalDivider()
                }
            }
        }
    }
}

@Composable
private fun StatCard(label: String, value: Int, icon: ImageVector) {
    Surface(shape = RoundedCornerShape(12.dp), tonalElevation = 1.dp, modifier = Modifier.fillMaxWidth()) {
        Column(modifier = Modifier.padding(Spacing.md)) {
            Icon(icon, contentDescription = null, tint = MaterialTheme.colorScheme.primary, modifier = Modifier.size(18.dp))
            Text(text = value.toString(), style = MaterialTheme.typography.titleLarge, modifier = Modifier.padding(top = 4.dp))
            Text(text = label, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
}

@Composable
private fun ArticleRow(
    article: JournalistArticleSummary,
    onEditArticle: (String) -> Unit,
    onViewArticle: (String) -> Unit,
) {
    val editable = article.status == "DRAFT" || article.status == "REJECTED"
    Row(
        modifier = Modifier.fillMaxWidth().padding(horizontal = Spacing.lg, vertical = Spacing.md),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Column(modifier = Modifier.weight(1f)) {
            Text(text = article.title, style = MaterialTheme.typography.bodyLarge, maxLines = 1)
            Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.padding(top = 4.dp)) {
                Surface(shape = RoundedCornerShape(50), color = journalistArticleStatusColor(article.status).copy(alpha = 0.15f)) {
                    Text(
                        text = journalistArticleStatusLabel(article.status),
                        style = MaterialTheme.typography.labelSmall,
                        color = journalistArticleStatusColor(article.status),
                        modifier = Modifier.padding(horizontal = 8.dp, vertical = 2.dp),
                    )
                }
                if (article.status == "REJECTED" && !article.reviewNote.isNullOrBlank()) {
                    Text(
                        text = article.reviewNote,
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        maxLines = 1,
                        modifier = Modifier.padding(start = 6.dp),
                    )
                }
            }
        }

        if (editable) {
            OutlinedButton(onClick = { onEditArticle(article.id) }) {
                Icon(Icons.Filled.Edit, contentDescription = null, modifier = Modifier.size(14.dp))
                Text(stringResource(R.string.journalist_dash_edit), modifier = Modifier.padding(start = 4.dp), style = MaterialTheme.typography.labelSmall)
            }
        } else if (article.status == "PUBLISHED") {
            OutlinedButton(onClick = { onViewArticle(article.slug) }) {
                Icon(Icons.Filled.Visibility, contentDescription = null, modifier = Modifier.size(14.dp))
                Text(stringResource(R.string.journalist_dash_view), modifier = Modifier.padding(start = 4.dp), style = MaterialTheme.typography.labelSmall)
            }
        }
    }
}
