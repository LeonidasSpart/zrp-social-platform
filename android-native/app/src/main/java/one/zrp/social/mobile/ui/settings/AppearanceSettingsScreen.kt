package one.zrp.social.mobile.ui.settings

import android.app.Activity
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.selection.selectableGroup
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.RadioButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import one.zrp.social.mobile.R
import one.zrp.social.mobile.data.ThemePreferenceStore
import one.zrp.social.mobile.ui.theme.Spacing
import one.zrp.social.mobile.ui.theme.TouchTarget

/**
 * The native counterpart of the website's own Light/Dark switch (Header.tsx's
 * `toggleTheme` button - see ThemeContext.tsx), as the three-way picker
 * Android users expect from a native app: System, Light, Dark.
 *
 * "System" is ThemePreferenceStore's null (no stored preference) state -
 * the exact same "follow the device" behaviour the app already had on
 * first launch and the website's own no-saved-preference branch. It
 * used to be unreachable once a manual choice had been made: the screen
 * offered only Light and Dark, so after one tap the app could never go
 * back to tracking the device's Light/Dark switch live. It is now an
 * explicit, selectable row.
 *
 * Reuses the website's own nav.darkMode/nav.lightMode strings for the two
 * manual option labels - both already exist as real translations for the
 * equivalent toggle button, and read naturally as noun phrases here too.
 *
 * Applies the choice via `Activity.recreate()`, the exact same
 * apply-immediately mechanism LanguageSettingsScreen already uses for its
 * own app-wide per-app-language switch - MainActivity re-reads
 * ThemePreferenceStore fresh on every Composition (see its own comment), so
 * the new choice takes effect the moment this recreates.
 */
@Composable
fun AppearanceSettingsScreen(onBack: () -> Unit) {
    val context = LocalContext.current
    val store = remember { ThemePreferenceStore(context) }
    val systemDark = isSystemInDarkTheme()
    val stored = store.get()

    fun choose(isDark: Boolean?) {
        if (isDark == null) store.clear() else store.set(isDark)
        (context as? Activity)?.recreate()
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
                text = stringResource(R.string.settings_appearance_title),
                style = MaterialTheme.typography.titleMedium,
                modifier = Modifier.padding(start = Spacing.xs),
            )
        }
        HorizontalDivider()

        Column(modifier = Modifier.selectableGroup()) {
            AppearanceOptionRow(
                label = stringResource(R.string.settings_theme_system),
                // The live device setting, so the row tells the truth about
                // what "System" resolves to right now.
                supporting = stringResource(if (systemDark) R.string.nav_dark_mode else R.string.nav_light_mode),
                selected = stored == null,
                onClick = { choose(null) },
            )
            AppearanceOptionRow(
                label = stringResource(R.string.nav_light_mode),
                supporting = null,
                selected = stored == false,
                onClick = { choose(false) },
            )
            AppearanceOptionRow(
                label = stringResource(R.string.nav_dark_mode),
                supporting = null,
                selected = stored == true,
                onClick = { choose(true) },
            )
        }
    }
}

@Composable
private fun AppearanceOptionRow(label: String, supporting: String?, selected: Boolean, onClick: () -> Unit) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .heightIn(min = TouchTarget.comfortable)
            .selectable(selected = selected, onClick = onClick, role = Role.RadioButton)
            .padding(horizontal = Spacing.lg, vertical = Spacing.md),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        // The row itself carries the selectable semantics; the radio is
        // purely the visual state, so TalkBack announces one control.
        RadioButton(selected = selected, onClick = null)
        Column(modifier = Modifier.weight(1f).padding(start = Spacing.md)) {
            Text(text = label, style = MaterialTheme.typography.bodyLarge)
            if (supporting != null) {
                Text(
                    text = supporting,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
    }
}
