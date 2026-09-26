package one.zrp.social.mobile.ui.components

import android.content.Context
import android.os.Build
import android.widget.Toast
import androidx.annotation.StringRes
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.defaultMinSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Shape
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.ClipboardManager
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import one.zrp.social.mobile.R
import one.zrp.social.mobile.ui.theme.IconSize
import one.zrp.social.mobile.ui.theme.Radius
import one.zrp.social.mobile.ui.theme.Spacing
import one.zrp.social.mobile.ui.theme.TouchTarget
import one.zrp.social.mobile.ui.theme.ZrpRed
import one.zrp.social.mobile.ui.theme.ZrpWhite

/**
 * ZRP's shared free-text composer field - the one input used by the DM
 * composer (1:1 and group), the comment composer (comments screen and
 * post detail), the post composer and the Shorts caption.
 *
 * Every colour is set EXPLICITLY here rather than inherited from
 * Material3 defaults: the typed text is always `onSurface`, the cursor
 * is always [ZrpRed], the placeholder is always `onSurfaceVariant`, the
 * container is the theme's raised surface. Nothing about what the user
 * is typing can silently depend on whichever `LocalContentColor` /
 * `LocalTextStyle` happens to be in scope at the call site (a dialog, a
 * red bubble, a black media overlay), which is the whole class of
 * "I'm typing but can't see the text" bugs this exists to close.
 *
 * Shape defaults to a pill ([Radius.lg]) that grows line by line up to
 * [maxLines] - a single line sits exactly at [TouchTarget.min] tall so
 * it lines up with the 48dp icon buttons beside it.
 */
