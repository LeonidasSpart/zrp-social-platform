package one.zrp.social.mobile.ui.settings

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.ContentCopy
import androidx.compose.material.icons.filled.Key
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.DeleteOutline
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
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
import androidx.compose.ui.platform.LocalClipboardManager
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import kotlinx.coroutines.delay
import one.zrp.social.mobile.R
import one.zrp.social.mobile.data.ApiKeysRepository
import one.zrp.social.mobile.network.ApiKeyItem
import one.zrp.social.mobile.ui.theme.Spacing
import one.zrp.social.mobile.ui.theme.ZrpGreen
import one.zrp.social.mobile.ui.theme.ZrpRed
import one.zrp.social.mobile.util.formatRelativeTime

private const val CURL_TARGET = "https://zrp.one/api/external/me"

/**
 * API Keys (src/app/settings/api-keys/page.tsx) - see ApiKeysViewModel's
 * own KDoc for what's deliberately not reproduced natively (the
 * plan-upgrade CTA). The website's desktop table becomes a card list
 * here, matching TeamScreen's own restructuring of the identical
 * pattern.
 */
@Composable
fun ApiKeysScreen(onBack: () -> Unit) {
    val viewModel: ApiKeysViewModel = viewModel(factory = remember { ApiKeysViewModelFactory(ApiKeysRepository()) })
    val state by viewModel.state.collectAsState()

    Column(modifier = Modifier.fillMaxSize()) {
        Row(
            modifier = Modifier.fillMaxWidth().padding(horizontal = 8.dp, vertical = 4.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            IconButton(onClick = onBack) {
                Icon(Icons.Filled.ArrowBack, contentDescription = stringResource(R.string.nav_back))
            }
            Column(modifier = Modifier.padding(start = 4.dp)) {
                Text(text = stringResource(R.string.api_keys_title), style = MaterialTheme.typography.titleMedium)
                Text(
                    text = stringResource(R.string.api_keys_subtitle),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
        HorizontalDivider()

        state.toast?.let { toast ->
            ApiKeysToastBanner(toast = toast, onDismiss = viewModel::dismissToast)
        }

        when {
            state.isLoading -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) { CircularProgressIndicator() }
            !state.isEligible -> ApiKeysIneligibleBody(message = state.ineligibleMessage)
            state.loadError != null -> Box(Modifier.fillMaxSize().padding(24.dp), contentAlignment = Alignment.Center) {
                Text(
                    text = state.loadError ?: stringResource(R.string.api_keys_err_load_failed),
                    color = MaterialTheme.colorScheme.error,
                    textAlign = TextAlign.Center,
                )
            }
            else -> ApiKeysBody(state = state, viewModel = viewModel)
        }
    }

    if (state.showCreateDialog) {
        CreateKeyDialog(state = state, viewModel = viewModel)
    }
    state.newPlainKey?.let { plainKey ->
        NewKeyDialog(plainKey = plainKey, onDone = viewModel::dismissNewKeyDialog)
    }
    if (state.showRevokeDialog && state.revokeTarget != null) {
        RevokeKeyDialog(target = state.revokeTarget!!, viewModel = viewModel)
    }
}

@Composable
private fun ApiKeysToastBanner(toast: ApiKeysToast, onDismiss: () -> Unit) {
    val (title, description) = apiKeysToastText(toast)
    val bg = if (toast.type == ToastType.SUCCESS) ZrpGreen.copy(alpha = 0.12f) else MaterialTheme.colorScheme.errorContainer
    val fg = if (toast.type == ToastType.SUCCESS) ZrpGreen else MaterialTheme.colorScheme.onErrorContainer

    Row(
        modifier = Modifier.fillMaxWidth().background(bg).padding(Spacing.md),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Column(modifier = Modifier.weight(1f)) {
            Text(text = title, color = fg, style = MaterialTheme.typography.bodyMedium)
            if (description != null) {
                Text(text = description, color = fg, style = MaterialTheme.typography.bodySmall)
            }
        }
        TextButton(onClick = onDismiss) { Text("×") }
    }
}

// Maps the ViewModel's semantic toast onto the real translated strings -
// stringResource() only resolves inside a @Composable.
@Composable
private fun apiKeysToastText(toast: ApiKeysToast): Pair<String, String?> {
    return when (toast.title) {
        "revoked" -> stringResource(R.string.api_keys_revoked_title) to stringResource(R.string.api_keys_revoked_desc)
        // Matches the website's own showToast calls for failures: a
        // real translated "Error" title (apiKeys.errTitle), unlike
        // Team's own showToast, which hardcodes the untranslated
        // literal "Error" - a real difference between the two web
        // pages this mirrors rather than smooths over.
        else -> stringResource(R.string.api_keys_err_title) to toast.description
    }
}

@Composable
private fun ApiKeysIneligibleBody(message: String?) {
    Column(
        modifier = Modifier.fillMaxSize().padding(32.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        Text(text = stringResource(R.string.api_keys_upgrade_required), style = MaterialTheme.typography.titleLarge)
        Text(
            text = message ?: stringResource(R.string.api_keys_err_upgrade_business_desc),
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            textAlign = TextAlign.Center,
            modifier = Modifier.padding(top = Spacing.sm),
        )
    }
}

@Composable
private fun ApiKeysBody(state: ApiKeysUiState, viewModel: ApiKeysViewModel) {
    val clipboard = LocalClipboardManager.current

    LazyColumn(modifier = Modifier.fillMaxSize().padding(Spacing.md)) {
        item {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Column {
                    Text(text = stringResource(R.string.api_keys_your_keys), style = MaterialTheme.typography.titleMedium)
                    Text(
                        text = stringResource(R.string.api_keys_key_count, state.keys.size, if (state.keys.size != 1) "s" else ""),
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
                Button(onClick = viewModel::openCreateDialog) {
                    Icon(Icons.Filled.Add, contentDescription = null, modifier = Modifier.padding(end = Spacing.xs))
                    Text(stringResource(R.string.api_keys_generate_key))
                }
            }
            Spacer(modifier = Modifier.height(Spacing.md))
        }

        if (state.keys.isEmpty()) {
            item {
                Column(Modifier.fillMaxWidth().padding(Spacing.lg), horizontalAlignment = Alignment.CenterHorizontally) {
                    Icon(Icons.Filled.Key, contentDescription = null, tint = MaterialTheme.colorScheme.onSurfaceVariant)
                    Text(
                        text = stringResource(R.string.api_keys_no_keys_yet),
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.padding(top = Spacing.xs),
                    )
                }
            }
        } else {
            items(state.keys, key = { it.id }) { key ->
                ApiKeyRow(key = key, onRevoke = { viewModel.openRevokeDialog(key) })
                HorizontalDivider(modifier = Modifier.padding(vertical = Spacing.xs))
            }
        }

        item {
            Spacer(modifier = Modifier.height(Spacing.lg))
            HowToUseCard(clipboard = { clipboard.setText(AnnotatedString(it)) })
        }

        item {
            Spacer(modifier = Modifier.height(Spacing.lg))
            ApiKeysPlanInfoCard(state = state)
        }
    }
}

@Composable
private fun ApiKeyRow(key: ApiKeyItem, onRevoke: () -> Unit) {
    Row(
        modifier = Modifier.fillMaxWidth().padding(vertical = Spacing.xs),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Column(modifier = Modifier.weight(1f)) {
            Text(text = key.name, style = MaterialTheme.typography.bodyMedium)
            Text(
                text = stringResource(R.string.api_keys_col_created) + ": " + formatRelativeTime(key.createdAt),
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            val lastUsedText = key.lastUsed?.let { formatRelativeTime(it) } ?: stringResource(R.string.api_keys_never)
            Text(
                text = stringResource(R.string.api_keys_col_last_used) + ": " + lastUsedText,
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            val expiresText = key.expiresAt?.let { formatRelativeTime(it) } ?: stringResource(R.string.api_keys_never)
            Text(
                text = stringResource(R.string.api_keys_col_expires) + ": " + expiresText,
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
        IconButton(onClick = onRevoke) {
            Icon(Icons.Filled.DeleteOutline, contentDescription = stringResource(R.string.team_remove), tint = ZrpRed)
        }
    }
}

@Composable
private fun HowToUseCard(clipboard: (String) -> Unit) {
    Column(modifier = Modifier.fillMaxWidth()) {
        Text(text = stringResource(R.string.api_keys_how_to_use), style = MaterialTheme.typography.titleMedium)
        Text(
            text = stringResource(R.string.api_keys_how_to_use_desc),
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Spacer(modifier = Modifier.height(Spacing.sm))

        val exampleCurl = "curl -H \"Authorization: Bearer YOUR_API_KEY\" \\\n  $CURL_TARGET"
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .clip(RoundedCornerShape(8.dp))
                .background(MaterialTheme.colorScheme.inverseSurface)
                .padding(Spacing.md),
        ) {
            var copied by remember { mutableStateOf(false) }
            // Matches the website's own 3-second copied-label reset.
            LaunchedEffect(copied) {
                if (copied) {
                    delay(3000)
                    copied = false
                }
            }
            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.End) {
                TextButton(onClick = { clipboard(exampleCurl); copied = true }) {
                    Icon(Icons.Filled.ContentCopy, contentDescription = null, tint = MaterialTheme.colorScheme.inverseOnSurface)
                    Text(
                        text = stringResource(if (copied) R.string.api_keys_copied else R.string.api_keys_copy),
                        color = MaterialTheme.colorScheme.inverseOnSurface,
                        style = MaterialTheme.typography.labelSmall,
                        modifier = Modifier.padding(start = Spacing.xs),
                    )
                }
            }
            Text(
                text = exampleCurl,
                color = ZrpGreen,
                style = MaterialTheme.typography.bodySmall,
                fontFamily = FontFamily.Monospace,
            )
        }

        Spacer(modifier = Modifier.height(Spacing.sm))
        Text(text = stringResource(R.string.api_keys_available_endpoints), style = MaterialTheme.typography.labelLarge, color = ZrpRed)
        Text(
            text = "GET /api/external/me: " + stringResource(R.string.api_keys_endpoint_me),
            style = MaterialTheme.typography.bodySmall,
        )
        Text(
            text = "GET /api/external/me/posts: " + stringResource(R.string.api_keys_endpoint_posts),
            style = MaterialTheme.typography.bodySmall,
        )
        Text(
            text = stringResource(R.string.api_keys_more_endpoints),
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )

        Spacer(modifier = Modifier.height(Spacing.sm))
        Text(
            text = stringResource(R.string.api_keys_security) + " " + stringResource(R.string.api_keys_security_desc),
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Text(
            text = stringResource(R.string.api_keys_rate_limiting) + " " + stringResource(R.string.api_keys_rate_limiting_desc),
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
}

@Composable
private fun ApiKeysPlanInfoCard(state: ApiKeysUiState) {
    Column(modifier = Modifier.fillMaxWidth()) {
        Text(text = stringResource(R.string.api_keys_access_plan), style = MaterialTheme.typography.titleMedium)
        Text(
            text = stringResource(R.string.api_keys_access_plan_desc),
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Spacer(modifier = Modifier.height(Spacing.sm))
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .clip(RoundedCornerShape(8.dp))
                .background(MaterialTheme.colorScheme.surfaceVariant)
                .padding(Spacing.md),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Column {
                Text(text = stringResource(R.string.api_keys_current_plan), style = MaterialTheme.typography.bodyMedium)
                Text(text = state.plan.replaceFirstChar { it.uppercase() }, style = MaterialTheme.typography.bodySmall)
            }
            Text(text = stringResource(R.string.api_keys_access_enabled), color = ZrpGreen, style = MaterialTheme.typography.labelMedium)
        }
    }
}

@Composable
private fun CreateKeyDialog(state: ApiKeysUiState, viewModel: ApiKeysViewModel) {
    var expiryMenuOpen by remember { mutableStateOf(false) }
    val expiryOptions = listOf(
        30 to stringResource(R.string.api_keys_days30),
        90 to stringResource(R.string.api_keys_days90),
        365 to stringResource(R.string.api_keys_days365),
        0 to stringResource(R.string.api_keys_never_expires),
    )
    val currentLabel = expiryOptions.firstOrNull { it.first == state.expiresInDays }?.second ?: state.expiresInDays.toString()

    AlertDialog(
        onDismissRequest = viewModel::dismissCreateDialog,
        title = { Text(stringResource(R.string.api_keys_generate_dialog_title)) },
        text = {
            Column {
                Text(text = stringResource(R.string.api_keys_key_name), style = MaterialTheme.typography.labelMedium)
                OutlinedTextField(
                    value = state.keyName,
                    onValueChange = viewModel::onKeyNameChange,
                    placeholder = { Text(stringResource(R.string.api_keys_key_name_placeholder)) },
                    enabled = !state.isSubmitting,
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth(),
                )
                Spacer(modifier = Modifier.height(Spacing.md))
                Text(text = stringResource(R.string.api_keys_expires_in), style = MaterialTheme.typography.labelMedium)
                Box {
                    TextButton(onClick = { expiryMenuOpen = true }, enabled = !state.isSubmitting) {
                        Text(currentLabel)
                    }
                    DropdownMenu(expanded = expiryMenuOpen, onDismissRequest = { expiryMenuOpen = false }) {
                        expiryOptions.forEach { (days, label) ->
                            DropdownMenuItem(
                                text = { Text(label) },
                                onClick = { expiryMenuOpen = false; viewModel.onExpiresInDaysChange(days) },
                            )
                        }
                    }
                }
            }
        },
        confirmButton = {
            TextButton(onClick = viewModel::createKey, enabled = !state.isSubmitting) {
                Text(if (state.isSubmitting) stringResource(R.string.api_keys_generating) else stringResource(R.string.api_keys_generate))
            }
        },
        dismissButton = {
            TextButton(onClick = viewModel::dismissCreateDialog, enabled = !state.isSubmitting) {
                Text(stringResource(R.string.api_keys_cancel))
            }
        },
    )
}

@Composable
private fun NewKeyDialog(plainKey: String, onDone: () -> Unit) {
    val clipboard = LocalClipboardManager.current

    AlertDialog(
        onDismissRequest = onDone,
        title = { Text(stringResource(R.string.api_keys_key_generated), color = ZrpGreen) },
        text = {
            Column {
                Text(text = stringResource(R.string.api_keys_copy_now_warning), style = MaterialTheme.typography.bodySmall)
                Spacer(modifier = Modifier.height(Spacing.sm))
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .clip(RoundedCornerShape(8.dp))
                        .background(MaterialTheme.colorScheme.surfaceVariant)
                        .padding(Spacing.sm),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text(text = plainKey, style = MaterialTheme.typography.bodySmall, fontFamily = FontFamily.Monospace, modifier = Modifier.weight(1f))
                    IconButton(onClick = { clipboard.setText(AnnotatedString(plainKey)) }) {
                        Icon(Icons.Filled.ContentCopy, contentDescription = stringResource(R.string.api_keys_copy))
                    }
                }
                Spacer(modifier = Modifier.height(Spacing.sm))
                Text(text = stringResource(R.string.api_keys_try_it_now), style = MaterialTheme.typography.labelSmall)
                Text(
                    text = "curl -H \"Authorization: Bearer $plainKey\" \\\n  $CURL_TARGET",
                    color = ZrpGreen,
                    style = MaterialTheme.typography.bodySmall,
                    fontFamily = FontFamily.Monospace,
                )
            }
        },
        confirmButton = {
            TextButton(onClick = onDone) { Text(stringResource(R.string.api_keys_done)) }
        },
    )
}

@Composable
private fun RevokeKeyDialog(target: ApiKeyItem, viewModel: ApiKeysViewModel) {
    AlertDialog(
        onDismissRequest = viewModel::dismissRevokeDialog,
        title = { Text(target.name) },
        text = { Text(stringResource(R.string.api_keys_err_revoke_confirm)) },
        confirmButton = {
            // No dedicated "Revoke" verb string exists on web (its own
            // confirm() dialog has no custom button text at all) -
            // reuses team_remove, the closest real translated
            // destructive-action verb already in this app, for the
            // same reason RemoveMemberDialog does.
            TextButton(onClick = viewModel::confirmRevokeKey) {
                Text(stringResource(R.string.team_remove), color = MaterialTheme.colorScheme.error)
            }
        },
        dismissButton = {
            TextButton(onClick = viewModel::dismissRevokeDialog) { Text(stringResource(R.string.api_keys_cancel)) }
        },
    )
}
