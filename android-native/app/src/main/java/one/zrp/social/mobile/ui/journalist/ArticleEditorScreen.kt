package one.zrp.social.mobile.ui.journalist

import android.content.ContentResolver
import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Description
import androidx.compose.material.icons.filled.Image
import androidx.compose.material.icons.filled.Info
import androidx.compose.material.icons.filled.Send
import androidx.compose.material.icons.filled.Visibility
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ExposedDropdownMenu
import androidx.compose.material3.ExposedDropdownMenuBox
import androidx.compose.material3.ExposedDropdownMenuDefaults
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
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
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import coil.compose.AsyncImage
import one.zrp.social.mobile.R
import one.zrp.social.mobile.data.JournalistRepository
import one.zrp.social.mobile.network.NEWS_CATEGORIES
import one.zrp.social.mobile.ui.news.newsCategoryLabel
import one.zrp.social.mobile.ui.theme.Spacing

/**
 * ZRP Journalist article editor - ported from ArticleEditorForm.tsx.
 * See ArticleEditorViewModel's own KDoc for why canSubmit is not
 * threaded through as a loaded flag here.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ArticleEditorScreen(articleId: String?, onBack: () -> Unit, onSaved: () -> Unit) {
    val viewModel: ArticleEditorViewModel = viewModel(
        factory = remember { ArticleEditorViewModelFactory(articleId, JournalistRepository()) },
    )
    val state by viewModel.state.collectAsState()
    val contentResolver = LocalContext.current.contentResolver

    val coverPickerLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.PickVisualMedia(),
    ) { uri ->
        if (uri != null) {
            val (name, size) = queryFileNameAndSize(contentResolver, uri)
            val mimeType = contentResolver.getType(uri) ?: "image/*"
            viewModel.onCoverImagePicked(contentResolver, uri, name, mimeType, size)
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
                Icon(Icons.Filled.ArrowBack, contentDescription = stringResource(R.string.journalist_editor_back_to_dashboard))
            }
            Text(
                text = stringResource(if (viewModel.isEditMode) R.string.journalist_editor_edit_title else R.string.journalist_editor_new_title),
                style = MaterialTheme.typography.titleMedium,
                modifier = Modifier.padding(start = 4.dp),
            )
        }
        HorizontalDivider()

        when {
            state.isLoadingExisting -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) { CircularProgressIndicator() }
            state.notFound -> Box(Modifier.fillMaxSize().padding(Spacing.xl), contentAlignment = Alignment.Center) {
                Text(
                    text = stringResource(R.string.journalist_editor_article_not_found),
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            state.preview -> PreviewBody(state = state, onBackToEditor = { viewModel.setPreview(false) })
            else -> EditorFormBody(
                state = state,
                viewModel = viewModel,
                onPickCover = { coverPickerLauncher.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly)) },
                onPreview = { viewModel.setPreview(true) },
                onSaved = onSaved,
            )
        }
    }
}

private fun queryFileNameAndSize(contentResolver: ContentResolver, uri: Uri): Pair<String, Long> {
    var name = "cover"
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

@Composable
private fun PreviewBody(state: ArticleEditorUiState, onBackToEditor: () -> Unit) {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(Spacing.lg),
    ) {
        TextButton(onClick = onBackToEditor) {
            Text("← " + stringResource(R.string.journalist_editor_back_to_editor))
        }

        if (state.coverImage.isNotBlank()) {
            AsyncImage(
                model = state.coverImage,
                contentDescription = null,
                contentScale = ContentScale.Crop,
                modifier = Modifier
                    .fillMaxWidth()
                    .height(180.dp)
                    .clip(RoundedCornerShape(12.dp))
                    .padding(bottom = Spacing.md),
            )
        }

        Text(
            text = newsCategoryLabel(state.category),
            style = MaterialTheme.typography.labelMedium,
            color = MaterialTheme.colorScheme.primary,
        )
        Text(
            text = state.title.ifBlank { stringResource(R.string.journalist_editor_untitled_article) },
            style = MaterialTheme.typography.headlineSmall,
            modifier = Modifier.padding(top = 4.dp),
        )
        if (state.excerpt.isNotBlank()) {
            Text(
                text = state.excerpt,
                style = MaterialTheme.typography.titleMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.padding(top = Spacing.sm),
            )
        }
        Text(
            text = state.content.ifBlank { stringResource(R.string.journalist_editor_nothing_written_yet) },
            style = MaterialTheme.typography.bodyLarge,
            modifier = Modifier.padding(top = Spacing.lg),
        )
        if (state.sourceName.isNotBlank() || state.sourceUrl.isNotBlank()) {
            Text(
                text = stringResource(R.string.journalist_editor_source_label) + " " + state.sourceName.ifBlank { state.sourceUrl },
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.padding(top = Spacing.lg),
            )
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun EditorFormBody(
    state: ArticleEditorUiState,
    viewModel: ArticleEditorViewModel,
    onPickCover: () -> Unit,
    onPreview: () -> Unit,
    onSaved: () -> Unit,
) {
    val isLocked = state.existingStatus != null && state.existingStatus != "DRAFT" && state.existingStatus != "REJECTED"
    val isRejected = state.existingStatus == "REJECTED"

    Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(Spacing.lg),
    ) {
        val reviewNote = state.reviewNote
        if (isRejected && !reviewNote.isNullOrBlank()) {
            Surface(
                shape = RoundedCornerShape(12.dp),
                color = MaterialTheme.colorScheme.errorContainer,
                modifier = Modifier.fillMaxWidth().padding(bottom = Spacing.md),
            ) {
                Row(modifier = Modifier.padding(Spacing.md)) {
                    Icon(Icons.Filled.Info, contentDescription = null, tint = MaterialTheme.colorScheme.error)
                    Column(modifier = Modifier.padding(start = Spacing.sm)) {
                        Text(
                            text = stringResource(R.string.journalist_editor_rejected_title),
                            style = MaterialTheme.typography.labelLarge,
                            color = MaterialTheme.colorScheme.onErrorContainer,
                        )
                        Text(reviewNote, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onErrorContainer, modifier = Modifier.padding(top = 2.dp))
                        Text(
                            text = stringResource(R.string.journalist_editor_rejected_hint),
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onErrorContainer,
                            modifier = Modifier.padding(top = 2.dp),
                        )
                    }
                }
            }
        }

        if (isLocked) {
            Surface(
                shape = RoundedCornerShape(12.dp),
                color = MaterialTheme.colorScheme.tertiaryContainer,
                modifier = Modifier.fillMaxWidth().padding(bottom = Spacing.md),
            ) {
                Text(
                    text = stringResource(R.string.journalist_editor_locked_notice, journalistLockedStatusLabel(state.existingStatus ?: "")),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onTertiaryContainer,
                    modifier = Modifier.padding(Spacing.md),
                )
            }
        }

        val displayedError = state.error ?: state.coverUploadErrorDetail?.let {
            stringResource(R.string.journalist_editor_err_cover_upload_failed, it)
        }
        if (displayedError != null) {
            val message = when (displayedError) {
                ArticleEditorViewModel.titleRequiredError -> stringResource(R.string.journalist_editor_err_title_required)
                ArticleEditorViewModel.slugRequiredError -> stringResource(R.string.journalist_editor_err_slug_required)
                ArticleEditorViewModel.contentRequiredError -> stringResource(R.string.journalist_editor_err_content_required)
                ArticleEditorViewModel.saveFailedError -> stringResource(R.string.journalist_editor_err_save_failed)
                else -> displayedError
            }
            Surface(
                shape = RoundedCornerShape(12.dp),
                color = MaterialTheme.colorScheme.errorContainer,
                modifier = Modifier.fillMaxWidth().padding(bottom = Spacing.md),
            ) {
                Row(modifier = Modifier.padding(Spacing.md), verticalAlignment = Alignment.CenterVertically) {
                    Text(message, color = MaterialTheme.colorScheme.onErrorContainer, modifier = Modifier.weight(1f))
                    IconButton(onClick = viewModel::dismissError) {
                        Icon(Icons.Filled.Close, contentDescription = null, tint = MaterialTheme.colorScheme.onErrorContainer)
                    }
                }
            }
        }

        Text(stringResource(R.string.journalist_editor_cover_image), style = MaterialTheme.typography.labelMedium)
        Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.padding(top = 6.dp)) {
            Box(
                modifier = Modifier
                    .width(140.dp)
                    .height(90.dp)
                    .clip(RoundedCornerShape(10.dp))
                    .background(MaterialTheme.colorScheme.surfaceContainerHigh),
                contentAlignment = Alignment.Center,
            ) {
                if (state.coverImage.isNotBlank()) {
                    AsyncImage(model = state.coverImage, contentDescription = null, contentScale = ContentScale.Crop, modifier = Modifier.fillMaxSize())
                } else {
                    Icon(Icons.Filled.Image, contentDescription = null, tint = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            }
            if (!isLocked) {
                OutlinedButton(onClick = onPickCover, enabled = !state.uploadingCover, modifier = Modifier.padding(start = Spacing.md)) {
                    if (state.uploadingCover) {
                        CircularProgressIndicator(modifier = Modifier.size(16.dp))
                        Text(stringResource(R.string.journalist_editor_uploading), modifier = Modifier.padding(start = 6.dp))
                    } else {
                        Text(stringResource(R.string.journalist_editor_upload_image))
                    }
                }
            }
        }

        OutlinedTextField(
            value = state.title,
            onValueChange = viewModel::onTitleChange,
            enabled = !isLocked,
            label = { Text(stringResource(R.string.journalist_editor_title)) },
            placeholder = { Text(stringResource(R.string.journalist_editor_title_placeholder)) },
            singleLine = true,
            modifier = Modifier.fillMaxWidth().padding(top = Spacing.lg),
        )

        OutlinedTextField(
            value = state.slug,
            onValueChange = viewModel::onSlugChange,
            enabled = !isLocked,
            label = { Text(stringResource(R.string.journalist_editor_slug)) },
            placeholder = { Text(stringResource(R.string.journalist_editor_slug_placeholder)) },
            singleLine = true,
            modifier = Modifier.fillMaxWidth().padding(top = Spacing.md),
        )

        var categoryMenuExpanded by remember { mutableStateOf(false) }
        Text(stringResource(R.string.journalist_editor_category), style = MaterialTheme.typography.labelMedium, modifier = Modifier.padding(top = Spacing.md))
        ExposedDropdownMenuBox(
            expanded = categoryMenuExpanded && !isLocked,
            onExpandedChange = { if (!isLocked) categoryMenuExpanded = it },
            modifier = Modifier.padding(top = 4.dp),
        ) {
            OutlinedTextField(
                value = newsCategoryLabel(state.category),
                onValueChange = {},
                readOnly = true,
                enabled = !isLocked,
                trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded = categoryMenuExpanded && !isLocked) },
                modifier = Modifier
                    .fillMaxWidth()
                    .menuAnchor(),
            )
            ExposedDropdownMenu(expanded = categoryMenuExpanded && !isLocked, onDismissRequest = { categoryMenuExpanded = false }) {
                NEWS_CATEGORIES.forEach { category ->
                    DropdownMenuItem(
                        text = { Text(newsCategoryLabel(category)) },
                        onClick = { viewModel.onCategoryChange(category); categoryMenuExpanded = false },
                    )
                }
            }
        }

        OutlinedTextField(
            value = state.excerpt,
            onValueChange = viewModel::onExcerptChange,
            enabled = !isLocked,
            label = { Text(stringResource(R.string.journalist_editor_excerpt)) },
            placeholder = { Text(stringResource(R.string.journalist_editor_excerpt_placeholder)) },
            minLines = 2,
            modifier = Modifier.fillMaxWidth().padding(top = Spacing.md),
        )

        OutlinedTextField(
            value = state.content,
            onValueChange = viewModel::onContentChange,
            enabled = !isLocked,
            label = { Text(stringResource(R.string.journalist_editor_content)) },
            placeholder = { Text(stringResource(R.string.journalist_editor_content_placeholder)) },
            minLines = 12,
            modifier = Modifier.fillMaxWidth().padding(top = Spacing.md),
        )

        OutlinedTextField(
            value = state.sourceName,
            onValueChange = viewModel::onSourceNameChange,
            enabled = !isLocked,
            label = { Text(stringResource(R.string.journalist_editor_source_name)) },
            singleLine = true,
            modifier = Modifier.fillMaxWidth().padding(top = Spacing.md),
        )
        OutlinedTextField(
            value = state.sourceUrl,
            onValueChange = viewModel::onSourceUrlChange,
            enabled = !isLocked,
            label = { Text(stringResource(R.string.journalist_editor_source_url)) },
            singleLine = true,
            modifier = Modifier.fillMaxWidth().padding(top = Spacing.md),
        )

        HorizontalDivider(modifier = Modifier.padding(vertical = Spacing.lg))

        Row(horizontalArrangement = Arrangement.spacedBy(Spacing.sm)) {
            OutlinedButton(onClick = onPreview) {
                Icon(Icons.Filled.Visibility, contentDescription = null, modifier = Modifier.size(16.dp))
                Text(stringResource(R.string.journalist_editor_preview), modifier = Modifier.padding(start = 6.dp))
            }
        }

        if (!isLocked) {
            Row(horizontalArrangement = Arrangement.spacedBy(Spacing.sm), modifier = Modifier.padding(top = Spacing.sm)) {
                OutlinedButton(onClick = { viewModel.save(submit = false, onSuccess = onSaved) }, enabled = state.saving == null) {
                    if (state.saving == ArticleSaving.DRAFT) {
                        CircularProgressIndicator(modifier = Modifier.size(16.dp))
                    } else {
                        Icon(Icons.Filled.Description, contentDescription = null, modifier = Modifier.size(16.dp))
                    }
                    Text(stringResource(R.string.journalist_editor_save_draft), modifier = Modifier.padding(start = 6.dp))
                }
                Button(onClick = { viewModel.save(submit = true, onSuccess = onSaved) }, enabled = state.saving == null) {
                    if (state.saving == ArticleSaving.SUBMIT) {
                        CircularProgressIndicator(modifier = Modifier.size(16.dp))
                    } else {
                        Icon(Icons.Filled.Send, contentDescription = null, modifier = Modifier.size(16.dp))
                    }
                    Text(
                        text = stringResource(if (isRejected) R.string.journalist_editor_resubmit_for_review else R.string.journalist_editor_submit_for_review),
                        modifier = Modifier.padding(start = 6.dp),
                    )
                }
            }
        }
    }
}
