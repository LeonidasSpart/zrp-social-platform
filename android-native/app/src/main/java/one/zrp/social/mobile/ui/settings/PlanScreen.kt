package one.zrp.social.mobile.ui.settings

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
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

private data class PlanInfo(
    val id: String,
    val nameRes: Int,
    val priceMonthly: Double?,
    val postLength: Int,
    val imagesPerPost: Int,
    val videoUploadMB: Int,
    val scheduledPostsPerMonth: Int,
)

// Mirrors src/lib/limits.ts's PLANS table exactly (postLength,
// imagesPerPost, videoUploadMB, scheduledPostsPerMonth, priceMonthly) -
// static display data, not a network call. No purchase/upgrade action
// anywhere on this screen: per the redesign's approved scope, plan
// changes are not offered from the native app (Google Play generally
// requires in-app digital-subscription purchases to go through Play
// Billing, not an external USDC/crypto flow like web's - a policy
// question for product/legal to resolve, not something to route around
// here). This screen exists purely so a user can see what their current
// plan includes and what the others offer, matching web's own /pricing
// content without adding a purchase flow this app doesn't have.
private val PLANS = listOf(
    PlanInfo("free", R.string.plan_free, 0.0, 280, 1, 32, 5),
    PlanInfo("pro", R.string.plan_pro, 9.99, 1000, 4, 100, 50),
    PlanInfo("business", R.string.plan_business, 49.99, 5000, 10, 500, 500),
    PlanInfo("enterprise", R.string.plan_enterprise, 99.99, 999999, 999999, 2048, 999999),
)

@Composable
fun PlanScreen(currentPlan: String?, onBack: () -> Unit) {
    Column(modifier = Modifier.fillMaxWidth()) {
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
                text = stringResource(R.string.plan_screen_title),
                style = MaterialTheme.typography.titleMedium,
                modifier = Modifier.padding(start = 4.dp),
            )
        }
        HorizontalDivider()

        Text(
            text = stringResource(R.string.plan_screen_note),
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.padding(Spacing.lg),
        )

        Column(
            modifier = Modifier
                .verticalScroll(rememberScrollState())
                .padding(horizontal = Spacing.lg),
            verticalArrangement = Arrangement.spacedBy(Spacing.md),
        ) {
            PLANS.forEach { plan ->
                val isCurrent = plan.id.equals(currentPlan, ignoreCase = true)
                Card(
                    colors = if (isCurrent) {
                        CardDefaults.cardColors(containerColor = ZrpRed.copy(alpha = 0.10f))
                    } else {
                        CardDefaults.cardColors()
                    },
                ) {
                    Column(modifier = Modifier.padding(Spacing.lg)) {
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                Text(
                                    text = stringResource(plan.nameRes),
                                    style = MaterialTheme.typography.titleMedium,
                                    fontWeight = FontWeight.Bold,
                                )
                                if (isCurrent) {
                                    Icon(
                                        imageVector = Icons.Filled.CheckCircle,
                                        contentDescription = stringResource(R.string.plan_current_badge),
                                        tint = ZrpRed,
                                        modifier = Modifier.padding(start = Spacing.sm).size(20.dp),
                                    )
                                }
                            }
                            Text(
                                text = if (plan.priceMonthly == 0.0) {
                                    stringResource(R.string.plan_free_price)
                                } else {
                                    stringResource(R.string.plan_price_monthly, plan.priceMonthly ?: 0.0)
                                },
                                style = MaterialTheme.typography.titleMedium,
                                color = ZrpRed,
                                fontWeight = FontWeight.Bold,
                            )
                        }

                        HorizontalDivider(modifier = Modifier.padding(vertical = Spacing.sm))

                        PlanLimitLine(
                            stringResource(
                                R.string.plan_limit_post_length,
                                if (plan.postLength >= 999999) stringResource(R.string.plan_unlimited) else plan.postLength.toString(),
                            ),
                        )
                        PlanLimitLine(
                            stringResource(
                                R.string.plan_limit_images,
                                if (plan.imagesPerPost >= 999999) stringResource(R.string.plan_unlimited) else plan.imagesPerPost.toString(),
                            ),
                        )
                        PlanLimitLine(stringResource(R.string.plan_limit_video, plan.videoUploadMB))
                        PlanLimitLine(
                            stringResource(
                                R.string.plan_limit_scheduled,
                                if (plan.scheduledPostsPerMonth >= 999999) stringResource(R.string.plan_unlimited) else plan.scheduledPostsPerMonth.toString(),
                            ),
                        )
                    }
                }
            }

            Spacer(Modifier.height(Spacing.xxl))
        }
    }
}

@Composable
private fun PlanLimitLine(text: String) {
    Text(
        text = "• $text",
        style = MaterialTheme.typography.bodyMedium,
        color = MaterialTheme.colorScheme.onSurfaceVariant,
        modifier = Modifier.padding(vertical = 2.dp),
    )
}
