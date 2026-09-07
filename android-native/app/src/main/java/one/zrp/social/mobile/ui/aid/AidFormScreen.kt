package one.zrp.social.mobile.ui.aid

import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
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
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.Close
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ExposedDropdownMenuBox
import androidx.compose.material3.ExposedDropdownMenuDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import coil.compose.AsyncImage
import one.zrp.social.mobile.R
import one.zrp.social.mobile.data.AidRepository

/**
 * Create Campaign - the same real category/needTypes/title/description/
 * location/goalAmount/images fields CreateCampaignPage.tsx collects,
 * gated to organizer accounts exactly like the web page.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AidFormScreen(onBack: () -> Unit, onSaved: (String) -> Unit) {
    val viewModel: AidFormViewModel = viewModel(
        factory = remember { AidFormViewModelFactory(AidRepository()) },
    )
    val state by viewModel.state.collectAsState()
    val contentResolver = LocalContext.current.contentResolver

    val imagePickerLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.PickVisualMedia(),
    ) { uri ->
        if (uri != null) {
            val (name, size) = queryAidFileNameAndSize(contentResolver, uri)
            val mimeType = contentResolver.getType(uri) ?: "image/*"
            viewModel.onImagePicked(contentResolver, AidPickedFile(uri, name, mimeType, size))
        }
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
                text = stringResource(R.string.aid_create_title),
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.Bold,
                modifier = Modifier.padding(start = 4.dp),
            )
        }

        when {
            state.isCheckingAccess -> {
                Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    CircularProgressIndicator()
                }
            }
            !state.isOrganizer -> {
                Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    Text(
                        text = stringResource(R.string.aid_org_only_note),
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.padding(32.dp),
                    )
                }
            }
            else -> {
                Column(
                    modifier = Modifier
                        .fillMaxSize()
                        .verticalScroll(rememberScrollState())
                        .padding(horizontal = 16.dp, vertical = 8.dp),
                ) {
                    Text(
                        text = stringResource(R.string.aid_create_subtitle),
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.padding(bottom = 12.dp),
                    )

                    Text(stringResource(R.string.aid_category_label), style = MaterialTheme.typography.labelMedium)
                    var categoryMenuExpanded by remember { mutableStateOf(false) }
                    ExposedDropdownMenuBox(
                        expanded = categoryMenuExpanded,
                        onExpandedChange = { categoryMenuExpanded = it },
                        modifier = Modifier.padding(top = 4.dp),
                    ) {
                        OutlinedTextField(
                            value = campaignCategoryLabel(state.category),
                            onValueChange = {},
                            readOnly = true,
                            trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded = categoryMenuExpanded) },
                            modifier = Modifier
                                .fillMaxWidth()
                                .menuAnchor(),
                        )
                        ExposedDropdownMenu(
                            expanded = categoryMenuExpanded,
                            onDismissRequest = { categoryMenuExpanded = false },
                        ) {
                            allAidCategories.forEach { category ->
                                DropdownMenuItem(
                                    text = { Text(campaignCategoryLabel(category)) },
                                    onClick = { viewModel.onCategoryChange(category); categoryMenuExpanded = false },
                                )
                            }
                        }
                    }

                    Text(
                        text = stringResource(R.string.aid_need_types_label),
                        style = MaterialTheme.typography.labelMedium,
                        modifier = Modifier.padding(top = 12.dp),
                    )
                    Row(
                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                        modifier = Modifier.padding(top = 4.dp),
                    ) {
                        allHelpNeedTypes.forEach { need ->
                            val selected = state.needTypes.contains(need)
                            Row(
                                verticalAlignment = Alignment.CenterVertically,
                                modifier = Modifier
                                    .clip(RoundedCornerShape(50))
                                    .background(
                                        if (selected) MaterialTheme.colorScheme.primary.copy(alpha = 0.12f) else MaterialTheme.colorScheme.surfaceContainerHigh,
                                    )
                                    .clickable { viewModel.onToggleNeedType(need) }
                                    .padding(horizontal = 10.dp, vertical = 6.dp),
                            ) {
                                Icon(
                                    helpNeedTypeIcon(need),
                                    contentDescription = null,
                                    tint = if (selected) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurface,
                                    modifier = Modifier.size(14.dp),
                                )
                                Text(
                                    text = helpNeedTypeLabel(need),
                                    style = MaterialTheme.typography.labelSmall,
                                    color = if (selected) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurface,
                                    modifier = Modifier.padding(start = 4.dp),
                                )
                            }
                        }
                    }

                    OutlinedTextField(
                        value = state.title,
                        onValueChange = viewModel::onTitleChange,
                        label = { Text(stringResource(R.string.aid_title_label)) },
                        singleLine = true,
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(top = 12.dp),
                    )

                    OutlinedTextField(
                        value = state.description,
                        onValueChange = viewModel::onDescriptionChange,
                        label = { Text(stringResource(R.string.aid_description_label)) },
                        minLines = 4,
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(top = 12.dp),
                    )

                    Row(modifier = Modifier.padding(top = 12.dp)) {
                        OutlinedTextField(
                            value = state.location,
                            onValueChange = viewModel::onLocationChange,
                            label = { Text(stringResource(R.string.aid_location_label)) },
                            singleLine = true,
                            modifier = Modifier.weight(1f),
                        )
                        if (state.needTypes.contains("MONEY")) {
                            OutlinedTextField(
                                value = state.goalAmount,
                                onValueChange = viewModel::onGoalAmountChange,
                                label = { Text(stringResource(R.string.aid_goal_amount_label)) },
                                singleLine = true,
                                modifier = Modifier
                                    .weight(1f)
                                    .padding(start = 8.dp),
                            )
                        }
                    }

                    Text(
                        text = stringResource(R.string.aid_images_label),
                        style = MaterialTheme.typography.labelMedium,
                        modifier = Modifier.padding(top = 16.dp, bottom = 4.dp),
                    )
                    LazyRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        items(state.imageUrls.withIndex().toList(), key = { (index, _) -> index }) { (index, url) ->
                            Box(modifier = Modifier.size(80.dp)) {
                                AsyncImage(
                                    model = url,
                                    contentDescription = null,
                                    contentScale = ContentScale.Crop,
                                    modifier = Modifier
                                        .fillMaxSize()
                                        .clip(RoundedCornerShape(10.dp)),
                                )
                                IconButton(
                                    onClick = { viewModel.onRemoveImage(index) },
                                    modifier = Modifier
                                        .align(Alignment.TopEnd)
                                        .size(24.dp),
                                ) {
                                    Icon(
                                        Icons.Filled.Close,
                                        contentDescription = null,
                                        tint = Color.White,
                                        modifier = Modifier
                                            .background(Color.Black.copy(alpha = 0.5f), CircleShape),
                                    )
                                }
                            }
                        }
                        item {
                            Box(
                                modifier = Modifier
                                    .size(80.dp)
                                    .clip(RoundedCornerShape(10.dp))
                                    .background(MaterialTheme.colorScheme.surfaceContainerHigh)
                                    .clickable(enabled = !state.isUploadingImage) {
                                        imagePickerLauncher.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly))
                                    },
                                contentAlignment = Alignment.Center,
                            ) {
                                if (state.isUploadingImage) {
                                    CircularProgressIndicator(modifier = Modifier.size(24.dp), strokeWidth = 2.dp)
                                } else {
                                    Icon(Icons.Filled.Add, contentDescription = stringResource(R.string.aid_add_images))
                                }
                            }
                        }
                    }
                    if (state.isUploadingImage) {
                        Text(
                            text = stringResource(R.string.opportunity_uploading),
                            style = MaterialTheme.typography.labelSmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            modifier = Modifier.padding(top = 4.dp),
                        )
                    }

                    val error = state.error
                    if (error != null) {
                        val errorText = when (error) {
                            AidFormViewModel.titleRequiredError -> stringResource(R.string.aid_err_title_required)
                            AidFormViewModel.descriptionRequiredError -> stringResource(R.string.aid_err_description_required)
                            AidFormViewModel.needTypeRequiredError -> stringResource(R.string.aid_err_need_type_required)
                            AidFormViewModel.goalAmountRequiredError -> stringResource(R.string.aid_err_goal_amount_required)
                            AidFormViewModel.createFailedError -> stringResource(R.string.aid_err_create_failed)
                            AidFormViewModel.imageUploadFailedError -> stringResource(R.string.aid_err_image_upload_failed)
                            else -> error
                        }
                        Text(
                            text = errorText,
                            color = MaterialTheme.colorScheme.error,
                            style = MaterialTheme.typography.bodySmall,
                            modifier = Modifier.padding(top = 12.dp),
                        )
                    }

                    Text(
                        text = stringResource(R.string.aid_moderation_note),
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.padding(top = 12.dp),
                    )

                    Button(
                        onClick = { viewModel.publish(onSuccess = onSaved) },
                        enabled = !state.isSubmitting && !state.isUploadingImage,
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(top = 12.dp, bottom = 24.dp),
                    ) {
                        Text(stringResource(if (state.isSubmitting) R.string.aid_publishing else R.string.aid_publish))
                    }
                }
            }
        }
    }
}

private fun queryAidFileNameAndSize(contentResolver: android.content.ContentResolver, uri: android.net.Uri): Pair<String, Long> {
    var name = "upload"
    var size = 0L
    contentResolver.query(uri, null, null, null, null)?.use { cursor ->
        val nameIndex = cursor.getColumnIndex(android.provider.OpenableColumns.DISPLAY_NAME)
        val sizeIndex = cursor.getColumnIndex(android.provider.OpenableColumns.SIZE)
        if (cursor.moveToFirst()) {
            if (nameIndex >= 0) name = cursor.getString(nameIndex) ?: name
            if (sizeIndex >= 0) size = cursor.getLong(sizeIndex)
        }
    }
    return name to size
}
