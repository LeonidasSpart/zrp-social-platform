package one.zrp.social.mobile.ui.settings

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.AccountCircle
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.ChevronRight
import androidx.compose.material.icons.filled.CreditCard
import androidx.compose.material.icons.filled.Language
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material.icons.filled.Newspaper
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.SupportAgent
import androidx.compose.material.icons.filled.Shield
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import one.zrp.social.mobile.R
import one.zrp.social.mobile.ui.theme.Spacing

/**
 * Settings hub - a from-scratch native surface, the mobile drill-down
 * equivalent of the website's sidebar/chip category switcher
 * (src/app/settings/page.tsx's CATEGORIES). Rather than copying that
 * in-page tab switching, each category here pushes its own screen -
 * the native pattern this kind of settings list actually uses on
 * Android/iOS.
 *
 * Only categories this slice genuinely backs with real native screens
 * are listed - Notifications (email preferences) is a real web feature
 * left for a later slice rather than linked to a screen that doesn't
 * exist yet. See SettingsRepository's KDoc for the full breakdown.
 *
 * Support routes to SupportTicketsScreen (the caller's own ticket
 * list, itself linking to the create-ticket form) - labeled with the
 * real translated support_tickets_page_title ("My Support Tickets")
 * rather than a shorter invented label, since no shorter real
 * translated nav string exists for this feature on the website either.
 *
 * Monetization routes to CreatorScreen (the native Creator Studio) -
 * NOT payment-restricted itself, despite the name: only tip-sending
 * and premium-post purchasing are (see CreatorApi's own KDoc), and
 * neither of those lives on this screen at all. "Monetization" stays
 * an untranslated literal here for the same reason Account and
 * Security do below - the website's own CATEGORIES array hardcodes
 * that exact label untranslated too.
 *
 * Journalist routes to JournalistDashboardScreen - the same real
 * /journalist page the website reaches from two separate places (a
 * Sidebar link shown only once already a journalist, and a footer
 * link to apply otherwise), both landing on the exact same page and
 * its own internal status branching. One entry point here is
 * functionally equivalent regardless of the viewer's current
 * status. Unlike "Monetization", this label uses the website's own
 * real translated "nav.journalist" string (nav_journalist) rather
 * than an untranslated literal.
 *
 * Every label here is a string resource with real translations for
 * all 11 official ZRP languages (extracted from the website's own
 * src/lib/translations.ts) - see the per-language values directories
 * under res/. Account and Security stay English-only because the
 * website's own CATEGORIES array hardcodes those same two labels
 * untranslated too (see values/strings.xml's comment) - not a native
 * shortfall.
 */
@Composable
fun SettingsScreen(
    onBack: () -> Unit,
    onOpenAccount: () -> Unit,
    onOpenProfile: () -> Unit,
    onOpenSecurity: () -> Unit,
    onOpenPrivacy: () -> Unit,
    onOpenLanguage: () -> Unit,
    onOpenCreator: () -> Unit,
    onOpenJournalist: () -> Unit,
    onOpenSupport: () -> Unit,
) {
    Column(modifier = Modifier.fillMaxSize()) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 8.dp, vertical = 4.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            IconButton(onClick = onBack) {
                Icon(Icons.Filled.ArrowBack, contentDescription = "Back")
            }
            Text(
                text = stringResource(R.string.settings_title),
                style = MaterialTheme.typography.titleMedium,
                modifier = Modifier.padding(start = 4.dp),
            )
        }
        HorizontalDivider()

        SettingsRow(icon = Icons.Filled.AccountCircle, label = stringResource(R.string.settings_account), onClick = onOpenAccount)
        SettingsRow(icon = Icons.Filled.Person, label = stringResource(R.string.settings_profile_category), onClick = onOpenProfile)
        SettingsRow(icon = Icons.Filled.Lock, label = stringResource(R.string.settings_security), onClick = onOpenSecurity)
        SettingsRow(icon = Icons.Filled.Shield, label = stringResource(R.string.settings_privacy_safety), onClick = onOpenPrivacy)
        SettingsRow(icon = Icons.Filled.Language, label = stringResource(R.string.nav_language), onClick = onOpenLanguage)
        // "Monetization" stays English-only - see this file's own KDoc.
        SettingsRow(icon = Icons.Filled.CreditCard, label = "Monetization", onClick = onOpenCreator)
        SettingsRow(icon = Icons.Filled.Newspaper, label = stringResource(R.string.nav_journalist), onClick = onOpenJournalist)
        SettingsRow(icon = Icons.Filled.SupportAgent, label = stringResource(R.string.support_tickets_page_title), onClick = onOpenSupport)
    }
}

@Composable
private fun SettingsRow(
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    label: String,
    onClick: () -> Unit,
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onClick)
            .padding(horizontal = Spacing.lg, vertical = Spacing.md),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(
            imageVector = icon,
            contentDescription = null,
            modifier = Modifier.size(22.dp),
            tint = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Text(
            text = label,
            style = MaterialTheme.typography.bodyLarge,
            modifier = Modifier
                .weight(1f)
                .padding(start = Spacing.md),
        )
        Icon(
            imageVector = Icons.Filled.ChevronRight,
            contentDescription = null,
            tint = MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
}
