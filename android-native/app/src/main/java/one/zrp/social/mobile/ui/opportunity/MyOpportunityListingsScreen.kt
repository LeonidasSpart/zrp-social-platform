package one.zrp.social.mobile.ui.opportunity

import android.widget.Toast
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material.icons.filled.People
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
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
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import one.zrp.social.mobile.R
import one.zrp.social.mobile.data.OpportunityRepository
import one.zrp.social.mobile.network.OpportunitySummary
import one.zrp.social.mobile.ui.theme.ZrpRed

/**
 * My Listings - ported from MyOpportunityListingsPage.tsx: a poster's
 * own listings with real status badges, rejection-reason display, and
 * View Applicants/Edit/Delete row actions.
 */
@Composable
fun MyOpportunityListingsScreen(
    onBack: () -> Unit,
    onOpenListing: (String) -> Unit,
    onEditListing: (String) -> Unit,
    onOpenApplicants: (String) -> Unit,
) {
    val viewModel: MyOpportunityListingsViewModel = viewModel(
        factory = remember { MyOpportunityListingsViewModelFactory(OpportunityRepository()) },
    )
    val state by viewModel.state.collectAsState()
    val context = LocalContext.current
    var pendingDeleteId by remember { mutableStateOf<String?>(null) }

    LaunchedEffect(state.error) {
        if (state.error == MyOpportunityListingsViewModel.deleteFailedError) {
            Toast.makeText(context, context.getString(R.string.opportunity_err_delete_failed), Toast.LENGTH_SHORT).show()
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
                text = stringResource(R.string.opportunity_my_listings),
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.Bold,
                modifier = Modifier.padding(start = 4.dp),
            )
        }

        if (state.isLoading) {
            Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                CircularProgressIndicator()
            }
        } else if (state.listings.isEmpty()) {
            Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                Text(
                    text = stringResource(R.string.opportunity_no_own_listings),
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.padding(32.dp),
                )
            }
        } else {
            LazyColumn(
                contentPadding = PaddingValues(16.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                items(state.listings, key = { it.id }) { listing ->
                    MyOpportunityListingRow(
                        listing = listing,
                        isDeleting = state.deletingId == listing.id,
                        onClick = { onOpenListing(listing.id) },
                        onEdit = { onEditListing(listing.id) },
                        onOpenApplicants = { onOpenApplicants(listing.id) },
                        onDelete = { pendingDeleteId = listing.id },
                    )
                }
            }
        }
    }

    val deleteId = pendingDeleteId
    if (deleteId != null) {
        AlertDialog(
            onDismissRequest = { pendingDeleteId = null },
            title = { Text(stringResource(R.string.opportunity_delete)) },
            text = { Text(stringResource(R.string.opportunity_confirm_delete)) },
            confirmButton = {
                TextButton(
                    onClick = {
                        viewModel.deleteListing(deleteId)
                        pendingDeleteId = null
                    },
                ) {
                    Text(stringResource(R.string.opportunity_delete), color = MaterialTheme.colorScheme.error)
                }
            },
            dismissButton = {
                TextButton(onClick = { pendingDeleteId = null }) {
                    Text(stringResource(android.R.string.cancel))
                }
            },
        )
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun MyOpportunityListingRow(
    listing: OpportunitySummary,
    isDeleting: Boolean,
    onClick: () -> Unit,
    onEdit: () -> Unit,
    onOpenApplicants: () -> Unit,
    onDelete: () -> Unit,
) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(16.dp))
            .background(MaterialTheme.colorScheme.surfaceContainerLow)
            .clickable(onClick = onClick, role = Role.Button)
            .padding(16.dp),
    ) {
        Row(modifier = Modifier.fillMaxWidth()) {
            Column(modifier = Modifier.weight(1f)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Icon(opportunityTypeIcon(listing.type), contentDescription = null, tint = ZrpRed, modifier = Modifier.size(16.dp))
                    Text(
                        text = opportunityTypeLabel(listing.type),
                        style = MaterialTheme.typography.labelSmall,
                        fontWeight = FontWeight.Bold,
                        color = ZrpRed,
                        modifier = Modifier.padding(start = 4.dp),
                    )
                }
                Text(
                    text = listing.title,
                    fontWeight = FontWeight.Bold,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    modifier = Modifier.padding(top = 2.dp),
                )
            }
            if (listing.status != null) {
                Text(
                    text = opportunityStatusLabel(listing.status),
                    style = MaterialTheme.typography.labelSmall,
                    fontWeight = FontWeight.Bold,
                    color = opportunityStatusColor(listing.status),
                    modifier = Modifier
                        .clip(RoundedCornerShape(50))
                        .background(opportunityStatusColor(listing.status).copy(alpha = 0.12f))
                        .padding(horizontal = 8.dp, vertical = 2.dp),
                )
            }
        }

        if (listing.status == "REJECTED" && !listing.rejectionReason.isNullOrBlank()) {
            Text(
                text = listing.rejectionReason,
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.padding(top = 6.dp),
            )
        }

        // FlowRow (not a plain Row): this now holds 3 actions (View
        // Applicants, Edit, Delete) instead of the original 2 - on a
        // narrow phone the combined width of real translated labels can
        // exceed the card's width, so this wraps to a second line
        // instead of clipping/overlapping, matching the equivalent
        // mobile-safety fix on the web (opportunity/my-listings/page.tsx).
        FlowRow(
            verticalArrangement = Arrangement.spacedBy(4.dp),
            horizontalArrangement = Arrangement.spacedBy(16.dp),
            modifier = Modifier.padding(top = 8.dp),
        ) {
            Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.clickable(onClick = onOpenApplicants, role = Role.Button)) {
                Icon(Icons.Filled.People, contentDescription = null, tint = ZrpRed, modifier = Modifier.size(16.dp))
                Text(
                    text = stringResource(R.string.opportunity_view_applicants, listing._count.applications),
                    style = MaterialTheme.typography.labelSmall,
                    fontWeight = FontWeight.Bold,
                    color = ZrpRed,
                    modifier = Modifier.padding(start = 4.dp),
                )
            }
            Row(
                verticalAlignment = Alignment.CenterVertically,
                modifier = Modifier.clickable(onClick = onEdit, role = Role.Button),
            ) {
                Icon(Icons.Filled.Edit, contentDescription = null, tint = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.size(16.dp))
                Text(
                    text = stringResource(R.string.opportunity_edit_listing),
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.padding(start = 4.dp),
                )
            }
            if (isDeleting) {
                CircularProgressIndicator(modifier = Modifier.size(14.dp), strokeWidth = 2.dp)
            } else {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    modifier = Modifier.clickable(onClick = onDelete, role = Role.Button),
                ) {
                    Icon(Icons.Filled.Delete, contentDescription = null, tint = MaterialTheme.colorScheme.error, modifier = Modifier.size(16.dp))
                    Text(
                        text = stringResource(R.string.opportunity_delete),
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.error,
                        modifier = Modifier.padding(start = 4.dp),
                    )
                }
            }
        }
    }
}
