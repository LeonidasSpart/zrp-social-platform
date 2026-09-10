package one.zrp.social.mobile.ui.legal

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.ErrorOutline
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import one.zrp.social.mobile.R
import one.zrp.social.mobile.data.LegalRepository
import one.zrp.social.mobile.network.LegalBlock
import one.zrp.social.mobile.network.LegalCard
import one.zrp.social.mobile.network.LegalContentResponse
import one.zrp.social.mobile.network.LegalSection
import one.zrp.social.mobile.network.LegalTableRow
import one.zrp.social.mobile.ui.theme.Spacing
import one.zrp.social.mobile.ui.theme.ZrpRed

/**
 * Terms of Service / Privacy Policy / Community Guidelines / Help Center
 * / Contact - a real native screen, not a WebView. Content is fetched
 * live from GET /api/legal/{page} (see LegalRepository/LegalApi) and
 * rendered here as ordered sections of headings/paragraphs/bullet
 * lists/cards/tables/FAQ - the same real, translated copy the website's
 * own /terms, /privacy, /guidelines, /help, /contact and /about pages
 * render, in the app's own current language. No link back to zrp.one
 * anywhere: navigation stays entirely inside this screen (top bar back
 * + system back), the same as every other native screen in this app.
 *
 * `page` is one of "terms" | "privacy" | "guidelines" | "help" |
 * "contact" | "about". `title` is this screen's fixed top-bar label (e.g.
 * R.string.legal_terms) - kept separate from the fetched content's own
 * (also real, translated) page title/subtitle, which render as the
 * first thing inside the scrollable body instead, so the top bar never
 * flickers empty while a request is in flight.
 */
@Composable
fun LegalScreen(
    page: String,
    title: String,
    onBack: () -> Unit,
    // Appended after this page's own resolved content, still inside the
    // same scrollable body - see CharityLedgerSection's own KDoc for why
    // the one page that needs this (charity) has content this generic
    // block renderer can't express (live, non-text data from a separate
    // real-time endpoint). No-op for every other page.
    trailingContent: @Composable () -> Unit = {},
) {
    val viewModel: LegalViewModel = viewModel(
        factory = remember(page) { LegalViewModelFactory(LegalRepository(), page) },
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
                Icon(Icons.Filled.ArrowBack, contentDescription = stringResource(R.string.nav_back))
            }
            Text(
                text = title,
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.Bold,
                modifier = Modifier.padding(start = 4.dp),
            )
        }
        HorizontalDivider()

        when {
            state.isLoading -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) { CircularProgressIndicator() }
            state.data == null -> LegalErrorBody(message = state.errorMessage, onRetry = viewModel::retry)
            else -> LegalBody(data = state.data!!, trailingContent = trailingContent)
        }
    }
}

@Composable
private fun LegalErrorBody(message: String?, onRetry: () -> Unit) {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(32.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        Icon(
            Icons.Filled.ErrorOutline,
            contentDescription = null,
            modifier = Modifier.size(48.dp),
            tint = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Text(
            text = message ?: stringResource(R.string.legal_load_error),
            style = MaterialTheme.typography.bodyLarge,
            textAlign = TextAlign.Center,
            modifier = Modifier.padding(top = Spacing.md),
        )
        Button(onClick = onRetry, modifier = Modifier.padding(top = Spacing.lg)) {
            Text(stringResource(R.string.action_retry))
        }
    }
}

@Composable
private fun LegalBody(data: LegalContentResponse, trailingContent: @Composable () -> Unit = {}) {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(horizontal = Spacing.lg, vertical = Spacing.lg),
    ) {
        Text(text = data.title, style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.Bold)
        data.subtitle?.let {
            Text(
                text = it,
                style = MaterialTheme.typography.bodyLarge,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.padding(top = Spacing.xs),
            )
        }

        data.sections.forEach { section ->
            LegalSectionView(section, modifier = Modifier.padding(top = Spacing.xl))
        }

        trailingContent()

        Spacer()
    }
}

@Composable
private fun LegalSectionView(section: LegalSection, modifier: Modifier = Modifier) {
    Column(modifier = modifier) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            section.number?.let { number ->
                Text(
                    text = number,
                    style = MaterialTheme.typography.labelLarge,
                    fontWeight = FontWeight.Bold,
                    color = ZrpRed,
                    modifier = Modifier.padding(end = Spacing.sm),
                )
            }
            Text(text = section.title, style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
        }

        Column(modifier = Modifier.padding(top = Spacing.md)) {
            section.body.forEach { block ->
                LegalBlockView(block, modifier = Modifier.padding(top = Spacing.sm))
            }
        }
    }
}

