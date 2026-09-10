package one.zrp.social.mobile.ui.charity

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.OpenInNew
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import one.zrp.social.mobile.R
import one.zrp.social.mobile.data.CharityRepository
import one.zrp.social.mobile.network.CharityDisbursementRecord
import one.zrp.social.mobile.network.CharityTransparencyResponse
import one.zrp.social.mobile.ui.theme.Spacing
import one.zrp.social.mobile.ui.theme.ZrpRed
import one.zrp.social.mobile.util.parseIsoMillis
import java.text.DateFormat
import java.util.Locale

private val CAUSE_ORDER = listOf("orphanages", "schools", "hospitals", "climate")

@Composable
private fun causeLabel(cause: String): String = when (cause) {
    "orphanages" -> stringResource(R.string.charity_cause_orphanages)
    "schools" -> stringResource(R.string.charity_cause_schools)
    "hospitals" -> stringResource(R.string.charity_cause_hospitals)
    "climate" -> stringResource(R.string.charity_cause_climate)
    else -> cause
}

private fun formatMoney(amount: Double, currency: String): String =
    "${String.format(Locale.getDefault(), "%,.2f", amount)} $currency"

private fun formatDate(iso: String): String {
    val millis = parseIsoMillis(iso) ?: return ""
    return DateFormat.getDateInstance(DateFormat.MEDIUM, Locale.getDefault()).format(java.util.Date(millis))
}

// The live counterpart to CHARITY_CONFIG's static content (legal-content.ts) -
// real committed/disbursed totals and per-beneficiary disbursement records
// from the same public GET /api/transparency/charity route
// CharityLedger.tsx itself calls. Passed as LegalScreen's trailingContent
// so it renders directly below the page's own resolved static sections,
// inside the same scrollable body - see LegalScreen's own KDoc on why this
// one page needs that hook.
@Composable
fun CharityLedgerSection() {
    val viewModel: CharityLedgerViewModel = viewModel(
        factory = remember { CharityLedgerViewModelFactory(CharityRepository()) },
    )
    val state by viewModel.state.collectAsState()

    when {
        state.isLoading -> Box(
            modifier = Modifier.fillMaxWidth().padding(vertical = Spacing.xl),
            contentAlignment = Alignment.Center,
        ) {
            CircularProgressIndicator()
        }
        state.data == null -> Text(
            text = stringResource(R.string.charity_err_load),
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            textAlign = TextAlign.Center,
            modifier = Modifier.fillMaxWidth().padding(vertical = Spacing.xl),
        )
        else -> CharityLedgerBody(state.data!!)
    }
}

@Composable
private fun CharityLedgerBody(data: CharityTransparencyResponse) {
    Column(modifier = Modifier.padding(top = Spacing.xl)) {
        Row(horizontalArrangement = Arrangement.spacedBy(Spacing.md)) {
            CharityStatCard(
                amount = formatMoney(data.committed.amount, data.committed.currency),
                label = stringResource(R.string.charity_committed_label),
                note = stringResource(R.string.charity_committed_note),
                modifier = Modifier.weight(1f),
            )
            CharityStatCard(
                amount = formatMoney(data.disbursed.total, "USD"),
                label = stringResource(R.string.charity_disbursed_label),
                note = stringResource(R.string.charity_disbursed_note),
                modifier = Modifier.weight(1f),
            )
        }

        Row(modifier = Modifier.padding(top = Spacing.md), horizontalArrangement = Arrangement.spacedBy(Spacing.sm)) {
            CAUSE_ORDER.take(2).forEach { cause ->
                CharityCauseTile(cause = cause, amount = data.disbursed.byCause[cause] ?: 0.0, modifier = Modifier.weight(1f))
            }
        }
        Row(modifier = Modifier.padding(top = Spacing.sm), horizontalArrangement = Arrangement.spacedBy(Spacing.sm)) {
            CAUSE_ORDER.drop(2).forEach { cause ->
                CharityCauseTile(cause = cause, amount = data.disbursed.byCause[cause] ?: 0.0, modifier = Modifier.weight(1f))
            }
        }

        Text(
            text = stringResource(R.string.charity_ledger_heading),
            style = MaterialTheme.typography.titleMedium,
            fontWeight = FontWeight.Bold,
            textAlign = TextAlign.Center,
            modifier = Modifier.fillMaxWidth().padding(top = Spacing.xl, bottom = Spacing.md),
        )

        if (data.disbursed.records.isEmpty()) {
            Text(
                text = stringResource(R.string.charity_no_disbursements_yet),
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                textAlign = TextAlign.Center,
                modifier = Modifier.fillMaxWidth(),
            )
        } else {
            Column(verticalArrangement = Arrangement.spacedBy(Spacing.sm)) {
                data.disbursed.records.forEach { record -> CharityDisbursementRow(record) }
            }
        }

        Text(
            text = stringResource(R.string.charity_generated_note, formatDate(data.generatedAt)),
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            textAlign = TextAlign.Center,
            modifier = Modifier.fillMaxWidth().padding(top = Spacing.lg),
        )
    }
}

