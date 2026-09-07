package one.zrp.social.mobile.ui.marketplace

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
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material3.Button
import androidx.compose.material3.Checkbox
import androidx.compose.material3.CircularProgressIndicator
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
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import coil.compose.AsyncImage
import one.zrp.social.mobile.R
import one.zrp.social.mobile.data.MarketplaceRepository

private val CURRENCIES = listOf("USD", "EUR", "CHF", "GBP", "AED")

/**
 * Create Listing / Edit Listing - the same real ListingForm.tsx fields
 * shared between src/app/marketplace/new and /edit/[id]: category,
 * title, description, price/currency + price-on-request, location,
 * photos (multi, added one at a time via the same repeated single-
 * select picker CreatePostScreen already uses for post media), and an
 * optional video. Submitting always sends the complete form either
 * way, matching web's own EditListingPage (never a partial PATCH).
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ListingFormScreen(listingId: String?, onBack: () -> Unit, onSaved: (String) -> Unit) {
    val viewModel: ListingFormViewModel = viewModel(
        factory = remember { ListingFormViewModelFactory(listingId, MarketplaceRepository()) },
    )
    val state by viewModel.state.collectAsState()
    val contentResolver = LocalContext.current.contentResolver

    val imagePickerLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.PickVisualMedia(),
    ) { uri ->
        if (uri != null) {
            val (name, size) = queryFileNameAndSizeListing(contentResolver, uri)
            val mimeType = contentResolver.getType(uri) ?: "image/*"
            viewModel.onImagePicked(contentResolver, PickedFile(uri, name, mimeType, size))
        }
    }
    val videoPickerLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.GetContent(),
    ) { uri ->
        if (uri != null) {
            val (name, size) = queryFileNameAndSizeListing(contentResolver, uri)
            val mimeType = contentResolver.getType(uri) ?: "video/*"
            viewModel.onVideoPicked(contentResolver, PickedFile(uri, name, mimeType, size))
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
                Icon(Icons.Filled.ArrowBack, contentDescription = stringResource(R.string.nav_back))
            }
            Text(
                text = stringResource(
                    if (viewModel.isEditMode) R.string.marketplace_edit_listing else R.string.marketplace_create_listing,
                ),
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
                    text = stringResource(R.string.marketplace_edit_not_allowed),
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
                    text = stringResource(
                        if (viewModel.isEditMode) R.string.marketplace_edit_listing_note else R.string.marketplace_create_listing_note,
                    ),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.padding(bottom = 12.dp),
                )

                Text(stringResource(R.string.marketplace_category), style = MaterialTheme.typography.labelMedium)
                var categoryMenuExpanded by remember { mutableStateOf(false) }
                val selectedCategoryLabel = if (state.category.isEmpty()) {
                    stringResource(R.string.marketplace_select_category)
                } else {
                    categoryLabel(state.category)
                }
                ExposedDropdownMenuBox(
                    expanded = categoryMenuExpanded,
                    onExpandedChange = { categoryMenuExpanded = it },
                    modifier = Modifier.padding(top = 4.dp),
                ) {
                    OutlinedTextField(
                        value = selectedCategoryLabel,
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
                        allMarketplaceCategories.forEach { category ->
                            DropdownMenuItem(
                                text = { Text(categoryLabel(category)) },
                                onClick = { viewModel.onCategoryChange(category); categoryMenuExpanded = false },
                            )
                        }
                    }
                }

                OutlinedTextField(
                    value = state.title,
                    onValueChange = viewModel::onTitleChange,
                    label = { Text(stringResource(R.string.marketplace_listing_title)) },
                    singleLine = true,
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(top = 12.dp),
                )

                OutlinedTextField(
                    value = state.description,
                    onValueChange = viewModel::onDescriptionChange,
                    label = { Text(stringResource(R.string.marketplace_description)) },
                    minLines = 4,
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(top = 12.dp),
                )

                Row(modifier = Modifier.padding(top = 12.dp)) {
                    OutlinedTextField(
                        value = state.price,
                        onValueChange = viewModel::onPriceChange,
                        label = { Text(stringResource(R.string.marketplace_price)) },
                        enabled = !state.priceOnRequest,
                        singleLine = true,
                        modifier = Modifier.weight(1f),
                    )
                    CurrencyMenu(
                        currency = state.currency,
                        enabled = !state.priceOnRequest,
                        onCurrencyChange = viewModel::onCurrencyChange,
                        modifier = Modifier
                            .weight(1f)
                            .padding(start = 8.dp),
                    )
                }
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    modifier = Modifier.padding(top = 4.dp),
                ) {
                    Checkbox(checked = state.priceOnRequest, onCheckedChange = viewModel::onPriceOnRequestChange)
                    Text(stringResource(R.string.marketplace_price_on_request_label))
                }

                OutlinedTextField(
                    value = state.location,
                    onValueChange = viewModel::onLocationChange,
                    label = { Text(stringResource(R.string.marketplace_location)) },
                    placeholder = { Text(stringResource(R.string.marketplace_location_placeholder)) },
                    singleLine = true,
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(top = 12.dp),
                )

                Text(
                    text = stringResource(R.string.marketplace_photos),
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
                                    tint = androidx.compose.ui.graphics.Color.White,
                                    modifier = Modifier
                                        .background(androidx.compose.ui.graphics.Color.Black.copy(alpha = 0.5f), androidx.compose.foundation.shape.CircleShape),
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
                                Icon(Icons.Filled.Add, contentDescription = stringResource(R.string.marketplace_photos))
                            }
                        }
                    }
                }

                Text(
                    text = stringResource(R.string.marketplace_video_optional),
                    style = MaterialTheme.typography.labelMedium,
                    modifier = Modifier.padding(top = 16.dp, bottom = 4.dp),
                )
                if (state.videoUrl != null) {
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        modifier = Modifier
                            .fillMaxWidth()
                            .clip(RoundedCornerShape(10.dp))
                            .background(MaterialTheme.colorScheme.surfaceContainerHigh)
                            .padding(12.dp),
                    ) {
                        Icon(Icons.Filled.PlayArrow, contentDescription = null)
                        Text(
                            text = stringResource(R.string.marketplace_video_optional),
                            modifier = Modifier
                                .weight(1f)
                                .padding(start = 8.dp),
                        )
                        IconButton(onClick = viewModel::onRemoveVideo) {
                            Icon(Icons.Filled.Close, contentDescription = stringResource(R.string.shorts_upload_remove_video))
                        }
                    }
                } else {
                    OutlinedButton(
                        onClick = { videoPickerLauncher.launch("video/*") },
                        enabled = !state.isUploadingVideo,
                    ) {
                        if (state.isUploadingVideo) {
                            CircularProgressIndicator(modifier = Modifier.size(16.dp), strokeWidth = 2.dp)
                        } else {
                            Text(stringResource(R.string.marketplace_add_video))
                        }
                    }
                }

                val errorText = when (state.error) {
                    ListingFormViewModel.categoryRequiredError -> stringResource(R.string.marketplace_err_category_required)
                    ListingFormViewModel.photoRequiredError -> stringResource(R.string.marketplace_err_photo_required)
                    ListingFormViewModel.createFailedError -> stringResource(R.string.marketplace_err_create_failed)
                    ListingFormViewModel.updateFailedError -> stringResource(R.string.marketplace_err_update_failed)
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
                    text = stringResource(R.string.marketplace_moderation_note),
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.padding(top = 12.dp),
                )

                Button(
                    onClick = { viewModel.submit(onSuccess = onSaved) },
                    enabled = !state.isSubmitting && !state.isUploadingImage && !state.isUploadingVideo,
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(top = 12.dp, bottom = 24.dp),
                ) {
                    Text(
                        stringResource(
                            if (state.isSubmitting) {
                                R.string.marketplace_submitting
                            } else if (viewModel.isEditMode) {
                                R.string.marketplace_save_changes
                            } else {
                                R.string.marketplace_submit_listing
                            },
                        ),
                    )
                }
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun CurrencyMenu(currency: String, enabled: Boolean, onCurrencyChange: (String) -> Unit, modifier: Modifier = Modifier) {
    var expanded by remember { mutableStateOf(false) }
    ExposedDropdownMenuBox(
        expanded = expanded && enabled,
        onExpandedChange = { if (enabled) expanded = it },
        modifier = modifier,
    ) {
        OutlinedTextField(
            value = currency,
            onValueChange = {},
            readOnly = true,
            enabled = enabled,
            label = { Text(stringResource(R.string.marketplace_currency)) },
            trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded = expanded && enabled) },
            modifier = Modifier
                .fillMaxWidth()
                .menuAnchor(),
        )
        ExposedDropdownMenu(
            expanded = expanded && enabled,
            onDismissRequest = { expanded = false },
        ) {
            CURRENCIES.forEach { c ->
                DropdownMenuItem(
                    text = { Text(c) },
                    onClick = { onCurrencyChange(c); expanded = false },
                )
            }
        }
    }
}

private fun queryFileNameAndSizeListing(contentResolver: android.content.ContentResolver, uri: android.net.Uri): Pair<String, Long> {
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
