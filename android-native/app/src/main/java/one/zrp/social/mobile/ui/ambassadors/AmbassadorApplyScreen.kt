package one.zrp.social.mobile.ui.ambassadors

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Search
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import one.zrp.social.mobile.R
import one.zrp.social.mobile.data.AmbassadorsRepository
import one.zrp.social.mobile.network.AmbassadorCountry
import one.zrp.social.mobile.ui.theme.Radius
import one.zrp.social.mobile.ui.theme.Spacing
import one.zrp.social.mobile.ui.theme.ZrpRed

/**
 * Become a ZRP Ambassador - ported from src/app/ambassadors/apply/page.tsx.
 * See AmbassadorApplyViewModel's own KDoc for the real submit contract.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AmbassadorApplyScreen(
    onBack: () -> Unit,
    initialCountryCode: String?,
) {
    val viewModel: AmbassadorApplyViewModel = viewModel(
        factory = remember(initialCountryCode) {
            AmbassadorApplyViewModelFactory(AmbassadorsRepository(), initialCountryCode)
        },
    )
    val state by viewModel.state.collectAsState()
    var showCountryPicker by remember { mutableStateOf(false) }

    val errCountryRequired = stringResource(R.string.ambassadors_apply_err_country_required)
    val errMotivationRequired = stringResource(R.string.ambassadors_apply_err_motivation_required)
    val errGeneric = stringResource(R.string.ambassadors_apply_err_generic)

    Column(modifier = Modifier.fillMaxSize()) {
        Row(
            modifier = Modifier.fillMaxWidth().padding(horizontal = 8.dp, vertical = 4.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            IconButton(onClick = onBack) {
                Icon(Icons.Filled.ArrowBack, contentDescription = stringResource(R.string.ambassadors_apply_back))
            }
            Text(
                text = stringResource(R.string.ambassadors_apply_title),
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.Bold,
                modifier = Modifier.padding(start = 4.dp),
            )
        }
        HorizontalDivider()

        if (state.success) {
            SuccessBody(onBack = onBack)
        } else {
            Column(
                modifier = Modifier
                    .fillMaxSize()
                    .verticalScroll(rememberScrollState())
                    .padding(Spacing.lg),
            ) {
                Text(
                    text = stringResource(R.string.ambassadors_apply_subtitle),
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )

                FieldLabel(stringResource(R.string.ambassadors_apply_field_country))
                Surface(
                    shape = RoundedCornerShape(Radius.sm),
                    tonalElevation = 1.dp,
                    modifier = Modifier
                        .fillMaxWidth()
                        .clickable { showCountryPicker = true },
                ) {
                    Text(
                        text = state.selectedCountryName ?: stringResource(R.string.ambassadors_apply_select_country),
                        style = MaterialTheme.typography.bodyLarge,
                        color = if (state.selectedCountryName != null) {
                            MaterialTheme.colorScheme.onSurface
                        } else {
                            MaterialTheme.colorScheme.onSurfaceVariant
                        },
                        modifier = Modifier.padding(Spacing.md),
                    )
                }

                FieldLabel(stringResource(R.string.ambassadors_apply_field_city_region), topPadding = Spacing.lg)
                OutlinedTextField(
                    value = state.cityRegion,
                    onValueChange = { viewModel.onCityRegionChange(it) },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth(),
                )

                FieldLabel(stringResource(R.string.ambassadors_apply_field_languages), topPadding = Spacing.lg)
                ChipInputRow(
                    value = state.languageInput,
                    onValueChange = { viewModel.onLanguageInputChange(it) },
                    onAdd = { viewModel.addLanguage() },
                    addLabel = stringResource(R.string.ambassadors_apply_add_language),
                )
                if (state.languages.isNotEmpty()) {
                    RemovableChipsRow(items = state.languages, onRemove = { viewModel.removeLanguage(it) })
                }

                FieldLabel(stringResource(R.string.ambassadors_apply_field_links), topPadding = Spacing.lg)
                ChipInputRow(
                    value = state.linkInput,
                    onValueChange = { viewModel.onLinkInputChange(it) },
                    onAdd = { viewModel.addLink() },
                    addLabel = stringResource(R.string.ambassadors_apply_add_link),
                    keyboardType = KeyboardType.Uri,
                )
                if (state.links.isNotEmpty()) {
                    RemovableChipsRow(items = state.links, onRemove = { viewModel.removeLink(it) })
                }

                FieldLabel(stringResource(R.string.ambassadors_apply_field_motivation), topPadding = Spacing.lg)
                OutlinedTextField(
                    value = state.motivation,
                    onValueChange = { viewModel.onMotivationChange(it) },
                    minLines = 4,
                    modifier = Modifier.fillMaxWidth(),
                )

                FieldLabel(stringResource(R.string.ambassadors_apply_field_description), topPadding = Spacing.lg)
                OutlinedTextField(
                    value = state.communityDescription,
                    onValueChange = { viewModel.onCommunityDescriptionChange(it) },
                    minLines = 3,
                    modifier = Modifier.fillMaxWidth(),
                )

                FieldLabel(stringResource(R.string.ambassadors_apply_field_audience), topPadding = Spacing.lg)
                OutlinedTextField(
                    value = state.audienceSize,
                    onValueChange = { viewModel.onAudienceSizeChange(it) },
                    singleLine = true,
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                    modifier = Modifier.fillMaxWidth(),
                )

                if (state.error != null) {
                    Text(
                        text = state.error ?: "",
                        color = MaterialTheme.colorScheme.error,
                        style = MaterialTheme.typography.bodyMedium,
                        modifier = Modifier.padding(top = Spacing.lg),
                    )
                }

                Button(
                    onClick = { viewModel.submit(errCountryRequired, errMotivationRequired, errGeneric) },
                    enabled = !state.isSubmitting,
                    colors = ButtonDefaults.buttonColors(containerColor = ZrpRed),
                    modifier = Modifier.fillMaxWidth().padding(top = Spacing.xl),
                ) {
                    if (state.isSubmitting) {
                        CircularProgressIndicator(modifier = Modifier.height(20.dp), strokeWidth = 2.dp, color = MaterialTheme.colorScheme.onError)
                        Spacer(modifier = Modifier.width(Spacing.sm))
                        Text(stringResource(R.string.ambassadors_apply_submitting))
                    } else {
                        Text(stringResource(R.string.ambassadors_apply_submit))
                    }
                }

                Spacer(modifier = Modifier.height(Spacing.xxl))
            }
        }
    }

    if (showCountryPicker) {
        val sheetState = rememberModalBottomSheetState()
        ModalBottomSheet(onDismissRequest = { showCountryPicker = false }, sheetState = sheetState) {
            CountryPickerContent(
                state = state,
                onQueryChange = { viewModel.onCountryPickerQueryChange(it) },
                onSelect = { code ->
                    viewModel.onCountrySelect(code)
                    showCountryPicker = false
                },
            )
        }
    }
}

@Composable
private fun FieldLabel(text: String, topPadding: Dp = 0.dp) {
    Text(
        text = text,
        style = MaterialTheme.typography.labelLarge,
        fontWeight = FontWeight.Bold,
        modifier = Modifier.padding(top = topPadding, bottom = Spacing.xs),
    )
}

@Composable
private fun ChipInputRow(
    value: String,
    onValueChange: (String) -> Unit,
    onAdd: () -> Unit,
    addLabel: String,
    keyboardType: KeyboardType = KeyboardType.Text,
) {
    Row(verticalAlignment = Alignment.CenterVertically) {
        OutlinedTextField(
            value = value,
            onValueChange = onValueChange,
            singleLine = true,
            keyboardOptions = KeyboardOptions(keyboardType = keyboardType),
            modifier = Modifier.weight(1f),
        )
        IconButton(onClick = onAdd, enabled = value.isNotBlank()) {
            Icon(Icons.Filled.Add, contentDescription = addLabel, tint = ZrpRed)
        }
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun RemovableChipsRow(items: List<String>, onRemove: (String) -> Unit) {
    FlowRow(
        horizontalArrangement = Arrangement.spacedBy(Spacing.xs),
        modifier = Modifier.fillMaxWidth().padding(top = Spacing.xs),
    ) {
        items.forEach { item ->
            Surface(
                shape = RoundedCornerShape(50),
                color = MaterialTheme.colorScheme.surfaceVariant,
            ) {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    modifier = Modifier.padding(start = Spacing.sm, end = Spacing.xs, top = 4.dp, bottom = 4.dp),
                ) {
                    Text(text = item, style = MaterialTheme.typography.labelMedium)
                    IconButton(onClick = { onRemove(item) }, modifier = Modifier.height(24.dp)) {
                        Icon(Icons.Filled.Close, contentDescription = null, modifier = Modifier.height(16.dp))
                    }
                }
            }
        }
    }
}

@Composable
private fun CountryPickerContent(
    state: AmbassadorApplyUiState,
    onQueryChange: (String) -> Unit,
    onSelect: (String) -> Unit,
) {
    Column(modifier = Modifier.fillMaxWidth().height(500.dp)) {
        OutlinedTextField(
            value = state.countryPickerQuery,
            onValueChange = onQueryChange,
            placeholder = { Text(stringResource(R.string.ambassadors_explorer_search_placeholder)) },
            leadingIcon = { Icon(Icons.Filled.Search, contentDescription = null) },
            singleLine = true,
            modifier = Modifier.fillMaxWidth().padding(Spacing.lg),
        )
        LazyColumn(modifier = Modifier.fillMaxWidth()) {
            items(state.filteredCountries, key = { it.code }) { country: AmbassadorCountry ->
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .clickable { onSelect(country.code) }
                        .padding(horizontal = Spacing.lg, vertical = Spacing.md),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text(text = country.name, style = MaterialTheme.typography.bodyLarge, modifier = Modifier.weight(1f))
                    if (state.countryCode == country.code) {
                        Icon(Icons.Filled.Check, contentDescription = null, tint = ZrpRed)
                    }
                }
            }
        }
    }
}

@Composable
private fun SuccessBody(onBack: () -> Unit) {
    Column(
        modifier = Modifier.fillMaxSize().padding(Spacing.xxl),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        Box(
            modifier = Modifier
                .padding(bottom = Spacing.lg)
                .background(ZrpRed.copy(alpha = 0.10f), CircleShape)
                .padding(Spacing.lg),
        ) {
            Icon(Icons.Filled.CheckCircle, contentDescription = null, tint = ZrpRed, modifier = Modifier.height(48.dp))
        }
        Text(
            text = stringResource(R.string.ambassadors_apply_success_title),
            style = MaterialTheme.typography.headlineSmall,
            fontWeight = FontWeight.Bold,
            textAlign = TextAlign.Center,
        )
        Text(
            text = stringResource(R.string.ambassadors_apply_success_body),
            style = MaterialTheme.typography.bodyLarge,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            textAlign = TextAlign.Center,
            modifier = Modifier.padding(top = Spacing.md),
        )
        Button(
            onClick = onBack,
            colors = ButtonDefaults.buttonColors(containerColor = ZrpRed),
            modifier = Modifier.fillMaxWidth().padding(top = Spacing.xl),
        ) {
            Text(stringResource(R.string.ambassadors_apply_back))
        }
    }
}
