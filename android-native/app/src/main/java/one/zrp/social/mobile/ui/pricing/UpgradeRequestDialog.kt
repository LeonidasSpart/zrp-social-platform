package one.zrp.social.mobile.ui.pricing

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.RadioButton
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.delay
import one.zrp.social.mobile.R

/**
 * Android's equivalent of web's UpgradeRequestModal.tsx - the manual,
 * admin-reviewed request form behind the "Request manual approval
 * instead" link on [PricingScreen]. Submits the same
 * POST /api/upgrade-requests payload the website sends; the bank
 * account details below are the same fixed, non-translated values
 * UpgradeRequestModal.tsx hardcodes (there's no per-language bank
 * account, just per-language labels around it).
 */
@Composable
fun UpgradeRequestDialog(
    state: UpgradeRequestDialogState,
    planLabel: String,
    priceUsd: String,
    onPaymentMethodChange: (String) -> Unit,
    onNoteChange: (String) -> Unit,
    onSubmit: () -> Unit,
    onDismiss: () -> Unit,
) {
    if (state.success) {
        LaunchedEffect(Unit) {
            delay(2000)
            onDismiss()
        }
    }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(stringResource(R.string.upgrade_request_title, planLabel)) },
        text = {
            Column(modifier = Modifier.verticalScroll(rememberScrollState())) {
                Text(
                    text = stringResource(R.string.upgrade_request_price_label, priceUsd),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )

                if (state.success) {
                    Text(
                        text = stringResource(R.string.upgrade_request_success_sent),
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.primary,
                        modifier = Modifier.padding(top = 12.dp),
                    )
                    return@Column
                }

                Surface(
                    color = MaterialTheme.colorScheme.surfaceVariant,
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(top = 12.dp),
                ) {
                    Column(modifier = Modifier.padding(12.dp)) {
                        Text(
                            text = stringResource(R.string.upgrade_request_bank_instructions_title),
                            style = MaterialTheme.typography.labelLarge,
                            color = MaterialTheme.colorScheme.primary,
                        )
                        Text(
                            text = stringResource(R.string.upgrade_request_bank_transfer_instruction),
                            style = MaterialTheme.typography.bodySmall,
                            modifier = Modifier.padding(top = 4.dp),
                        )
                        Text(
                            text = "${stringResource(R.string.upgrade_request_bank_label)} Swissquote Bank SA",
                            style = MaterialTheme.typography.bodySmall,
                            modifier = Modifier.padding(top = 6.dp),
                        )
                        Text(
                            text = "${stringResource(R.string.upgrade_request_account_label)} 1234-5678-90",
                            style = MaterialTheme.typography.bodySmall,
                        )
                        Text(
                            text = "${stringResource(R.string.upgrade_request_iban_label)} CH93 1234 5678 9012 3456 7",
                            style = MaterialTheme.typography.bodySmall,
                        )
                        Text(
                            text = "${stringResource(R.string.upgrade_request_bic_label)} SWQBCHZZ",
                            style = MaterialTheme.typography.bodySmall,
                        )
                        Text(
                            text = "${stringResource(R.string.upgrade_request_reference_label)} Your email + Plan name",
                            style = MaterialTheme.typography.bodySmall,
                        )
                    }
                }

                Text(
                    text = stringResource(R.string.upgrade_request_payment_method_label),
                    style = MaterialTheme.typography.labelMedium,
                    modifier = Modifier.padding(top = 12.dp),
                )
                listOf(
                    "bank" to stringResource(R.string.upgrade_request_method_bank),
                    "paypal" to stringResource(R.string.upgrade_request_method_paypal),
                    "crypto" to stringResource(R.string.upgrade_request_method_crypto),
                ).forEach { (value, label) ->
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        modifier = Modifier
                            .fillMaxWidth()
                            .selectable(
                                selected = state.paymentMethod == value,
                                onClick = { onPaymentMethodChange(value) },
                            ),
                    ) {
                        RadioButton(selected = state.paymentMethod == value, onClick = { onPaymentMethodChange(value) })
                        Text(text = label, modifier = Modifier.padding(start = 4.dp))
                    }
                }

                Text(
                    text = stringResource(R.string.upgrade_request_note_label),
                    style = MaterialTheme.typography.labelMedium,
                    modifier = Modifier.padding(top = 8.dp),
                )
                OutlinedTextField(
                    value = state.note,
                    onValueChange = onNoteChange,
                    placeholder = { Text(stringResource(R.string.upgrade_request_note_placeholder)) },
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(top = 4.dp),
                )

                if (state.error != null) {
                    Text(
                        text = state.error,
                        color = MaterialTheme.colorScheme.error,
                        modifier = Modifier.padding(top = 8.dp),
                    )
                }

                Text(
                    text = stringResource(R.string.upgrade_request_footer_note),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.padding(top = 12.dp),
                )
            }
        },
        confirmButton = {
            if (!state.success) {
                TextButton(onClick = onSubmit, enabled = !state.isSubmitting) {
                    if (state.isSubmitting) {
                        CircularProgressIndicator(modifier = Modifier.padding(end = 8.dp), strokeWidth = 2.dp)
                        Text(stringResource(R.string.upgrade_request_sending))
                    } else {
                        Text(stringResource(R.string.upgrade_request_submit_button))
                    }
                }
            }
        },
        dismissButton = {
            if (!state.success) {
                TextButton(onClick = onDismiss, enabled = !state.isSubmitting) {
                    Text(stringResource(R.string.action_cancel))
                }
            }
        },
    )
}
