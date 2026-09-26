package one.zrp.social.mobile.ui.settings

import android.app.Activity
import androidx.appcompat.app.AppCompatDelegate
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.selection.selectableGroup
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Check
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.unit.dp
import androidx.core.os.LocaleListCompat
import one.zrp.social.mobile.R
import one.zrp.social.mobile.ui.theme.Spacing
import one.zrp.social.mobile.ui.theme.TouchTarget
import java.util.Locale

/**
 * The native equivalent of the website's language switcher (Header.tsx/
 * Sidebar.tsx's "nav.language" menu) - the same 29 official ZRP
 * languages, backed by AppCompatDelegate's per-app language API rather
 * than a custom locale-storage mechanism. Unlike the website (which
 * persists the choice in a "zrp-lang" cookie scoped to that one
 * browser), there's no backend field for this - language is a
 * per-device preference on web too, so a per-device native preference
 * is genuine parity, not a shortfall.
 */
@Composable
fun LanguageSettingsScreen(onBack: () -> Unit) {
    val context = LocalContext.current
    // No per-app locale stored yet means the app is following the device
    // language: resolve that to its language code so the row that is
    // actually in effect carries the checkmark instead of none at all.
    // "pt-BR"/"zh-CN"-style device tags fall back to their base language,
    // the only variant these resources ship.
    var currentTag by remember {
        mutableStateOf(
            AppCompatDelegate.getApplicationLocales().toLanguageTags().substringBefore(",")
                .ifBlank { Locale.getDefault().toLanguageTag() }
                .substringBefore("-"),
        )
    }

    Column(modifier = Modifier.fillMaxSize()) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = Spacing.sm, vertical = Spacing.xs),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            IconButton(onClick = onBack, modifier = Modifier.size(TouchTarget.min)) {
                Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = stringResource(R.string.nav_back))
            }
            Text(
                text = stringResource(R.string.nav_language),
                style = MaterialTheme.typography.titleMedium,
                modifier = Modifier.padding(start = Spacing.xs),
            )
        }
        HorizontalDivider()

        // A LazyColumn filling the remaining height (bounded by this
        // Column, itself inside the Scaffold's innerPadding) so all 29
        // rows scroll on any screen height; each row is one selectable
        // radio-style item so TalkBack announces "selected" rather than
        // relying on the checkmark glyph alone.
        LazyColumn(modifier = Modifier.fillMaxSize().selectableGroup()) {
            items(SUPPORTED_LANGUAGES, key = { it.code }) { lang ->
                val selected = lang.code == currentTag
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .heightIn(min = TouchTarget.min)
                        .selectable(
                            selected = selected,
                            role = Role.RadioButton,
                            onClick = {
                                AppCompatDelegate.setApplicationLocales(LocaleListCompat.forLanguageTags(lang.code))
                                currentTag = lang.code
                                // Applies immediately, app-wide (RTL layout
                                // direction included for Arabic): the
                                // Activity is recreated with the new
                                // locale's resources - no restart needed.
                                (context as? Activity)?.recreate()
                            },
                        )
                        .padding(horizontal = Spacing.lg, vertical = Spacing.md),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text(
                        text = lang.label,
                        style = MaterialTheme.typography.bodyLarge,
                        modifier = Modifier.weight(1f),
                    )
                    if (selected) {
                        Icon(
                            imageVector = Icons.Filled.Check,
                            contentDescription = null,
                            tint = MaterialTheme.colorScheme.primary,
                            modifier = Modifier.size(20.dp),
                        )
                    }
                }
            }
        }
    }
}
