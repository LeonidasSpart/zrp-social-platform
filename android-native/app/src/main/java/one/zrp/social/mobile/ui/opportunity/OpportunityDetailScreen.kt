package one.zrp.social.mobile.ui.opportunity

import android.content.ContentResolver
import android.content.Intent
import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.AttachFile
import androidx.compose.material.icons.filled.Bookmark
import androidx.compose.material.icons.filled.BookmarkBorder
import androidx.compose.material.icons.filled.CalendarToday
import androidx.compose.material.icons.filled.Flag
import androidx.compose.material.icons.filled.Laptop
import androidx.compose.material.icons.filled.LocationOn
import androidx.compose.material.icons.filled.OpenInNew
import androidx.compose.material.icons.filled.Person
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
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
import one.zrp.social.mobile.data.OpportunityRepository
import one.zrp.social.mobile.ui.components.ReportDialog
import one.zrp.social.mobile.ui.components.VerifiedBadge
import one.zrp.social.mobile.ui.theme.Spacing
import one.zrp.social.mobile.ui.theme.ZrpRed

/**
 * A single opportunity listing - ported from OpportunityListingPage.tsx:
 * type badge, deadline/location/remote, compensation, skills, poster
 * card, and save/report/apply actions, plus owner-only View
 * Applicants/Edit buttons.
 */
