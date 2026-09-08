package one.zrp.social.mobile.ui.components

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import one.zrp.social.mobile.ui.theme.IconSize
import one.zrp.social.mobile.ui.theme.Spacing
import one.zrp.social.mobile.ui.theme.ZrpRed

/**
 * One empty/error state for the whole app.
 *
 * Every list screen here previously either rendered nothing at all when
 * it had no rows, or a bare centred sentence - so "no data yet" and
 * "something broke" looked identical, and neither told anyone what to
 * do next. This is the shape the website already uses for the same
 * situation (a tinted circular glyph, a title, one supporting line, and
 * the actions that actually resolve it), so the two frontends answer an
 * empty screen the same way.
 *
 * Actions are optional and are real navigation only - never a button
 * that pretends a feature exists.
 */
data class EmptyStateAction(
    val label: String,
    val icon: ImageVector? = null,
    val onClick: () -> Unit,
)

@OptIn(ExperimentalLayoutApi::class)
@Composable
fun ZrpEmptyState(
    icon: ImageVector,
    title: String,
    body: String? = null,
    primaryAction: EmptyStateAction? = null,
    secondaryActions: List<EmptyStateAction> = emptyList(),
    modifier: Modifier = Modifier,
) {
    Column(
        modifier = modifier
            .fillMaxWidth()
            .padding(horizontal = Spacing.xl, vertical = Spacing.xxl),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Surface(
            shape = CircleShape,
            color = ZrpRed.copy(alpha = 0.10f),
            modifier = Modifier.size(64.dp),
        ) {
            Box(contentAlignment = Alignment.Center) {
                Icon(
                    imageVector = icon,
                    contentDescription = null,
                    tint = ZrpRed,
                    modifier = Modifier.size(IconSize.lg),
                )
            }
        }

        Text(
            text = title,
            style = MaterialTheme.typography.titleMedium,
            fontWeight = FontWeight.Bold,
            color = MaterialTheme.colorScheme.onSurface,
            textAlign = TextAlign.Center,
            modifier = Modifier.padding(top = Spacing.lg),
        )

        if (body != null) {
            Text(
                text = body,
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                textAlign = TextAlign.Center,
                modifier = Modifier
                    .padding(top = Spacing.sm)
                    .widthIn(max = 320.dp),
            )
        }

        if (primaryAction != null || secondaryActions.isNotEmpty()) {
            // FlowRow so three actions wrap instead of squeezing or
            // clipping on a 320dp-wide phone.
            FlowRow(
                modifier = Modifier.padding(top = Spacing.lg),
                horizontalArrangement = Arrangement.spacedBy(Spacing.sm, Alignment.CenterHorizontally),
                verticalArrangement = Arrangement.spacedBy(Spacing.sm),
            ) {
                if (primaryAction != null) {
                    Button(
                        onClick = primaryAction.onClick,
                        colors = ButtonDefaults.buttonColors(containerColor = ZrpRed),
                    ) {
                        if (primaryAction.icon != null) {
                            Icon(
                                primaryAction.icon,
                                contentDescription = null,
                                modifier = Modifier.size(IconSize.sm),
                            )
                            Spacer(modifier = Modifier.width(Spacing.xs))
                        }
                        Text(primaryAction.label)
                    }
                }
                secondaryActions.forEach { action ->
                    OutlinedButton(onClick = action.onClick) {
                        if (action.icon != null) {
                            Icon(
                                action.icon,
                                contentDescription = null,
                                modifier = Modifier.size(IconSize.sm),
                            )
                            Spacer(modifier = Modifier.width(Spacing.xs))
                        }
                        Text(action.label)
                    }
                }
            }
        }
    }
}
