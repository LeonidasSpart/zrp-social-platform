package one.zrp.social.mobile.ui.settings

import android.app.Activity
import androidx.appcompat.app.AppCompatDelegate
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
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
import androidx.compose.ui.unit.dp
import androidx.core.os.LocaleListCompat
import one.zrp.social.mobile.R

/**
 * The native equivalent of the website's language switcher (Header.tsx/
 * Sidebar.tsx's "nav.language" menu) - the same 15 official ZRP
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
    var currentTag by remember {
        mutableStateOf(AppCompatDelegate.getApplicationLocales().toLanguageTags().substringBefore(","))
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
            Text(
                text = stringResource(R.string.nav_language),
                style = MaterialTheme.typography.titleMedium,
                modifier = Modifier.padding(start = 4.dp),
            )
        }
        HorizontalDivider()

        LazyColumn(modifier = Modifier.fillMaxSize()) {
            items(SUPPORTED_LANGUAGES, key = { it.code }) { lang ->
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .clickable {
                            AppCompatDelegate.setApplicationLocales(LocaleListCompat.forLanguageTags(lang.code))
                            currentTag = lang.code
                            (context as? Activity)?.recreate()
                        }
                        .padding(horizontal = 16.dp, vertical = 14.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text(
                        text = lang.label,
                        style = MaterialTheme.typography.bodyLarge,
                        modifier = Modifier.weight(1f),
                    )
                    if (lang.code == currentTag) {
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
