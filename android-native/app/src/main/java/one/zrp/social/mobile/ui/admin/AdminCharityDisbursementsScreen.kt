package one.zrp.social.mobile.ui.admin

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
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DatePicker
import androidx.compose.material3.DatePickerDialog
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.rememberDatePickerState
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
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import java.text.DateFormat
import java.text.NumberFormat
import java.text.SimpleDateFormat
import java.util.Locale
import java.util.TimeZone
import one.zrp.social.mobile.R
import one.zrp.social.mobile.data.AdminRepository
import one.zrp.social.mobile.network.AdminCharityDisbursement
import one.zrp.social.mobile.ui.theme.Spacing
import one.zrp.social.mobile.ui.theme.ZrpRed

private val disbursedAtFormat = ThreadLocal.withInitial {
    SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US).apply {
        timeZone = TimeZone.getTimeZone("UTC")
    }
}

private val pickedDayFormat = ThreadLocal.withInitial {
    SimpleDateFormat("yyyy-MM-dd", Locale.US).apply {
        timeZone = TimeZone.getTimeZone("UTC")
    }
}

/**
 * The charity disbursement ledger - see
 * AdminCharityDisbursementsViewModel's own KDoc. The list is read-only
 * (the route offers no update or delete), and the "Record
 * disbursement" form is an inline card on the same screen, the same
 * shape as the grant-by-username card on AdminJournalistsScreen, rather
 * than a dialog: it needs the app's existing DatePickerDialog, which
 * doesn't belong nested inside another dialog.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AdminCharityDisbursementsScreen(onBack: () -> Unit) {
    val viewModel: AdminCharityDisbursementsViewModel = viewModel(
        factory = remember { AdminCharityDisbursementsViewModelFactory(AdminRepository()) },
    )
    val state by viewModel.state.collectAsState()
    val context = LocalContext.current
    var showDatePicker by remember { mutableStateOf(false) }

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
                text = stringResource(R.string.admin_charity_title),
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.Bold,
                modifier = Modifier.padding(start = 4.dp),
            )
        }

        if (state.isLoading) {
            Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                CircularProgressIndicator()
            }
        } else {
            LazyColumn(
                modifier = Modifier.weight(1f),
                contentPadding = PaddingValues(Spacing.lg),
                verticalArrangement = Arrangement.spacedBy(Spacing.md),
            ) {
                item {
                    Text(
                        text = stringResource(R.string.admin_charity_subtitle),
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }

                if (state.savedRecently) {
                    item {
                        Text(
                            text = stringResource(R.string.admin_charity_saved),
                            style = MaterialTheme.typography.bodySmall,
                            fontWeight = FontWeight.Bold,
                        )
                    }
                }

                item {
                    if (state.formExpanded) {
                        RecordDisbursementCard(
                            state = state,
                            onBeneficiaryChange = { viewModel.setBeneficiaryName(it) },
                            onCauseChange = { viewModel.setCause(it) },
                            onAmountChange = { viewModel.setAmount(it) },
                            onCurrencyChange = { viewModel.setCurrency(it) },
                            onNoteChange = { viewModel.setNote(it) },
                            onProofUrlChange = { viewModel.setProofUrl(it) },
                            onPickDate = { showDatePicker = true },
                            onSubmit = { viewModel.submit() },
                            onCancel = { viewModel.toggleForm() },
                        )
                    } else {
                        OutlinedButton(
                            onClick = { viewModel.toggleForm() },
                            modifier = Modifier.fillMaxWidth(),
                        ) {
                            Text(stringResource(R.string.admin_charity_record))
                        }
                    }
                }

                if (state.disbursements.isEmpty()) {
                    item {
                        Text(
                            text = stringResource(R.string.admin_charity_no_disbursements),
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            modifier = Modifier.padding(top = Spacing.lg),
                        )
                    }
                } else {
                    items(state.disbursements, key = { it.id }) { disbursement ->
                        DisbursementRow(disbursement)
                    }
                }
            }
        }
    }

    if (showDatePicker) {
        val datePickerState = rememberDatePickerState()
        DatePickerDialog(
            onDismissRequest = { showDatePicker = false },
            confirmButton = {
                TextButton(onClick = {
                    val millis = datePickerState.selectedDateMillis
                    showDatePicker = false
                    // The picker's own millis are already UTC midnight
                    // of the chosen day, which is exactly what the
                    // route parses a bare yyyy-MM-dd as.
                    if (millis != null) viewModel.setDisbursedAt(pickedDayFormat.get()!!.format(millis))
                }) {
                    Text(stringResource(android.R.string.ok))
                }
            },
            dismissButton = {
                TextButton(onClick = { showDatePicker = false }) {
                    Text(stringResource(android.R.string.cancel))
                }
            },
        ) {
            DatePicker(state = datePickerState)
        }
    }
}

@Composable
private fun RecordDisbursementCard(
    state: AdminCharityUiState,
    onBeneficiaryChange: (String) -> Unit,
    onCauseChange: (String) -> Unit,
    onAmountChange: (String) -> Unit,
    onCurrencyChange: (String) -> Unit,
    onNoteChange: (String) -> Unit,
    onProofUrlChange: (String) -> Unit,
    onPickDate: () -> Unit,
    onSubmit: () -> Unit,
    onCancel: () -> Unit,
) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(16.dp))
            .background(MaterialTheme.colorScheme.surfaceContainerLow)
            .padding(Spacing.md),
    ) {
        Text(text = stringResource(R.string.admin_charity_record), fontWeight = FontWeight.Bold)
        Text(
            text = stringResource(R.string.admin_charity_form_hint),
            style = MaterialTheme.typography.labelSmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.padding(top = 2.dp),
        )

        OutlinedTextField(
            value = state.beneficiaryName,
            onValueChange = onBeneficiaryChange,
            label = { Text(stringResource(R.string.admin_charity_beneficiary)) },
            singleLine = true,
            keyboardOptions = KeyboardOptions(imeAction = ImeAction.Next),
            modifier = Modifier.fillMaxWidth().padding(top = Spacing.sm),
        )

        Text(
            text = stringResource(R.string.admin_charity_cause),
            style = MaterialTheme.typography.labelMedium,
            modifier = Modifier.padding(top = Spacing.md, bottom = Spacing.xs),
        )
        Row(
            modifier = Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()),
            horizontalArrangement = Arrangement.spacedBy(Spacing.sm),
        ) {
            CHARITY_CAUSES.forEach { cause ->
                FilterChip(
                    selected = state.cause == cause,
                    onClick = { onCauseChange(cause) },
                    label = { Text(charityCauseLabel(cause)) },
                )
            }
        }

        Row(modifier = Modifier.fillMaxWidth().padding(top = Spacing.sm)) {
            OutlinedTextField(
                value = state.amount,
                onValueChange = onAmountChange,
                label = { Text(stringResource(R.string.admin_charity_amount)) },
                singleLine = true,
                keyboardOptions = KeyboardOptions(
                    keyboardType = KeyboardType.Decimal,
                    imeAction = ImeAction.Next,
                ),
                modifier = Modifier.weight(2f),
            )
            OutlinedTextField(
                value = state.currency,
                onValueChange = onCurrencyChange,
                label = { Text(stringResource(R.string.admin_charity_currency)) },
                singleLine = true,
                keyboardOptions = KeyboardOptions(imeAction = ImeAction.Next),
                modifier = Modifier.weight(1f).padding(start = Spacing.sm),
            )
        }

        Text(
            text = stringResource(R.string.admin_charity_date),
            style = MaterialTheme.typography.labelMedium,
            modifier = Modifier.padding(top = Spacing.md, bottom = Spacing.xs),
        )
        OutlinedButton(onClick = onPickDate) {
            Text(state.disbursedAt.ifEmpty { stringResource(R.string.admin_charity_pick_date) })
        }

        OutlinedTextField(
            value = state.note,
            onValueChange = onNoteChange,
            label = { Text(stringResource(R.string.admin_charity_note)) },
            keyboardOptions = KeyboardOptions(imeAction = ImeAction.Next),
            modifier = Modifier.fillMaxWidth().padding(top = Spacing.sm),
        )
        OutlinedTextField(
            value = state.proofUrl,
            onValueChange = onProofUrlChange,
            label = { Text(stringResource(R.string.admin_charity_proof_url)) },
            singleLine = true,
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Uri, imeAction = ImeAction.Done),
            modifier = Modifier.fillMaxWidth().padding(top = Spacing.sm),
        )

        val formError = state.formError
        if (formError != null) {
            Text(
                text = charityFormErrorMessage(formError),
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.error,
                modifier = Modifier.padding(top = Spacing.sm),
            )
        }

        Row(modifier = Modifier.padding(top = Spacing.sm), verticalAlignment = Alignment.CenterVertically) {
            if (state.isSubmitting) {
                CircularProgressIndicator(modifier = Modifier.size(20.dp), strokeWidth = 2.dp)
            } else {
                TextButton(onClick = onSubmit) {
                    Text(stringResource(R.string.admin_charity_submit), color = ZrpRed)
                }
                TextButton(onClick = onCancel) { Text(stringResource(R.string.admin_reports_cancel)) }
            }
        }
    }
}

@Composable
private fun DisbursementRow(disbursement: AdminCharityDisbursement) {
    val uriHandler = LocalUriHandler.current
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(16.dp))
            .background(MaterialTheme.colorScheme.surfaceContainerLow)
            .padding(Spacing.md),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text(text = disbursement.beneficiaryName, fontWeight = FontWeight.Bold, modifier = Modifier.weight(1f))
            Text(
                text = formatDisbursementAmount(disbursement.amount, disbursement.currency),
                fontWeight = FontWeight.Bold,
                color = ZrpRed,
            )
        }

        Text(
            text = "${charityCauseLabel(disbursement.cause)} · ${formatDisbursedAt(disbursement.disbursedAt)}",
            style = MaterialTheme.typography.labelSmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.padding(top = 4.dp),
        )

        if (!disbursement.note.isNullOrBlank()) {
            Text(
                text = disbursement.note,
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.padding(top = 4.dp),
            )
        }

        if (!disbursement.recordedByUsername.isNullOrBlank()) {
            Text(
                text = stringResource(R.string.admin_charity_recorded_by, disbursement.recordedByUsername),
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.padding(top = 4.dp),
            )
        }

        val proofUrl = disbursement.proofUrl
        if (!proofUrl.isNullOrBlank()) {
            val url: String = proofUrl
            TextButton(
                // openUri throws on a stored value that isn't a URL the
                // device can open - the row shouldn't crash over a bad
                // link someone typed into the proof field.
                onClick = { runCatching { uriHandler.openUri(url) } },
                modifier = Modifier.padding(top = Spacing.xs),
            ) {
                Text(stringResource(R.string.admin_charity_view_proof), color = ZrpRed)
            }
        }
    }
}

/**
 * The four real cause values the route accepts, labelled with the same
 * wording the public /charity page uses for them.
 */
