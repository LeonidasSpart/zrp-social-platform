package one.zrp.social.mobile.ui.opportunity

import android.content.Intent
import android.net.Uri
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
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.AttachFile
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
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
import one.zrp.social.mobile.network.OpportunityApplication
import one.zrp.social.mobile.ui.components.Avatar
import one.zrp.social.mobile.ui.components.VerifiedBadge

/**
 * Applicants - ported from ListingApplicantsPage.tsx: a poster reviewing
 * everyone who applied to one of their own listings, with cover
 * note/resume and accept/reject/mark-reviewed actions on PENDING and
 * REVIEWED applications.
 */
@Composable
fun OpportunityApplicantsScreen(listingId: String, onBack: () -> Unit, onOpenApplicant: (String) -> Unit) {
    val viewModel: OpportunityApplicantsViewModel = viewModel(
        factory = remember { OpportunityApplicantsViewModelFactory(listingId, OpportunityRepository()) },
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
                text = stringResource(R.string.opportunity_applicants),
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
                    text = stringResource(R.string.opportunity_no_applicants_yet),
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
                    ApplicantRow(
                        application = application,
                        isBusy = state.busyId == application.id,
                        onOpenApplicant = onOpenApplicant,
                        onAccept = { viewModel.updateStatus(application.id, "ACCEPTED") },
                        onReject = { viewModel.updateStatus(application.id, "REJECTED") },
                        onMarkReviewed = { viewModel.updateStatus(application.id, "REVIEWED") },
                    )
                }
            }
        }
    }
}

@Composable
private fun ApplicantRow(
    application: OpportunityApplication,
    isBusy: Boolean,
    onOpenApplicant: (String) -> Unit,
    onAccept: () -> Unit,
    onReject: () -> Unit,
    onMarkReviewed: () -> Unit,
) {
    val applicant = application.applicant
    val context = LocalContext.current

    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(16.dp))
            .background(MaterialTheme.colorScheme.surfaceContainerLow)
            .padding(16.dp),
    ) {
        Row(modifier = Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            if (applicant != null) {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    modifier = Modifier
                        .weight(1f)
                        .clickable(role = Role.Button) { onOpenApplicant(applicant.username) },
                ) {
                    Avatar(url = applicant.avatarUrl, name = applicant.name ?: applicant.username, size = 36.dp)
                    Text(
                        text = "@${applicant.username}",
                        fontWeight = FontWeight.Bold,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                        modifier = Modifier.weight(1f, fill = false).padding(start = 8.dp),
                    )
                    if (applicant.badgeType != null) {
                        VerifiedBadge(badgeType = applicant.badgeType)
                    }
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

        if (!application.coverNote.isNullOrBlank()) {
            Text(
                text = application.coverNote,
                style = MaterialTheme.typography.bodySmall,
                modifier = Modifier.padding(top = 8.dp),
            )
        }

        if (application.resumeUrl != null) {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                modifier = Modifier
                    .padding(top = 8.dp)
                    .clickable(role = Role.Button) {
                        context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(application.resumeUrl)))
                    },
            ) {
                Icon(Icons.Filled.AttachFile, contentDescription = null, modifier = Modifier.padding(end = 4.dp))
                Text(
                    text = stringResource(R.string.opportunity_view_resume),
                    style = MaterialTheme.typography.labelSmall,
                    fontWeight = FontWeight.Bold,
                )
            }
        }

        if (application.status == "PENDING" || application.status == "REVIEWED") {
            Row(modifier = Modifier.padding(top = 12.dp)) {
                Button(onClick = onAccept, enabled = !isBusy) {
                    Text(stringResource(R.string.opportunity_app_status_accepted))
                }
                OutlinedButton(onClick = onReject, enabled = !isBusy, modifier = Modifier.padding(start = 8.dp)) {
                    Text(stringResource(R.string.opportunity_app_status_rejected))
                }
                if (application.status == "PENDING") {
                    OutlinedButton(onClick = onMarkReviewed, enabled = !isBusy, modifier = Modifier.padding(start = 8.dp)) {
                        Text(stringResource(R.string.opportunity_app_status_reviewed))
                    }
                }
            }
        }
    }
}
