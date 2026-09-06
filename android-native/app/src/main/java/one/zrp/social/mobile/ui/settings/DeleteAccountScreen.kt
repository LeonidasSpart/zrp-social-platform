package one.zrp.social.mobile.ui.settings

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
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
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import one.zrp.social.mobile.R
import one.zrp.social.mobile.data.SettingsRepository
import one.zrp.social.mobile.ui.theme.Spacing
import one.zrp.social.mobile.util.formatAbsoluteDateEnglish

/**
 * Real 30-day scheduled deletion, matching src/app/settings/delete/
 * page.tsx exactly: a first request schedules deletion (or cancels an
 * already-pending one), and a separate typed "DELETE" confirmation
 * deletes the account immediately without waiting out the 30 days.
 */
@Composable
fun DeleteAccountScreen(onBack: () -> Unit, onAccountDeleted: () -> Unit) {
    val viewModel: DeleteAccountViewModel = viewModel(
        factory = remember { DeleteAccountViewModelFactory(SettingsRepository()) },
    )
    val state by viewModel.state.collectAsState()
    var showConfirmDialog by remember { mutableStateOf(false) }
    var confirmText by remember { mutableStateOf("") }

    LaunchedEffect(state.deleted) {
        if (state.deleted) onAccountDeleted()
    }

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
            Text(
                text = stringResource(R.string.delete_account_title),
                style = MaterialTheme.typography.titleMedium,
                modifier = Modifier.padding(start = 4.dp),
            )
        }
        HorizontalDivider()

        if (state.isLoading) {
            Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                CircularProgressIndicator()
            }
        } else {
            Column(modifier = Modifier.fillMaxSize().padding(Spacing.lg)) {
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .clip(MaterialTheme.shapes.medium)
                        .background(MaterialTheme.colorScheme.errorContainer)
                        .padding(Spacing.lg),
                ) {
                    Column {
                        if (state.isScheduled && state.scheduledFor != null) {
                            Text(
                                text = stringResource(
                                    R.string.delete_account_scheduled_message,
                                    formatAbsoluteDateEnglish(state.scheduledFor!!),
                                ),
                                style = MaterialTheme.typography.bodyMedium,
                                color = MaterialTheme.colorScheme.onErrorContainer,
                            )
                            Text(
                                text = stringResource(R.string.delete_account_cancel_anytime_hint),
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onErrorContainer,
                                modifier = Modifier.padding(top = Spacing.xs),
                            )
                        } else {
                            Text(
                                text = stringResource(R.string.delete_account_permanent_warning),
                                style = MaterialTheme.typography.bodyMedium,
                                fontWeight = FontWeight.Bold,
                                color = MaterialTheme.colorScheme.onErrorContainer,
                            )
                            Text(
                                text = stringResource(R.string.delete_account_deleting_will_intro),
                                style = MaterialTheme.typography.bodyMedium,
                                color = MaterialTheme.colorScheme.onErrorContainer,
                                modifier = Modifier.padding(top = Spacing.xs),
                            )
                            val bulletKeys = listOf(
                                R.string.delete_account_bullet1,
                                R.string.delete_account_bullet2,
                                R.string.delete_account_bullet3,
                                R.string.delete_account_bullet4,
                                R.string.delete_account_bullet5,
                            )
                            bulletKeys.forEach { bulletRes ->
                                Text(
                                    text = "•  ${stringResource(bulletRes)}",
                                    style = MaterialTheme.typography.bodySmall,
                                    color = MaterialTheme.colorScheme.onErrorContainer,
                                    modifier = Modifier.padding(top = Spacing.xs, start = Spacing.sm),
                                )
                            }
                            Text(
                                text = "${stringResource(R.string.delete_account_schedule_hint_pre)} " +
                                    "${stringResource(R.string.delete_account_thirty_days_bold)}. " +
                                    stringResource(R.string.delete_account_schedule_hint_post),
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onErrorContainer,
                                modifier = Modifier.padding(top = Spacing.sm),
                            )
                        }
                    }
                }

                if (state.infoMessage != null) {
                    Text(
                        text = state.infoMessage ?: "",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.primary,
                        modifier = Modifier.padding(top = Spacing.sm),
                    )
                }
                if (state.error != null) {
                    Text(
                        text = state.error ?: "",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.error,
                        modifier = Modifier.padding(top = Spacing.sm),
                    )
                }

                Button(
                    onClick = { viewModel.toggleScheduledDeletion() },
                    enabled = !state.isSubmitting,
                    colors = ButtonDefaults.buttonColors(
                        containerColor = if (state.isScheduled) {
                            MaterialTheme.colorScheme.surfaceContainerHigh
                        } else {
                            MaterialTheme.colorScheme.error
                        },
                        contentColor = if (state.isScheduled) {
                            MaterialTheme.colorScheme.onSurface
                        } else {
                            MaterialTheme.colorScheme.onError
                        },
                    ),
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(top = Spacing.lg),
                ) {
                    if (state.isSubmitting) {
                        CircularProgressIndicator(modifier = Modifier.size(20.dp), strokeWidth = 2.dp)
                    } else {
                        Text(
                            stringResource(
                                if (state.isScheduled) {
                                    R.string.delete_account_cancel_deletion_request
                                } else {
                                    R.string.delete_account_request_deletion
                                },
                            ),
                        )
                    }
                }

                if (state.isScheduled) {
                    OutlinedButton(
                        onClick = { showConfirmDialog = true },
                        enabled = !state.isSubmitting,
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(top = Spacing.sm),
                    ) {
                        Text(
                            stringResource(R.string.delete_account_delete_now),
                            color = MaterialTheme.colorScheme.error,
                        )
                    }
                }
            }
        }
    }

    if (showConfirmDialog) {
        var showTypeMismatchError by remember { mutableStateOf(false) }
        AlertDialog(
            onDismissRequest = { if (!state.isSubmitting) { showConfirmDialog = false; confirmText = "" } },
            title = { Text(stringResource(R.string.delete_account_confirm_deletion_title)) },
            text = {
                Column {
                    Text(
                        "${stringResource(R.string.delete_account_confirm_instruction_pre)} " +
                            "DELETE " +
                            stringResource(R.string.delete_account_confirm_instruction_post),
                    )
                    OutlinedTextField(
                        value = confirmText,
                        onValueChange = { confirmText = it; showTypeMismatchError = false },
                        placeholder = { Text(stringResource(R.string.delete_account_type_delete_to_confirm)) },
                        singleLine = true,
                        enabled = !state.isSubmitting,
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(top = Spacing.sm),
                    )
                    if (showTypeMismatchError) {
                        Text(
                            text = stringResource(R.string.delete_account_err_type_delete_confirm),
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.error,
                            modifier = Modifier.padding(top = Spacing.xs),
                        )
                    }
                }
            },
            confirmButton = {
                if (state.isSubmitting) {
                    CircularProgressIndicator(modifier = Modifier.size(20.dp), strokeWidth = 2.dp)
                } else {
                    TextButton(
                        onClick = {
                            if (confirmText == "DELETE") {
                                viewModel.confirmDeletion()
                            } else {
                                showTypeMismatchError = true
                            }
                        },
                    ) {
                        Text(
                            stringResource(R.string.delete_account_permanently_delete),
                            color = MaterialTheme.colorScheme.error,
                        )
                    }
                }
            },
            dismissButton = {
                TextButton(
                    onClick = { showConfirmDialog = false; confirmText = "" },
                    enabled = !state.isSubmitting,
                ) { Text(stringResource(R.string.action_cancel)) }
            },
        )
    }
}