@Composable
private fun charityCauseLabel(cause: String): String = when (cause) {
    "orphanages" -> stringResource(R.string.admin_charity_cause_orphanages)
    "schools" -> stringResource(R.string.admin_charity_cause_schools)
    "hospitals" -> stringResource(R.string.admin_charity_cause_hospitals)
    "climate" -> stringResource(R.string.admin_charity_cause_climate)
    // Never reached for a row this route created, but a stored value
    // from some other source is shown as-is rather than mislabelled.
    else -> cause
}

@Composable
private fun charityFormErrorMessage(error: CharityFormError): String = when (error) {
    CharityFormError.BENEFICIARY -> stringResource(R.string.admin_charity_err_beneficiary)
    CharityFormError.CAUSE -> stringResource(R.string.admin_charity_err_cause)
    CharityFormError.AMOUNT -> stringResource(R.string.admin_charity_err_amount)
    CharityFormError.DATE -> stringResource(R.string.admin_charity_err_date)
}

/**
 * amount arrives as the Decimal's JSON string (see
 * AdminCharityDisbursement). Rendered as a locale-grouped number plus
 * the stored currency code, the same "amount + code" shape the public
 * ledger uses - the raw string is shown untouched if it somehow isn't
 * a number, rather than being silently zeroed.
 */
private fun formatDisbursementAmount(amount: String, currency: String): String {
    val parsed = amount.toDoubleOrNull() ?: return "$amount $currency"
    val format = NumberFormat.getNumberInstance(Locale.getDefault()).apply { maximumFractionDigits = 2 }
    return "${format.format(parsed)} $currency"
}

/** Locale-aware date, matching the public ledger's own rendering. */
private fun formatDisbursedAt(iso: String): String {
    val date = try { disbursedAtFormat.get()!!.parse(iso) } catch (_: Exception) { null } ?: return iso
    return DateFormat.getDateInstance(DateFormat.MEDIUM, Locale.getDefault()).format(date)
}