@Composable
private fun LegalBlockView(block: LegalBlock, modifier: Modifier = Modifier) {
    when (block.type) {
        "heading" -> block.text?.let {
            Text(
                text = it,
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.Bold,
                modifier = modifier,
            )
        }

        "paragraph" -> block.text?.let { text ->
            if (block.style == "callout") {
                Surface(
                    shape = MaterialTheme.shapes.medium,
                    color = ZrpRed.copy(alpha = 0.06f),
                    border = BorderStroke(1.dp, ZrpRed.copy(alpha = 0.25f)),
                    modifier = modifier.fillMaxWidth(),
                ) {
                    Text(
                        text = text,
                        style = MaterialTheme.typography.bodyMedium,
                        modifier = Modifier.padding(Spacing.md),
                    )
                }
            } else {
                Text(text = text, style = MaterialTheme.typography.bodyLarge, modifier = modifier)
            }
        }

        "bullets" -> block.items?.let { items ->
            Column(modifier = modifier) {
                items.forEach { item -> BulletRow(item, modifier = Modifier.padding(top = Spacing.xs)) }
            }
        }

        "cards" -> block.cards?.let { cards ->
            Column(modifier = modifier, verticalArrangement = Arrangement.spacedBy(Spacing.sm)) {
                cards.forEach { card -> LegalCardView(card) }
            }
        }

        "table" -> if (block.headers != null && block.rows != null) {
            LegalTableView(headers = block.headers, rows = block.rows, modifier = modifier)
        }

        "faq" -> block.faqItems?.let { items ->
            Column(modifier = modifier, verticalArrangement = Arrangement.spacedBy(Spacing.md)) {
                items.forEach { item ->
                    Column {
                        Text(text = item.question, style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.Bold)
                        Text(
                            text = item.answer,
                            style = MaterialTheme.typography.bodyMedium,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            modifier = Modifier.padding(top = 2.dp),
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun BulletRow(text: String, modifier: Modifier = Modifier) {
    Row(modifier = modifier) {
        Box(
            modifier = Modifier
                .padding(top = 8.dp, end = Spacing.sm)
                .size(6.dp)
                .background(ZrpRed, CircleShape),
        )
        Text(text = text, style = MaterialTheme.typography.bodyMedium)
    }
}

@Composable
private fun LegalCardView(card: LegalCard) {
    Surface(shape = MaterialTheme.shapes.medium, tonalElevation = 1.dp, modifier = Modifier.fillMaxWidth()) {
        Column(modifier = Modifier.padding(Spacing.md)) {
            card.title?.let {
                Text(text = it, style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.Bold)
            }
            card.text?.let {
                Text(
                    text = it,
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.padding(top = 2.dp),
                )
            }
            card.meta?.forEach { line ->
                Text(
                    text = line,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.padding(top = 2.dp),
                )
            }
        }
    }
}

@Composable
private fun LegalTableView(
    headers: List<String>,
    rows: List<LegalTableRow>,
    modifier: Modifier = Modifier,
) {
    Surface(
        shape = MaterialTheme.shapes.medium,
        tonalElevation = 1.dp,
        modifier = modifier
            .fillMaxWidth()
            .horizontalScroll(rememberScrollState()),
    ) {
        Column(modifier = Modifier.padding(Spacing.sm)) {
            Row {
                headers.forEach { header ->
                    Text(
                        text = header,
                        style = MaterialTheme.typography.labelMedium,
                        fontWeight = FontWeight.Bold,
                        modifier = Modifier
                            .padding(Spacing.sm)
                            .width(120.dp),
                    )
                }
            }
            HorizontalDivider()
            rows.forEach { row ->
                Row {
                    Text(
                        text = row.label,
                        style = MaterialTheme.typography.bodySmall,
                        fontWeight = FontWeight.Medium,
                        modifier = Modifier
                            .padding(Spacing.sm)
                            .width(120.dp),
                    )
                    row.values.forEach { value ->
                        Text(
                            text = value,
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            modifier = Modifier
                                .padding(Spacing.sm)
                                .width(120.dp),
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun Spacer() {
    Box(modifier = Modifier.padding(bottom = Spacing.xxl))
}
