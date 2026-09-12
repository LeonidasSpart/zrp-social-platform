package one.zrp.social.mobile.ui.pricing

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Close
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import one.zrp.social.mobile.R
import one.zrp.social.mobile.ui.theme.Spacing
import one.zrp.social.mobile.ui.theme.ZrpRed

/**
 * The website's own /pricing (PricingCards.tsx) as a real native screen -
 * a read-only comparison of the same four real plans (PRICING_PLANS,
 * ported field-for-field from src/lib/limits.ts's PLANS table), not a
 * WebView. There is deliberately no "Upgrade"/"Subscribe with crypto"
 * button here: web's own equivalent button is already gated behind
 * isNativeStoreRestrictedPayment() + NativePaymentNotice inside a native
 * app context (see PricingCards.tsx), under the same standing policy
 * that keeps tips, premium-post unlocking and campaign contributions out
 * of this app - so this screen shows that same real message inline for
 * every plan the viewer isn't already on, instead of a button that would
 * only pop the same notice anyway.
 */
@Composable
fun PricingScreen(currentPlan: String?, onBack: () -> Unit) {
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
                text = stringResource(R.string.pricing_choose_your_plan),
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.Bold,
                modifier = Modifier.padding(start = 4.dp),
            )
        }
        HorizontalDivider()

        LazyColumn(
            modifier = Modifier.fillMaxSize(),
            contentPadding = androidx.compose.foundation.layout.PaddingValues(Spacing.lg),
            verticalArrangement = Arrangement.spacedBy(Spacing.lg),
        ) {
            item {
                Text(
                    text = stringResource(R.string.pricing_charity_tagline),
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.padding(bottom = Spacing.sm),
                )
            }
            items(PRICING_PLANS, key = { it.key }) { plan ->
                PricingPlanCard(plan = plan, isCurrent = plan.key == currentPlan)
            }
        }
    }
}

@Composable
private fun PricingPlanCard(plan: PricingPlan, isCurrent: Boolean) {
    Surface(
        shape = RoundedCornerShape(Spacing.md),
        tonalElevation = if (isCurrent) 3.dp else 1.dp,
        border = if (isCurrent) {
            androidx.compose.foundation.BorderStroke(1.5.dp, ZrpRed)
        } else {
            null
        },
        modifier = Modifier.fillMaxWidth(),
    ) {
        Column(modifier = Modifier.padding(Spacing.lg)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(
                    text = stringResource(plan.nameRes),
                    style = MaterialTheme.typography.titleLarge,
                    fontWeight = FontWeight.Bold,
                    modifier = Modifier.weight(1f),
                )
                if (isCurrent) {
                    Surface(shape = RoundedCornerShape(50), color = ZrpRed.copy(alpha = 0.12f)) {
                        Text(
                            text = stringResource(R.string.pricing_current_plan),
                            style = MaterialTheme.typography.labelMedium,
                            color = ZrpRed,
                            fontWeight = FontWeight.Bold,
                            modifier = Modifier.padding(horizontal = Spacing.md, vertical = Spacing.xs),
                        )
                    }
                }
            }

            Row(verticalAlignment = Alignment.Bottom, modifier = Modifier.padding(top = Spacing.xs)) {
                Text(
                    text = if (plan.priceUsd == "0") "$0" else "$${plan.priceUsd}",
                    style = MaterialTheme.typography.headlineSmall,
                    fontWeight = FontWeight.Bold,
                )
                if (plan.priceUsd != "0") {
                    Text(
                        text = " ${stringResource(R.string.pricing_per_month)}",
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }

            Column(modifier = Modifier.padding(top = Spacing.md), verticalArrangement = Arrangement.spacedBy(Spacing.sm)) {
                // Matches PricingCards.tsx exactly: only these three fields
                // ever reach the 999999 sentinel that means "unlimited" -
                // videoUploadMB's real max (2048, enterprise) is always a
                // literal number on web too, never this ternary.
                val unlimited = stringResource(R.string.pricing_unlimited)
                fun countOrUnlimited(n: Int) = if (n == 999999) unlimited else n.toString()

                BulletFeatureRow(
                    stringResource(R.string.pricing_feature_post_length, countOrUnlimited(plan.postLength)),
                )
                BulletFeatureRow(
                    stringResource(R.string.pricing_feature_images_per_post, countOrUnlimited(plan.imagesPerPost)),
                )
                BulletFeatureRow(stringResource(R.string.pricing_feature_video_upload, plan.videoUploadMB))
                BulletFeatureRow(
                    stringResource(R.string.pricing_feature_scheduled_posts, countOrUnlimited(plan.scheduledPostsPerMonth)),
                )
                BulletFeatureRow(
                    stringResource(R.string.pricing_feature_analytics, stringResource(plan.analyticsRes)),
                )
                CheckFeatureRow(plan.verifiedBadge, R.string.pricing_feature_verified_badge, R.string.pricing_feature_no_verified_badge)
                CheckFeatureRow(plan.customProfileUrl, R.string.pricing_feature_custom_url, R.string.pricing_feature_no_custom_url)
                CheckFeatureRow(plan.recruitmentProfiles, R.string.pricing_feature_recruitment, R.string.pricing_feature_no_recruitment)
                CheckFeatureRow(plan.articlePublishing, R.string.pricing_feature_articles, R.string.pricing_feature_no_articles)
                CheckFeatureRow(plan.teamManagement, R.string.pricing_feature_team_management, R.string.pricing_feature_no_team_management)
                CheckFeatureRow(plan.apiAccess, R.string.pricing_feature_api_access, R.string.pricing_feature_no_api_access)
                BulletFeatureRow(stringResource(R.string.pricing_feature_support, stringResource(plan.supportRes)))
                BulletFeatureRow(stringResource(R.string.pricing_feature_charity, plan.charityContributionPercent))
            }

            if (!isCurrent) {
                Text(
                    text = stringResource(R.string.pricing_upgrade_web_only),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.padding(top = Spacing.md),
                )
            }
        }
    }
}

@Composable
private fun BulletFeatureRow(text: String) {
    Row(verticalAlignment = Alignment.Top) {
        Box(
            modifier = Modifier
                .padding(top = 8.dp, end = Spacing.sm)
                .size(6.dp)
                .background(MaterialTheme.colorScheme.onSurfaceVariant, CircleShape),
        )
        Text(text = text, style = MaterialTheme.typography.bodyMedium)
    }
}

@Composable
private fun CheckFeatureRow(has: Boolean, hasRes: Int, notHasRes: Int) {
    Row(verticalAlignment = Alignment.CenterVertically) {
        Icon(
            imageVector = if (has) Icons.Filled.Check else Icons.Filled.Close,
            contentDescription = null,
            tint = if (has) ZrpRed else MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier
                .size(18.dp)
                .padding(end = Spacing.sm),
        )
        Text(
            text = stringResource(if (has) hasRes else notHasRes),
            style = MaterialTheme.typography.bodyMedium,
            color = if (has) MaterialTheme.colorScheme.onSurface else MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
}