@Composable
private fun CharityStatCard(amount: String, label: String, note: String, modifier: Modifier = Modifier) {
    Surface(
        shape = MaterialTheme.shapes.medium,
        tonalElevation = 1.dp,
        modifier = modifier,
    ) {
        Column(
            modifier = Modifier.padding(Spacing.md),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Text(text = amount, style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold, color = ZrpRed)
            Text(
                text = label,
                style = MaterialTheme.typography.bodyMedium,
                fontWeight = FontWeight.Medium,
                textAlign = TextAlign.Center,
                modifier = Modifier.padding(top = Spacing.xs),
            )
            Text(
                text = note,
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                textAlign = TextAlign.Center,
                modifier = Modifier.padding(top = 2.dp),
            )
        }
    }
}

@Composable
private fun CharityCauseTile(cause: String, amount: Double, modifier: Modifier = Modifier) {
    Surface(shape = MaterialTheme.shapes.medium, tonalElevation = 1.dp, modifier = modifier) {
        Column(
            modifier = Modifier.padding(Spacing.sm),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Text(text = formatMoney(amount, "USD"), style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.Bold)
            Text(
                text = causeLabel(cause),
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                textAlign = TextAlign.Center,
            )
        }
    }
}

@Composable
private fun CharityDisbursementRow(record: CharityDisbursementRecord) {
    val uriHandler = LocalUriHandler.current
    Surface(shape = MaterialTheme.shapes.medium, tonalElevation = 1.dp, modifier = Modifier.fillMaxWidth()) {
        Row(
            modifier = Modifier.padding(Spacing.md),
            horizontalArrangement = Arrangement.SpaceBetween,
        ) {
            Column(modifier = Modifier.weight(1f)) {
                Text(text = record.beneficiaryName, style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.Bold)
                Text(
                    text = "${causeLabel(record.cause)} · ${formatDate(record.disbursedAt)}",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                record.note?.let {
                    Text(
                        text = it,
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.padding(top = 2.dp),
                    )
                }
            }
            Column(horizontalAlignment = Alignment.End) {
                Text(
                    text = formatMoney(record.amount, record.currency),
                    style = MaterialTheme.typography.titleSmall,
                    fontWeight = FontWeight.Bold,
                    color = ZrpRed,
                )
                val proofUrl = record.proofUrl
                if (!proofUrl.isNullOrBlank()) {
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        modifier = Modifier
                            .padding(top = 4.dp)
                            .clickable { runCatching { uriHandler.openUri(proofUrl) } },
                    ) {
                        Text(
                            text = stringResource(R.string.charity_view_proof),
                            style = MaterialTheme.typography.labelSmall,
                            color = ZrpRed,
                        )
                        Icon(
                            Icons.Filled.OpenInNew,
                            contentDescription = null,
                            tint = ZrpRed,
                            modifier = Modifier.padding(start = 2.dp).size(12.dp),
                        )
                    }
                }
            }
        }
    }
}
