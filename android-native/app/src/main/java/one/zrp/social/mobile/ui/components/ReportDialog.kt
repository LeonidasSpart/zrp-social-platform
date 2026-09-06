package one.zrp.social.mobile.ui.components

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
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import one.zrp.social.mobile.R
import one.zrp.social.mobile.network.ReportReasons

/**
 * The real, translated display label for a fixed-English reason value
 * from [ReportReasons] - matches ReportModal.tsx's own `reasons` array,
 * which keeps the submitted value in English (moderators/the
 * transparency dashboard match on it verbatim) while only translating
 * what the reporter sees.
 */
@Composable
private fun reasonLabel(reason: String): String = when (reason) {
    "Spam" -> stringResource(R.string.report_reason_spam)
    "Harassment or bullying" -> stringResource(R.string.report_reason_harassment)
    "Inappropriate content" -> stringResource(R.string.report_reason_inappropriate)
    "Misinformation" -> stringResource(R.string.report_reason_misinformation)
    "Hate speech" -> stringResource(R.string.report_reason_hate_speech)
    "Impersonation" -> stringResource(R.string.report_reason_impersonation)
    else -> stringResource(R.string.report_reason_other)
}

/**
 * The same reason list and semantics as the website's ReportModal -
 * submits to the same real /api/reports pipeline moderators review,
 * regardless of which client filed it.
 */
@Composable
fun ReportDialog(
    isSubmitting: Boolean,
    error: String?,
    onDismiss: () -> Unit,
    onSubmit: (reason: String, details: String?) -> Unit,
) {
    var selectedReason by remember { mutableStateOf<String?>(null) }
    var details by remember { mutableStateOf("") }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(stringResource(R.string.report_modal_title)) },
        text = {
            Column(modifier = Modifier.verticalScroll(rememberScrollState())) {
                Text(
                    text = stringResource(R.string.report_reason_label),
                    style = MaterialTheme.typography.labelMedium,
                )
                ReportReasons.forEach { reason ->
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        modifier = Modifier
                            .fillMaxWidth()
                            .selectable(
                                selected = selectedReason == reason,
                                onClick = { selectedReason = reason },
                            ),
                    ) {
                        RadioButton(selected = selectedReason == reason, onClick = { selectedReason = reason })
                        Text(text = reasonLabel(reason), modifier = Modifier.padding(start = 4.dp))
                    }
                }

                Text(
                    text = stringResource(R.string.report_details_label),
                    style = MaterialTheme.typography.labelMedium,
                    modifier = Modifier.padding(top = 8.dp),
                )
                OutlinedTextField(
                    value = details,
                    onValueChange = { details = it },
                    placeholder = { Text(stringResource(R.string.report_details_placeholder)) },
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(top = 4.dp),
                )

                if (error != null) {
                    Text(text = error, color = MaterialTheme.colorScheme.error, modifier = Modifier.padding(top = 8.dp))
                }
            }
        },
        confirmButton = {
            if (isSubmitting) {
                CircularProgressIndicator(modifier = Modifier.padding(8.dp))
            } else {
                TextButton(
                    onClick = { selectedReason?.let { onSubmit(it, details.ifBlank { null }) } },
                    enabled = selectedReason != null,
                ) {
                    Text(stringResource(R.string.report_submit))
                }
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss, enabled = !isSubmitting) {
                Text(stringResource(R.string.action_cancel))
            }
        },
    )
}
