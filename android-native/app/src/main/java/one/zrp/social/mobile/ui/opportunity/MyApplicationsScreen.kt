package one.zrp.social.mobile.ui.opportunity

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
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
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import one.zrp.social.mobile.R
import one.zrp.social.mobile.data.OpportunityRepository
import one.zrp.social.mobile.network.OpportunityApplication
import one.zrp.social.mobile.ui.theme.ZrpRed

/**
 * My Applications - ported from MyApplicationsPage.tsx: every listing
 * this user has applied to, with its real application status badge.
 * Read-only, matching web exactly (no withdraw button there either).
 */
@Composable
fun MyApplicationsScreen(onBack: () -> Unit, onOpenListing: (String) -> Unit) {
    val viewModel: MyApplicationsViewModel = viewModel(
        factory = remember { MyApplicationsViewModelFactory(OpportunityRepository()) },
    )
    val state by viewModel.state.collectAsState()

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
                text = stringResource(R.string.opportunity_my_applications),
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.Bold,
                modifier = Modifier.padding(start = 4.dp),
            )
        }

        if (state.isLoading) {
            Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                CircularProgressIndicator()
            }
        } else if (state.applications.isEmpty()) {
            Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                Text(
                    text = stringResource(R.string.opportunity_no_applications_yet),
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.padding(32.dp),
                )
            }
        } else {
            LazyColumn(
                contentPadding = PaddingValues(16.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                items(state.applications, key = { it.id }) { application ->
                    MyApplicationRow(application = application, onClick = onOpenListing)
                }
            }
        }
    }
}

@Composable
private fun MyApplicationRow(application: OpportunityApplication, onClick: (String) -> Unit) {
    val listing = application.listing ?: return

    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(16.dp))
            .background(MaterialTheme.colorScheme.surfaceContainerLow)
            .clickable { onClick(listing.id) }
            .padding(16.dp),
    ) {
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
            if (listing.organizationName != null) {
                Text(
                    text = listing.organizationName,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
        Text(
            text = applicationStatusLabel(application.status),
            style = MaterialTheme.typography.labelSmall,
            fontWeight = FontWeight.Bold,
            color = applicationStatusColor(application.status),
            modifier = Modifier
                .clip(RoundedCornerShape(50))
                .background(applicationStatusColor(application.status).copy(alpha = 0.12f))
                .padding(horizontal = 8.dp, vertical = 2.dp),
        )
    }
}