@Composable
fun OpportunityDetailScreen(
    listingId: String,
    onBack: () -> Unit,
    onOpenPoster: (String) -> Unit,
    onEditListing: (String) -> Unit,
    onOpenApplicants: (String) -> Unit,
) {
    val viewModel: OpportunityDetailViewModel = viewModel(
        factory = remember { OpportunityDetailViewModelFactory(listingId, OpportunityRepository()) },
    )
    val state by viewModel.state.collectAsState()
    val context = LocalContext.current

    val resumePickerLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.GetContent(),
    ) { uri ->
        if (uri != null) {
            val (name, size) = queryResumeNameAndSize(context.contentResolver, uri)
            val mimeType = context.contentResolver.getType(uri) ?: "application/octet-stream"
            viewModel.onResumePicked(context.contentResolver, PickedResumeFile(uri, name, mimeType, size))
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
        }

        when {
            state.isLoading -> {
                Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    CircularProgressIndicator()
                }
            }
            state.notFound || state.listing == null -> {
                Column(
                    modifier = Modifier
                        .fillMaxSize()
                        .padding(Spacing.xl),
                    horizontalAlignment = Alignment.CenterHorizontally,
                ) {
                    Text(
                        text = stringResource(R.string.opportunity_err_load_failed),
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                    OutlinedButton(onClick = onBack, modifier = Modifier.padding(top = Spacing.md)) {
                        Text(stringResource(R.string.opportunity_back_to_opportunity))
                    }
                }
            }
            else -> {
                val listing = state.listing!!
                val isOwner = state.ownUserId == listing.posterId

                Column(
                    modifier = Modifier
                        .fillMaxSize()
                        .verticalScroll(rememberScrollState())
                        .padding(horizontal = Spacing.lg),
                ) {
                    Row(modifier = Modifier.fillMaxWidth()) {
                        Column(modifier = Modifier.weight(1f)) {
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                Icon(opportunityTypeIcon(listing.type), contentDescription = null, tint = ZrpRed, modifier = Modifier.size(16.dp))
                                Text(
                                    text = opportunityTypeLabel(listing.type),
                                    style = MaterialTheme.typography.labelMedium,
                                    fontWeight = FontWeight.Bold,
                                    color = ZrpRed,
                                    modifier = Modifier.padding(start = 4.dp),
                                )
                            }
                            Text(
                                text = listing.title,
                                style = MaterialTheme.typography.headlineSmall,
                                fontWeight = FontWeight.Bold,
                                modifier = Modifier.padding(top = Spacing.xs),
                            )
                            if (listing.organizationName != null) {
                                Text(
                                    text = listing.organizationName,
                                    style = MaterialTheme.typography.bodySmall,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                                )
                            }
                        }
                        if (!isOwner) {
                            IconButton(onClick = viewModel::toggleSave) {
                                Icon(
                                    if (state.saved) Icons.Filled.Bookmark else Icons.Filled.BookmarkBorder,
                                    contentDescription = stringResource(R.string.opportunity_save),
                                    tint = if (state.saved) ZrpRed else MaterialTheme.colorScheme.onSurfaceVariant,
                                )
                            }
                            if (!state.reportSent) {
                                IconButton(onClick = viewModel::onOpenReport) {
                                    Icon(
                                        Icons.Filled.Flag,
                                        contentDescription = stringResource(R.string.report_modal_title),
                                        tint = MaterialTheme.colorScheme.onSurfaceVariant,
                                    )
                                }
                            }
                        }
                    }

                    Row(modifier = Modifier.padding(top = Spacing.sm)) {
                        if (listing.location != null) {
                            Icon(Icons.Filled.LocationOn, contentDescription = null, modifier = Modifier.size(16.dp))
                            Text(
                                text = listing.location,
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                                modifier = Modifier.padding(start = 2.dp, end = Spacing.md),
                            )
                        }
                        if (listing.remote) {
                            Icon(Icons.Filled.Laptop, contentDescription = null, modifier = Modifier.size(16.dp))
                            Text(
                                text = stringResource(R.string.opportunity_remote),
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                                modifier = Modifier.padding(start = 2.dp, end = Spacing.md),
                            )
                        }
                        if (listing.deadline != null) {
                            Icon(Icons.Filled.CalendarToday, contentDescription = null, modifier = Modifier.size(16.dp))
                            Text(
                                text = formatOpportunityDeadline(listing.deadline),
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                                modifier = Modifier.padding(start = 2.dp),
                            )
                        }
                    }

                    if (listing.compensationInfo != null) {
                        Text(
                            text = listing.compensationInfo,
                            fontWeight = FontWeight.Bold,
                            modifier = Modifier.padding(top = Spacing.sm),
                        )
                    }

                    if (listing.skills.isNotEmpty()) {
                        Row(modifier = Modifier.padding(top = Spacing.sm)) {
                            listing.skills.forEach { skill ->
                                Text(
                                    text = skill,
                                    style = MaterialTheme.typography.labelSmall,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                                    modifier = Modifier
                                        .padding(end = 6.dp)
                                        .clip(RoundedCornerShape(50))
                                        .background(MaterialTheme.colorScheme.surfaceContainerHigh)
                                        .padding(horizontal = 8.dp, vertical = 3.dp),
                                )
                            }
                        }
                    }

                    Text(
                        text = listing.description,
                        style = MaterialTheme.typography.bodyMedium,
                        modifier = Modifier.padding(top = Spacing.lg),
                    )

                    if (listing.poster != null) {
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            modifier = Modifier
                                .padding(top = Spacing.lg)
                                .clickable { onOpenPoster(listing.poster.username) },
                        ) {
                            Box(
                                modifier = Modifier
                                    .size(32.dp)
                                    .clip(CircleShape)
                                    .background(MaterialTheme.colorScheme.surfaceContainerHigh),
                            ) {
                                if (listing.poster.avatarUrl != null) {
                                    AsyncImage(
                                        model = listing.poster.avatarUrl,
                                        contentDescription = null,
                                        contentScale = ContentScale.Crop,
                                        modifier = Modifier.fillMaxSize(),
                                    )
                                } else {
                                    Icon(Icons.Filled.Person, contentDescription = null, modifier = Modifier.fillMaxSize().padding(6.dp))
                                }
                            }
                            Text(
                                text = "@${listing.poster.username}",
                                fontWeight = FontWeight.Bold,
                                modifier = Modifier.padding(start = Spacing.xs),
                            )
                            if (listing.poster.badgeType != null) {
                                VerifiedBadge(badgeType = listing.poster.badgeType)
                            }
                        }
                    }

                    Box(modifier = Modifier.padding(top = Spacing.lg, bottom = Spacing.xl)) {
                        when {
                            isOwner -> {
                                Row {
                                    Button(onClick = { onOpenApplicants(listing.id) }) {
                                        Text(stringResource(R.string.opportunity_view_applicants, listing._count.applications))
                                    }
                                    OutlinedButton(onClick = { onEditListing(listing.id) }, modifier = Modifier.padding(start = Spacing.sm)) {
                                        Text(stringResource(R.string.opportunity_edit_listing))
                                    }
                                }
                            }
                            listing.externalUrl != null -> {
                                Button(
                                    onClick = {
                                        context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(listing.externalUrl)))
                                    },
                                ) {
                                    Icon(Icons.Filled.OpenInNew, contentDescription = null, modifier = Modifier.size(18.dp))
                                    Text(stringResource(R.string.opportunity_apply_externally), modifier = Modifier.padding(start = Spacing.xs))
                                }
                            }
                            state.applied -> {
                                Text(
                                    text = stringResource(
                                        if (state.justApplied) R.string.opportunity_application_sent else R.string.opportunity_already_applied,
                                    ),
                                    color = Color(0xFF15803D),
                                    fontWeight = FontWeight.Bold,
                                )
                            }
                            else -> {
                                Button(onClick = viewModel::onOpenApply) {
                                    Text(stringResource(R.string.opportunity_apply))
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    if (state.isApplyOpen) {
        ApplyDialog(
            state = state,
            onDismiss = viewModel::onCancelApply,
            onCoverNoteChange = viewModel::onCoverNoteChange,
            onPickResume = { resumePickerLauncher.launch("*/*") },
            onSubmit = viewModel::submitApply,
        )
    }

    if (state.isReportOpen) {
        ReportDialog(
            isSubmitting = state.isReportSubmitting,
            error = state.reportError,
            onDismiss = viewModel::onCancelReport,
            onSubmit = { reason, details -> viewModel.submitReport(reason, details) },
        )
    }
}

@Composable
private fun ApplyDialog(
    state: OpportunityDetailUiState,
    onDismiss: () -> Unit,
    onCoverNoteChange: (String) -> Unit,
    onPickResume: () -> Unit,
    onSubmit: () -> Unit,
) {
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(stringResource(R.string.opportunity_apply_title)) },
        text = {
            Column(modifier = Modifier.verticalScroll(rememberScrollState())) {
                Text(stringResource(R.string.opportunity_cover_note_label), style = MaterialTheme.typography.labelMedium)
                OutlinedTextField(
                    value = state.coverNote,
                    onValueChange = onCoverNoteChange,
                    placeholder = { Text(stringResource(R.string.opportunity_cover_note_placeholder)) },
                    minLines = 3,
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(top = 4.dp),
                )

                Text(
                    text = stringResource(R.string.opportunity_resume_label),
                    style = MaterialTheme.typography.labelMedium,
                    modifier = Modifier.padding(top = 12.dp),
                )
                if (state.resumeName != null) {
                    Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.padding(top = 4.dp)) {
                        Icon(Icons.Filled.AttachFile, contentDescription = null, modifier = Modifier.size(16.dp))
                        Text(text = state.resumeName, modifier = Modifier.padding(start = 4.dp))
                    }
                } else {
                    OutlinedButton(onClick = onPickResume, enabled = !state.isUploadingResume) {
                        if (state.isUploadingResume) {
                            CircularProgressIndicator(modifier = Modifier.size(16.dp), strokeWidth = 2.dp)
                        } else {
                            Icon(Icons.Filled.AttachFile, contentDescription = null, modifier = Modifier.size(16.dp))
                            Text(stringResource(R.string.opportunity_attach_resume), modifier = Modifier.padding(start = 4.dp))
                        }
                    }
                }

                if (state.applyError != null) {
                    val errorText = when (state.applyError) {
                        OpportunityDetailViewModel.applyFailedError -> stringResource(R.string.opportunity_err_apply_failed)
                        OpportunityDetailViewModel.resumeUploadFailedError -> stringResource(R.string.opportunity_err_resume_upload_failed)
                        else -> state.applyError
                    }
                    Text(text = errorText, color = MaterialTheme.colorScheme.error, modifier = Modifier.padding(top = 8.dp))
                }
            }
        },
        confirmButton = {
            if (state.isSubmittingApply) {
                CircularProgressIndicator(modifier = Modifier.padding(8.dp))
            } else {
                TextButton(onClick = onSubmit, enabled = !state.isUploadingResume) {
                    Text(stringResource(R.string.opportunity_submit_application))
                }
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss, enabled = !state.isSubmittingApply) {
                Text(stringResource(R.string.opportunity_close))
            }
        },
    )
}

private fun queryResumeNameAndSize(contentResolver: ContentResolver, uri: Uri): Pair<String, Long> {
    var name = "resume"
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
