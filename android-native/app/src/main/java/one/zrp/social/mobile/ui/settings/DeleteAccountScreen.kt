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
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import one.zrp.social.mobile.data.SettingsRepository
import one.zrp.social.mobile.ui.theme.Spacing
import one.zrp.social.mobile.util.formatRelativeTime

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
                text = "Delete account",
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
                                text = "Your account is scheduled for deletion ${formatRelativeTime(state.scheduledFor!!)}.",
                                style = MaterialTheme.typography.bodyMedium,
                                color = MaterialTheme.colorScheme.onErrorContainer,
                            )
                        } else {
                            Text(
                                text = "Deleting your account removes your posts, comments, messages, and profile after a 30-day grace period, during which you can cancel.",
                                style = MaterialTheme.typography.bodyMedium,
                                color = MaterialTheme.colorScheme.onErrorContainer,
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
                        Text(if (state.isScheduled) "Cancel deletion" else "Schedule account deletion")
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
                        Text("Delete now instead", color = MaterialTheme.colorScheme.error)
                    }
                }
            }
        }
    }

    if (showConfirmDialog) {
        AlertDialog(
            onDismissRequest = { if (!state.isSubmitting) { showConfirmDialog = false; confirmText = "" } },
            title = { Text("Delete account now?") },
            text = {
                Column {
                    Text("This can't be undone. Type DELETE to confirm.")
                    OutlinedTextField(
                        value = confirmText,
                        onValueChange = { confirmText = it },
                        singleLine = true,
                        enabled = !state.isSubmitting,
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(top = Spacing.sm),
                    )
                }
            },
            confirmButton = {
                if (state.isSubmitting) {
                    CircularProgressIndicator(modifier = Modifier.size(20.dp), strokeWidth = 2.dp)
                } else {
                    TextButton(onClick = { viewModel.confirmDeletion(confirmText) }) {
                        Text("Delete", color = MaterialTheme.colorScheme.error)
                    }
                }
            },
            dismissButton = {
                TextButton(
                    onClick = { showConfirmDialog = false; confirmText = "" },
                    enabled = !state.isSubmitting,
                ) { Text("Cancel") }
            },
        )
    }
}
