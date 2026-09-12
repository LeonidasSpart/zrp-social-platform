package one.zrp.social.mobile.ui.settings

import android.content.Intent
import androidx.compose.foundation.clickable
import androidx.compose.ui.semantics.Role
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.ChevronRight
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import androidx.core.content.FileProvider
import androidx.lifecycle.viewmodel.compose.viewModel
import one.zrp.social.mobile.R
import one.zrp.social.mobile.data.SettingsRepository
import one.zrp.social.mobile.ui.theme.Spacing
import one.zrp.social.mobile.ui.theme.ZrpRed
import one.zrp.social.mobile.util.formatRelativeTime

/**
 * The Account category screen - account info, username change, email
 * change, data export, moderation appeals, and a link out to account
 * deletion. Custom profile URL (plan-gated) is the one genuinely
 * backend-supported field not yet native - see SettingsRepository's KDoc.
 */
@Composable
fun AccountSettingsScreen(onBack: () -> Unit, onOpenDeleteAccount: () -> Unit, onOpenAppeals: () -> Unit) {
    val viewModel: AccountSettingsViewModel = viewModel(
        factory = remember { AccountSettingsViewModelFactory(SettingsRepository()) },
    )
    val state by viewModel.state.collectAsState()
    val context = LocalContext.current

    // Fires once per fresh export: hands the downloaded file to a
    // FileProvider content:// Uri and opens the share sheet, then tells
    // the ViewModel the one-shot event has been consumed so rotation or
    // recomposition doesn't relaunch the same Intent.
    LaunchedEffect(state.exportedFile) {
        val file = state.exportedFile ?: return@LaunchedEffect
        val uri = FileProvider.getUriForFile(context, "${context.packageName}.fileprovider", file)
        val intent = Intent(Intent.ACTION_SEND).apply {
            type = "application/json"
            putExtra(Intent.EXTRA_STREAM, uri)
            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
        }
        context.startActivity(Intent.createChooser(intent, null))
        viewModel.onExportedFileConsumed()
    }

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
                text = stringResource(R.string.settings_account),
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
            Column(
                modifier = Modifier
                    .fillMaxSize()
                    .verticalScroll(rememberScrollState())
                    .padding(Spacing.lg),
            ) {
                Text(text = stringResource(R.string.settings_account_info), style = MaterialTheme.typography.titleSmall)
                Text(
                    text = state.currentEmail,
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.padding(top = Spacing.xs),
                )
                if (state.joinedAt != null) {
                    Text(
                        text = stringResource(R.string.settings_joined, formatRelativeTime(state.joinedAt!!)),
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }

                HorizontalDivider(modifier = Modifier.padding(vertical = Spacing.lg))

                Text(text = stringResource(R.string.settings_username_title), style = MaterialTheme.typography.titleSmall)
                if (state.usernameCooldownDays > 0) {
                    Text(
                        text = stringResource(R.string.settings_username_cooldown_banner, state.usernameCooldownDays),
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.error,
                        modifier = Modifier.padding(top = Spacing.xs),
                    )
                }
                OutlinedTextField(
                    value = state.newUsername,
                    onValueChange = viewModel::onNewUsernameChange,
                    label = { Text(stringResource(R.string.settings_new_username)) },
                    singleLine = true,
                    enabled = !state.isUpdatingUsername && state.usernameCooldownDays <= 0,
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(top = Spacing.sm),
                )
                if (state.usernameError != null) {
                    Text(
                        text = state.usernameError ?: "",
                        color = MaterialTheme.colorScheme.error,
                        style = MaterialTheme.typography.bodySmall,
                        modifier = Modifier.padding(top = Spacing.xs),
                    )
                }
                if (state.usernameSuccess != null) {
                    Text(
                        text = state.usernameSuccess ?: "",
                        color = MaterialTheme.colorScheme.primary,
                        style = MaterialTheme.typography.bodySmall,
                        modifier = Modifier.padding(top = Spacing.xs),
                    )
                }
                Row(modifier = Modifier.fillMaxWidth().padding(top = Spacing.sm), horizontalArrangement = Arrangement.End) {
                    Button(
                        onClick = { viewModel.updateUsername() },
                        enabled = !state.isUpdatingUsername && state.usernameCooldownDays <= 0,
                        colors = ButtonDefaults.buttonColors(containerColor = ZrpRed),
                    ) {
                        if (state.isUpdatingUsername) {
                            CircularProgressIndicator(
                                modifier = Modifier.size(20.dp),
                                color = MaterialTheme.colorScheme.onPrimary,
                                strokeWidth = 2.dp,
                            )
                        } else {
                            Text(stringResource(R.string.settings_change_username))
                        }
                    }
                }

                HorizontalDivider(modifier = Modifier.padding(vertical = Spacing.lg))

                Text(text = stringResource(R.string.settings_change_email), style = MaterialTheme.typography.titleSmall)
                OutlinedTextField(
                    value = state.newEmail,
                    onValueChange = viewModel::onNewEmailChange,
                    label = { Text(stringResource(R.string.settings_new_email)) },
                    singleLine = true,
                    enabled = !state.isUpdatingEmail,
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Email),
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(top = Spacing.sm),
                )
                OutlinedTextField(
                    value = state.emailPassword,
                    onValueChange = viewModel::onEmailPasswordChange,
                    label = { Text(stringResource(R.string.settings_current_password_field)) },
                    singleLine = true,
                    enabled = !state.isUpdatingEmail,
                    visualTransformation = PasswordVisualTransformation(),
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password),
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(top = Spacing.sm),
                )
                if (state.emailError != null) {
                    Text(
                        text = state.emailError ?: "",
                        color = MaterialTheme.colorScheme.error,
                        style = MaterialTheme.typography.bodySmall,
                        modifier = Modifier.padding(top = Spacing.xs),
                    )
                }
                if (state.emailSuccess != null) {
                    Text(
                        text = state.emailSuccess ?: "",
                        color = MaterialTheme.colorScheme.primary,
                        style = MaterialTheme.typography.bodySmall,
                        modifier = Modifier.padding(top = Spacing.xs),
                    )
                }
                Row(modifier = Modifier.fillMaxWidth().padding(top = Spacing.sm), horizontalArrangement = Arrangement.End) {
                    Button(
                        onClick = { viewModel.updateEmail() },
                        enabled = !state.isUpdatingEmail,
                        colors = ButtonDefaults.buttonColors(containerColor = ZrpRed),
                    ) {
                        if (state.isUpdatingEmail) {
                            CircularProgressIndicator(
                                modifier = Modifier.size(20.dp),
                                color = MaterialTheme.colorScheme.onPrimary,
                                strokeWidth = 2.dp,
                            )
                        } else {
                            Text(stringResource(R.string.settings_send_verification_email))
                        }
                    }
                }

                HorizontalDivider(modifier = Modifier.padding(vertical = Spacing.lg))

                Text(text = stringResource(R.string.settings_export_data_heading), style = MaterialTheme.typography.titleSmall)
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(top = Spacing.sm),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text(
                        text = stringResource(R.string.settings_export_data_desc),
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.weight(1f).padding(end = Spacing.md),
                    )
                    Button(
                        onClick = { viewModel.exportData(context.cacheDir) },
                        enabled = !state.isExporting,
                    ) {
                        if (state.isExporting) {
                            CircularProgressIndicator(modifier = Modifier.size(18.dp), strokeWidth = 2.dp)
                        } else {
                            Text(stringResource(R.string.settings_export_data))
                        }
                    }
                }
                if (state.exportError != null) {
                    Text(
                        text = state.exportError ?: "",
                        color = MaterialTheme.colorScheme.error,
                        style = MaterialTheme.typography.bodySmall,
                        modifier = Modifier.padding(top = Spacing.xs),
                    )
                }

                HorizontalDivider(modifier = Modifier.padding(vertical = Spacing.lg))

                // Matches the real Account category's own placement -
                // right between data export and the danger zone (see
                // src/app/settings/page.tsx).
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .clickable(onClick = onOpenAppeals, role = Role.Button)
                        .padding(vertical = Spacing.md),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text(
                        text = stringResource(R.string.appeals_title),
                        style = MaterialTheme.typography.bodyLarge,
                        modifier = Modifier.weight(1f),
                    )
                    Icon(Icons.Filled.ChevronRight, contentDescription = null, tint = MaterialTheme.colorScheme.onSurfaceVariant)
                }

                HorizontalDivider(modifier = Modifier.padding(vertical = Spacing.lg))

                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .clickable(onClick = onOpenDeleteAccount, role = Role.Button)
                        .padding(vertical = Spacing.md),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text(
                        text = stringResource(R.string.settings_delete_account),
                        style = MaterialTheme.typography.bodyLarge,
                        color = MaterialTheme.colorScheme.error,
                        modifier = Modifier.weight(1f),
                    )
                    Icon(Icons.Filled.ChevronRight, contentDescription = null, tint = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            }
        }
    }
}