@Composable
fun ZrpComposerField(
    value: String,
    onValueChange: (String) -> Unit,
    placeholder: String,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
    minLines: Int = 1,
    maxLines: Int = 5,
    shape: Shape = RoundedCornerShape(Radius.lg),
    textStyle: TextStyle = MaterialTheme.typography.bodyLarge,
    contentAlignment: Alignment = Alignment.CenterStart,
) {
    val textColor = MaterialTheme.colorScheme.onSurface
    val resolvedTextStyle = textStyle.copy(color = if (enabled) textColor else textColor.copy(alpha = 0.6f))

    BasicTextField(
        value = value,
        onValueChange = onValueChange,
        enabled = enabled,
        textStyle = resolvedTextStyle,
        cursorBrush = SolidColor(ZrpRed),
        minLines = minLines,
        maxLines = maxLines,
        keyboardOptions = KeyboardOptions(capitalization = KeyboardCapitalization.Sentences),
        modifier = modifier,
        decorationBox = { innerTextField ->
            Box(
                modifier = Modifier
                    .clip(shape)
                    .background(MaterialTheme.colorScheme.surfaceContainerHigh)
                    .border(1.dp, MaterialTheme.colorScheme.outlineVariant, shape)
                    .defaultMinSize(minHeight = TouchTarget.min)
                    // 12dp vertical + bodyLarge's 24sp line height = 48dp
                    // for one line, i.e. exactly TouchTarget.min.
                    .padding(horizontal = Spacing.lg, vertical = Spacing.md),
                contentAlignment = contentAlignment,
            ) {
                if (value.isEmpty()) {
                    Text(
                        text = placeholder,
                        style = textStyle,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                }
                innerTextField()
            }
        },
    )
}

/**
 * The primary "send" control of a composer row: a filled [ZrpRed] disc
 * inside a full [TouchTarget.min] hit area. Red is the only primary
 * action colour on the screen - the attach/mic controls beside it are
 * deliberately neutral so this is the one thing that reads as "go".
 */
@Composable
fun ComposerSendButton(
    onClick: () -> Unit,
    enabled: Boolean,
    isSending: Boolean,
    contentDescription: String,
    icon: ImageVector,
    modifier: Modifier = Modifier,
) {
    val active = enabled && !isSending
    IconButton(
        onClick = onClick,
        enabled = active,
        modifier = modifier.size(TouchTarget.min),
    ) {
        Box(
            modifier = Modifier
                .size(40.dp)
                .clip(CircleShape)
                .background(if (active) ZrpRed else MaterialTheme.colorScheme.surfaceContainerHighest),
            contentAlignment = Alignment.Center,
        ) {
            if (isSending) {
                CircularProgressIndicator(
                    modifier = Modifier.size(20.dp),
                    strokeWidth = 2.dp,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            } else {
                Icon(
                    imageVector = icon,
                    contentDescription = contentDescription,
                    tint = if (active) ZrpWhite else MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.size(IconSize.sm + 2.dp),
                )
            }
        }
    }
}

/**
 * A secondary composer control (attach "+", mic): a neutral icon in a
 * full [TouchTarget.min] hit area, so it never competes with the red
 * send button for attention.
 */
@Composable
fun ComposerIconButton(
    icon: ImageVector,
    contentDescription: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
) {
    IconButton(
        onClick = onClick,
        enabled = enabled,
        modifier = modifier.size(TouchTarget.min),
    ) {
        Icon(
            imageVector = icon,
            contentDescription = contentDescription,
            tint = MaterialTheme.colorScheme.onSurface,
            modifier = Modifier.size(IconSize.md),
        )
    }
}

/** One entry in [ComposerAttachmentSheet]. */
data class ComposerAttachmentOption(
    val icon: ImageVector,
    @StringRes val labelRes: Int,
    val onClick: () -> Unit,
)

/**
 * The composer's attachment picker: a bottom sheet of large, labelled
 * tiles (camera, gallery, GIF, video, document, ...) revealed by the
 * single "+" control in the composer row - the pattern mature
 * messengers use - instead of five or six always-visible icons that
 * left almost no room to type on a real phone.
 *
 * Tapping a tile closes the sheet and then runs the option's action,
 * so a picker/permission prompt never stacks on top of the sheet.
 * The sheet applies its own navigation-bar inset (ModalBottomSheet's
 * default window insets); callers must not add another one.
 */
@OptIn(ExperimentalMaterial3Api::class, ExperimentalLayoutApi::class)
@Composable
fun ComposerAttachmentSheet(
    options: List<ComposerAttachmentOption>,
    onDismiss: () -> Unit,
) {
    val sheetState = rememberModalBottomSheetState()
    ModalBottomSheet(
        onDismissRequest = onDismiss,
        sheetState = sheetState,
        containerColor = MaterialTheme.colorScheme.surfaceContainer,
    ) {
        Text(
            text = stringResource(R.string.message_add_attachment_cd),
            style = MaterialTheme.typography.titleMedium,
            modifier = Modifier.padding(horizontal = Spacing.xl, vertical = Spacing.sm),
        )
        FlowRow(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = Spacing.lg, vertical = Spacing.md),
            horizontalArrangement = Arrangement.spacedBy(Spacing.sm),
            verticalArrangement = Arrangement.spacedBy(Spacing.lg),
            maxItemsInEachRow = 4,
        ) {
            options.forEach { option ->
                val label = stringResource(option.labelRes)
                Column(
                    horizontalAlignment = Alignment.CenterHorizontally,
                    modifier = Modifier
                        .width(76.dp)
                        .clip(MaterialTheme.shapes.medium)
                        .clickable(role = Role.Button, onClickLabel = label) {
                            onDismiss()
                            option.onClick()
                        }
                        .padding(vertical = Spacing.sm),
                ) {
                    Box(
                        modifier = Modifier
                            .size(TouchTarget.comfortable)
                            .clip(CircleShape)
                            .background(MaterialTheme.colorScheme.surfaceContainerHighest),
                        contentAlignment = Alignment.Center,
                    ) {
                        Icon(
                            imageVector = option.icon,
                            contentDescription = null,
                            tint = MaterialTheme.colorScheme.onSurface,
                            modifier = Modifier.size(IconSize.md),
                        )
                    }
                    Text(
                        text = label,
                        style = MaterialTheme.typography.labelMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        textAlign = TextAlign.Center,
                        maxLines = 2,
                        overflow = TextOverflow.Ellipsis,
                        modifier = Modifier.padding(top = Spacing.xs),
                    )
                }
            }
        }
    }
}

/**
 * Copies [text] to the system clipboard and, on Android 12 and below
 * (where the OS shows no clipboard confirmation of its own), confirms
 * with a short toast. Android 13+ draws its own "Copied" overlay, so a
 * second toast there would just be noise.
 */
fun ClipboardManager.copyTextWithFeedback(context: Context, text: String) {
    setText(AnnotatedString(text))
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) {
        Toast.makeText(context, R.string.api_keys_copied, Toast.LENGTH_SHORT).show()
    }
}
