package one.zrp.social.mobile.ui.marketplace

import android.widget.Toast
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material.icons.filled.Favorite
import androidx.compose.material.icons.filled.Visibility
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
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
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import coil.compose.AsyncImage
import one.zrp.social.mobile.R
import one.zrp.social.mobile.data.MarketplaceRepository
import one.zrp.social.mobile.network.ListingSummary
import one.zrp.social.mobile.ui.theme.ZrpRed

/**
 * My Listings - ported from src/app/marketplace/my-listings/page.tsx:
 * a seller's own listings with real status badges (draft/pending
 * review/active/rejected/sold/expired/removed), rejection reason when
 * present, and edit/delete row actions.
 */
@Composable
fun MyListingsScreen(onBack: () -> Unit, onOpenListing: (String) -> Unit, onCreateListing: () -> Unit, onEditListing: (String) -> Unit) {
    val viewModel: MyListingsViewModel = viewModel(
        factory = remember { MyListingsViewModelFactory(MarketplaceRepository()) },
    )
    val state by viewModel.state.collectAsState()
    val context = LocalContext.current
    var pendingDeleteId by remember { mutableStateOf<String?>(null) }

    LaunchedEffect(state.error) {
        if (state.error == MyListingsViewModel.deleteFailedError) {
            Toast.makeText(context, context.getString(R.string.marketplace_err_delete_failed), Toast.LENGTH_SHORT).show()
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
                text = stringResource(R.string.marketplace_my_listings),
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.Bold,
                modifier = Modifier
                    .weight(1f)
                    .padding(start = 4.dp),
            )
            OutlinedButton(onClick = onCreateListing) {
                Icon(Icons.Filled.Add, contentDescription = null, modifier = Modifier.size(16.dp))
                Text(stringResource(R.string.marketplace_create_listing), modifier = Modifier.padding(start = 4.dp))
            }
        }

        if (state.isLoading) {
            Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                CircularProgressIndicator()
            }
        } else if (state.listings.isEmpty()) {
            Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                Text(
                    text = stringResource(R.string.marketplace_no_own_listings),
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
                    MyListingRow(
                        listing = listing,
                        isDeleting = state.deletingId == listing.id,
                        onClick = { onOpenListing(listing.id) },
                        onEdit = { onEditListing(listing.id) },
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
            title = { Text(stringResource(R.string.marketplace_delete)) },
            text = { Text(stringResource(R.string.marketplace_confirm_delete)) },
            confirmButton = {
                TextButton(
                    onClick = {
                        viewModel.deleteListing(deleteId)
                        pendingDeleteId = null
                    },
                ) {
                    Text(stringResource(R.string.marketplace_delete), color = MaterialTheme.colorScheme.error)
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

@Composable
private fun MyListingRow(
    listing: ListingSummary,
    isDeleting: Boolean,
    onClick: () -> Unit,
    onEdit: () -> Unit,
    onDelete: () -> Unit,
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(16.dp))
            .background(MaterialTheme.colorScheme.surfaceContainerLow)
            .padding(12.dp),
    ) {
        Box(
            modifier = Modifier
                .size(88.dp)
                .clip(RoundedCornerShape(12.dp))
                .background(MaterialTheme.colorScheme.surfaceContainerHigh)
                .clickable(onClick = onClick),
        ) {
            val coverImage = listing.imageUrls.firstOrNull()
            if (coverImage != null) {
                AsyncImage(
                    model = coverImage,
                    contentDescription = listing.title,
                    contentScale = ContentScale.Crop,
                    modifier = Modifier.fillMaxSize(),
                )
            } else {
                Icon(
                    categoryIcon(listing.category),
                    contentDescription = listing.title,
                    modifier = Modifier
                        .fillMaxSize()
                        .padding(20.dp),
                )
            }
        }

        Column(
            modifier = Modifier
                .weight(1f)
                .padding(start = 12.dp),
        ) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                if (listing.status != null) {
                    Text(
                        text = listingStatusLabel(listing.status),
                        style = MaterialTheme.typography.labelSmall,
                        fontWeight = FontWeight.Bold,
                        color = listingStatusColor(listing.status),
                        modifier = Modifier
                            .clip(RoundedCornerShape(50))
                            .background(listingStatusColor(listing.status).copy(alpha = 0.12f))
                            .padding(horizontal = 8.dp, vertical = 2.dp),
                    )
                }
                Text(
                    text = categoryLabel(listing.category),
                    style = MaterialTheme.typography.labelSmall,
                    fontWeight = FontWeight.Bold,
                    color = ZrpRed,
                    modifier = Modifier.padding(start = 8.dp),
                )
            }
            Text(
                text = listing.title,
                fontWeight = FontWeight.Bold,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier
                    .clickable(onClick = onClick)
                    .padding(top = 2.dp),
            )
            Text(
                text = formatListingPrice(listing.price, listing.currency, listing.priceOnRequest),
                fontWeight = FontWeight.Bold,
                modifier = Modifier.padding(top = 2.dp),
            )
            if (listing.status == "REJECTED" && !listing.rejectionReason.isNullOrBlank()) {
                Text(
                    text = "${stringResource(R.string.marketplace_rejection_reason_label)}: ${listing.rejectionReason}",
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.error,
                    modifier = Modifier.padding(top = 2.dp),
                )
            }
            Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.padding(top = 4.dp)) {
                Icon(
                    Icons.Filled.Visibility,
                    contentDescription = null,
                    tint = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.size(12.dp),
                )
                Text(
                    text = "${listing.views}",
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.padding(start = 2.dp, end = 8.dp),
                )
                Icon(
                    Icons.Filled.Favorite,
                    contentDescription = null,
                    tint = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.size(12.dp),
                )
                Text(
                    text = "${listing._count.favorites}",
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.padding(start = 2.dp),
                )
            }
        }

        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            IconButton(onClick = onEdit) {
                Icon(Icons.Filled.Edit, contentDescription = stringResource(R.string.marketplace_edit))
            }
            if (isDeleting) {
                CircularProgressIndicator(modifier = Modifier.size(24.dp), strokeWidth = 2.dp)
            } else {
                IconButton(onClick = onDelete) {
                    Icon(Icons.Filled.Delete, contentDescription = stringResource(R.string.marketplace_delete), tint = MaterialTheme.colorScheme.error)
                }
            }
        }
    }
}
