package one.zrp.social.mobile.ui.settings

import android.app.Activity
import androidx.compose.foundation.clickable
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.Check
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.unit.dp
import one.zrp.social.mobile.R
import one.zrp.social.mobile.data.ThemePreferenceStore
import one.zrp.social.mobile.ui.theme.resolveDarkTheme

/**
 * The native counterpart of the website's own Light/Dark switch (Header.tsx's
 * `toggleTheme` button - see ThemeContext.tsx). Deliberately the same
 * two-option shape as the website rather than a three-way Light/Dark/System
 * picker: the website itself has no explicit "System" choice either (no
 * saved preference just falls through to `prefers-color-scheme` - see
 * ThemeContext.tsx's own comment), so this mirrors that exactly rather than
 * inventing a native-only third state. "No stored preference yet" already
 * *is* that system-following behaviour: the checkmark below reflects
 * whichever mode is actually active (stored choice if one exists, else the
 * live system setting), not a separate "System" option - picking a row is
 * what makes the choice explicit and sticky from then on, exactly like the
 * website's own localStorage["theme"].
 *
 * Reuses the website's own nav.darkMode/nav.lightMode strings for the two
 * option labels - both already exist as real translations in all 15
 * languages for the equivalent toggle button, and read naturally as noun
 * phrases here too. "Appearance" (the row label in SettingsScreen and this
 * screen's own title) stays an English-only literal for the same reason
 * "Monetization" does there: no such settings-category string exists in the
 * website's own translation set to reuse, and inventing one is out of scope
 * for a native-only settings screen with no web equivalent page.
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
    val currentlyDark = resolveDarkTheme(storedPreference = store.get(), systemDark = systemDark)

    fun choose(isDark: Boolean) {
        store.set(isDark)
        (context as? Activity)?.recreate()
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
            // English-only literal, not a string resource - see this
            // file's own KDoc: no "Appearance" settings-category string
            // exists in the website's translation set to reuse, matching
            // SettingsScreen's own "Monetization" row for the same reason.
            Text(
                text = "Appearance",
                style = MaterialTheme.typography.titleMedium,
                modifier = Modifier.padding(start = 4.dp),
            )
        }
        HorizontalDivider()

        AppearanceOptionRow(
            label = stringResource(R.string.nav_light_mode),
            selected = !currentlyDark,
            onClick = { choose(false) },
        )
        AppearanceOptionRow(
            label = stringResource(R.string.nav_dark_mode),
            selected = currentlyDark,
            onClick = { choose(true) },
        )
    }
}

@Composable
private fun AppearanceOptionRow(label: String, selected: Boolean, onClick: () -> Unit) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onClick, role = Role.Button)
            .padding(horizontal = 16.dp, vertical = 14.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(
            text = label,
            style = MaterialTheme.typography.bodyLarge,
            modifier = Modifier.weight(1f),
        )
        if (selected) {
            Icon(
                imageVector = Icons.Filled.Check,
                contentDescription = null,
                tint = MaterialTheme.colorScheme.primary,
                modifier = Modifier.padding(start = 8.dp),
            )
        }
    }
}
