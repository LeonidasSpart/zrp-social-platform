package one.zrp.social.mobile.ui.home

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Campaign
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import coil.compose.AsyncImage
import one.zrp.social.mobile.R
import one.zrp.social.mobile.network.ServedAd
import one.zrp.social.mobile.ui.components.Avatar
import one.zrp.social.mobile.ui.components.VerifiedBadge
import one.zrp.social.mobile.ui.theme.Spacing

/**
 * The one sponsored post the home feed shows per load (see
 * HomeViewModel's own `ad` StateFlow) - a deliberately simple,
 * self-contained card that reuses none of PostCard's like/comment/
 * repost engagement machinery, matching AdCard.tsx's own comment: an ad
 * isn't a normal timeline post. Impression tracking fires once this
 * enters composition, the same "logged the moment it's rendered" shape
 * PostCard's own view-count LaunchedEffect already uses for POST /posts/
 * {id}/view - not a true 50%-visibility IntersectionObserver like web's,
 * but consistent with the already-reviewed native precedent for view
 * tracking rather than introducing a second, different mechanism here.
 */
@Composable
fun AdCard(
    ad: ServedAd,
    onAuthorClick: (String) -> Unit,
    onAdClick: () -> Unit,
    onImpression: () -> Unit,
    modifier: Modifier = Modifier,
) {
    LaunchedEffect(ad.campaignId) {
        onImpression()
    }

    val post = ad.post
    val image = post.imageUrls?.firstOrNull() ?: post.imageUrl

    Column(
        modifier = modifier
            .fillMaxWidth()
            .padding(horizontal = Spacing.lg, vertical = Spacing.md),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Icon(
                imageVector = Icons.Filled.Campaign,
                contentDescription = null,
                tint = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.size(14.dp),
            )
            Spacer(modifier = Modifier.width(4.dp))
            Text(
                text = stringResource(R.string.ads_sponsored_label),
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }

        Row(verticalAlignment = Alignment.Top, modifier = Modifier.padding(top = Spacing.sm)) {
            // A normal profile visit, not part of the tracked/billed ad
            // click - matching AdCard.tsx's own distinction between its
            // author link and the post body/image.
            Avatar(
                url = post.author.avatarUrl,
                name = post.author.name ?: post.author.username,
                size = 48.dp,
                modifier = Modifier.clickable { onAuthorClick(post.author.username) },
            )

            Spacer(modifier = Modifier.width(Spacing.md))

            Column(modifier = Modifier.fillMaxWidth()) {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    modifier = Modifier.clickable { onAuthorClick(post.author.username) },
                ) {
                    Text(
                        text = post.author.name ?: post.author.username,
                        style = MaterialTheme.typography.titleSmall,
                        fontWeight = FontWeight.Bold,
                        maxLines = 1,
                    )
                    VerifiedBadge(badgeType = post.author.badgeType, modifier = Modifier.padding(start = 3.dp))
                }

                // The actual tracked, billed ad click.
                Column(modifier = Modifier.clickable { onAdClick() }) {
                    Text(
                        text = post.content,
                        style = MaterialTheme.typography.bodyMedium,
                        modifier = Modifier.padding(top = Spacing.xs),
                    )
                    if (image != null) {
                        Box(
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(top = Spacing.sm)
                                .aspectRatio(1.91f)
                                .clip(RoundedCornerShape(16.dp))
                                .background(MaterialTheme.colorScheme.surfaceContainerLow),
                        ) {
                            AsyncImage(
                                model = image,
                                contentDescription = null,
                                contentScale = ContentScale.Crop,
                                modifier = Modifier.fillMaxSize(),
                            )
                        }
                    }
                }
            }
        }
    }

    HorizontalDivider()
}
