package one.zrp.social.mobile.ui.opportunity

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.Close
import androidx.compose.material3.Button
import androidx.compose.material3.Checkbox
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DatePicker
import androidx.compose.material3.DatePickerDialog
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ExposedDropdownMenuBox
import androidx.compose.material3.ExposedDropdownMenuDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.rememberDatePickerState
import androidx.compose.runtime.Composable
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
import one.zrp.social.mobile.data.OpportunityRepository
import java.text.SimpleDateFormat
import java.util.Locale
import java.util.TimeZone

/**
 * Post Opportunity / Edit Listing - ported from the real fields shared
 * by CreateOpportunityPage.tsx and EditOpportunityListingPage.tsx: type,
 * title, organization, description, location + deadline, remote/paid
 * checkboxes, compensation, skill chips, and an optional external
 * application URL.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun OpportunityFormScreen(listingId: String?, onBack: () -> Unit, onSaved: (String) -> Unit) {
    val viewModel: OpportunityFormViewModel = viewModel(
        factory = remember { OpportunityFormViewModelFactory(listingId, OpportunityRepository()) },
    )
    val state by viewModel.state.collectAsState()
    var showDatePicker by remember { mutableStateOf(false) }

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
                text = stringResource(if (viewModel.isEditMode) R.string.opportunity_edit_title else R.string.opportunity_create_title),
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.Bold,
                modifier = Modifier.padding(start = 4.dp),
            )
        }

        if (state.isLoadingExisting) {
            Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                CircularProgressIndicator()
            }
        } else if (state.notAllowed) {
            Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                Text(
                    text = stringResource(R.string.opportunity_err_not_allowed_to_edit),
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.padding(32.dp),
                )
            }
        } else {
            Column(
                modifier = Modifier
                    .fillMaxSize()
                    .verticalScroll(rememberScrollState())
                    .padding(horizontal = 16.dp, vertical = 8.dp),
            ) {
                Text(
                    text = stringResource(if (viewModel.isEditMode) R.string.opportunity_edit_subtitle else R.string.opportunity_create_subtitle),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.padding(bottom = 12.dp),
                )

                Text(stringResource(R.string.opportunity_type_label), style = MaterialTheme.typography.labelMedium)
                var typeMenuExpanded by remember { mutableStateOf(false) }
                ExposedDropdownMenuBox(
                    expanded = typeMenuExpanded,
                    onExpandedChange = { typeMenuExpanded = it },
                    modifier = Modifier.padding(top = 4.dp),
                ) {
                    OutlinedTextField(
                        value = opportunityTypeLabel(state.type),
                        onValueChange = {},
                        readOnly = true,
                        trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded = typeMenuExpanded) },
                        modifier = Modifier
                            .fillMaxWidth()
                            .menuAnchor(),
                    )
                    ExposedDropdownMenu(
                        expanded = typeMenuExpanded,
                        onDismissRequest = { typeMenuExpanded = false },
                    ) {
                        allOpportunityTypes.forEach { type ->
                            DropdownMenuItem(
                                text = { Text(opportunityTypeLabel(type)) },
                                onClick = { viewModel.onTypeChange(type); typeMenuExpanded = false },
                            )
                        }
                    }
                }

                OutlinedTextField(
                    value = state.title,
                    onValueChange = viewModel::onTitleChange,
                    label = { Text(stringResource(R.string.opportunity_title_label)) },
                    singleLine = true,
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(top = 12.dp),
                )

                OutlinedTextField(
                    value = state.organizationName,
                    onValueChange = viewModel::onOrganizationChange,
                    label = { Text(stringResource(R.string.opportunity_organization_label)) },
                    singleLine = true,
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(top = 12.dp),
                )

                OutlinedTextField(
                    value = state.description,
                    onValueChange = viewModel::onDescriptionChange,
                    label = { Text(stringResource(R.string.opportunity_description_label)) },
                    minLines = 5,
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(top = 12.dp),
                )

                OutlinedTextField(
                    value = state.location,
                    onValueChange = viewModel::onLocationChange,
                    label = { Text(stringResource(R.string.opportunity_location_label)) },
                    singleLine = true,
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(top = 12.dp),
                )

                Text(
                    text = stringResource(R.string.opportunity_deadline_label),
                    style = MaterialTheme.typography.labelMedium,
                    modifier = Modifier.padding(top = 12.dp, bottom = 4.dp),
                )
                OutlinedButton(onClick = { showDatePicker = true }) {
                    Text(state.deadline.ifEmpty { stringResource(R.string.opportunity_deadline_label) })
                }

                Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.padding(top = 4.dp)) {
                    Checkbox(checked = state.remote, onCheckedChange = viewModel::onRemoteToggle)
                    Text(stringResource(R.string.opportunity_remote))
                    Checkbox(
                        checked = state.isPaid,
                        onCheckedChange = viewModel::onIsPaidToggle,
                        modifier = Modifier.padding(start = 16.dp),
                    )
                    Text(stringResource(R.string.opportunity_is_paid))
                }

                OutlinedTextField(
                    value = state.compensationInfo,
                    onValueChange = viewModel::onCompensationChange,
                    label = { Text(stringResource(R.string.opportunity_compensation_label)) },
                    placeholder = { Text(stringResource(R.string.opportunity_compensation_placeholder)) },
                    singleLine = true,
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(top = 12.dp),
                )

                Text(
                    text = stringResource(R.string.opportunity_skills_label),
                    style = MaterialTheme.typography.labelMedium,
                    modifier = Modifier.padding(top = 16.dp, bottom = 4.dp),
                )
                Row(verticalAlignment = Alignment.CenterVertically) {
                    OutlinedTextField(
                        value = state.skillInput,
                        onValueChange = viewModel::onSkillInputChange,
                        placeholder = { Text(stringResource(R.string.opportunity_skills_placeholder)) },
                        singleLine = true,
                        modifier = Modifier.weight(1f),
                    )
                    OutlinedButton(onClick = viewModel::onAddSkill, modifier = Modifier.padding(start = 8.dp)) {
                        Text(stringResource(R.string.opportunity_add_skill))
                    }
                }
                if (state.skills.isNotEmpty()) {
                    LazyRow(
                        horizontalArrangement = Arrangement.spacedBy(6.dp),
                        modifier = Modifier.padding(top = 8.dp),
                    ) {
                        items(state.skills) { skill ->
                            Row(
                                verticalAlignment = Alignment.CenterVertically,
                                modifier = Modifier
                                    .clip(RoundedCornerShape(50))
                                    .background(MaterialTheme.colorScheme.surfaceContainerHigh)
                                    .padding(start = 10.dp, end = 4.dp, top = 4.dp, bottom = 4.dp),
                            ) {
                                Text(text = skill, style = MaterialTheme.typography.labelSmall)
                                IconButton(onClick = { viewModel.onRemoveSkill(skill) }, modifier = Modifier.size(20.dp)) {
                                    // action_delete reused as this chip's own remove-skill
                                    // label - no web aria-label to match (this is a plain
                                    // <button> in a skill pill on the real page) and no
                                    // dedicated string exists for this one icon-only action.
                                    Icon(
                                        Icons.Filled.Close,
                                        contentDescription = stringResource(R.string.action_delete),
                                        modifier = Modifier.size(14.dp),
                                    )
                                }
                            }
                        }
                    }
                }

                OutlinedTextField(
                    value = state.externalUrl,
                    onValueChange = viewModel::onExternalUrlChange,
                    label = { Text(stringResource(R.string.opportunity_external_url_label)) },
                    placeholder = { Text(stringResource(R.string.opportunity_external_url_placeholder)) },
                    singleLine = true,
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(top = 16.dp),
                )
                Text(
                    text = stringResource(R.string.opportunity_external_url_hint),
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.padding(top = 4.dp),
                )

                val errorText = when (state.error) {
                    OpportunityFormViewModel.titleRequiredError -> stringResource(R.string.opportunity_err_title_required)
                    OpportunityFormViewModel.descriptionRequiredError -> stringResource(R.string.opportunity_err_description_required)
                    OpportunityFormViewModel.createFailedError -> stringResource(R.string.opportunity_err_create_failed)
                    OpportunityFormViewModel.updateFailedError -> stringResource(R.string.opportunity_err_update_failed)
                    null -> null
                    else -> state.error
                }
                if (errorText != null) {
                    Text(
                        text = errorText,
                        color = MaterialTheme.colorScheme.error,
                        style = MaterialTheme.typography.bodySmall,
                        modifier = Modifier.padding(top = 12.dp),
                    )
                }

                Text(
                    text = stringResource(if (viewModel.isEditMode) R.string.opportunity_edit_moderation_note else R.string.opportunity_moderation_note),
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.padding(top = 12.dp),
                )

                Button(
                    onClick = { viewModel.submit(onSuccess = onSaved) },
                    enabled = !state.isSubmitting,
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(top = 12.dp, bottom = 24.dp),
                ) {
                    Text(
                        stringResource(
                            if (state.isSubmitting) {
                                if (viewModel.isEditMode) R.string.opportunity_saving else R.string.opportunity_publishing
                            } else if (viewModel.isEditMode) {
                                R.string.opportunity_save_changes
                            } else {
                                R.string.opportunity_publish
                            },
                        ),
                    )
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
                    if (millis != null) {
                        val format = SimpleDateFormat("yyyy-MM-dd", Locale.US).apply {
                            timeZone = TimeZone.getTimeZone("UTC")
                        }
                        viewModel.onDeadlineChange(format.format(millis))
                    }
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
