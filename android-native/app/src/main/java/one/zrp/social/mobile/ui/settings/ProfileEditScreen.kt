package one.zrp.social.mobile.ui.settings

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
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
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import one.zrp.social.mobile.R
import one.zrp.social.mobile.data.SettingsRepository
import one.zrp.social.mobile.ui.theme.Spacing
import one.zrp.social.mobile.ui.theme.ZrpRed

/**
 * The Profile category screen - name/bio/location/country/website,
 * the same fields the website's own Profile settings form edits (see
 * ProfileEditViewModel's KDoc for what this slice deliberately doesn't
 * cover yet: avatar upload, the professional-profile category picker).
 */
@Composable
fun ProfileEditScreen(onBack: () -> Unit) {
    val viewModel: ProfileEditViewModel = viewModel(
        factory = remember { ProfileEditViewModelFactory(SettingsRepository()) },
    )
    val state by viewModel.state.collectAsState()

    LaunchedEffect(state.saved) {
        if (state.saved) viewModel.consumeSavedEvent()
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
                text = stringResource(R.string.settings_profile_category),
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
            ProfileEditForm(state = state, viewModel = viewModel)
        }
    }
}

@Composable
private fun ProfileEditForm(state: ProfileEditUiState, viewModel: ProfileEditViewModel) {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(Spacing.lg),
    ) {
        OutlinedTextField(
            value = state.name,
            onValueChange = viewModel::onNameChange,
            label = { Text(stringResource(R.string.settings_display_name)) },
            singleLine = true,
            enabled = !state.isSaving,
            modifier = Modifier.fillMaxWidth(),
        )

        OutlinedTextField(
            value = state.bio,
            onValueChange = { if (it.length <= 160) viewModel.onBioChange(it) },
            label = { Text(stringResource(R.string.settings_bio)) },
            enabled = !state.isSaving,
            minLines = 3,
            modifier = Modifier
                .fillMaxWidth()
                .padding(top = Spacing.md),
        )
        Text(
            text = "${state.bio.length}/160",
            style = MaterialTheme.typography.labelSmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.padding(top = 2.dp),
        )

        OutlinedTextField(
            value = state.location,
            onValueChange = viewModel::onLocationChange,
            label = { Text(stringResource(R.string.settings_city)) },
            singleLine = true,
            enabled = !state.isSaving,
            modifier = Modifier
                .fillMaxWidth()
                .padding(top = Spacing.md),
        )

        OutlinedTextField(
            value = state.country,
            onValueChange = viewModel::onCountryChange,
            label = { Text(stringResource(R.string.settings_country)) },
            singleLine = true,
            enabled = !state.isSaving,
            modifier = Modifier
                .fillMaxWidth()
                .padding(top = Spacing.md),
        )

        OutlinedTextField(
            value = state.website,
            onValueChange = viewModel::onWebsiteChange,
            label = { Text(stringResource(R.string.settings_website)) },
            singleLine = true,
            enabled = !state.isSaving,
            modifier = Modifier
                .fillMaxWidth()
                .padding(top = Spacing.md),
        )

        if (state.error != null) {
            Text(
                text = state.error ?: "",
                color = MaterialTheme.colorScheme.error,
                style = MaterialTheme.typography.bodySmall,
                modifier = Modifier.padding(top = Spacing.sm),
            )
        }

        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(top = Spacing.lg),
            horizontalArrangement = Arrangement.End,
        ) {
            Button(
                onClick = { viewModel.save() },
                enabled = !state.isSaving,
                colors = ButtonDefaults.buttonColors(containerColor = ZrpRed),
            ) {
                if (state.isSaving) {
                    CircularProgressIndicator(
                        modifier = Modifier.size(20.dp),
                        color = MaterialTheme.colorScheme.onPrimary,
                        strokeWidth = 2.dp,
                    )
                } else {
                    Text(stringResource(R.string.action_save))
                }
            }
        }
    }
}
