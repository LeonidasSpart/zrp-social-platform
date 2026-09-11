package one.zrp.social.mobile.ui.settings

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.AccountCircle
import androidx.compose.material.icons.filled.AdminPanelSettings
import androidx.compose.material.icons.filled.Article
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.ChevronRight
import androidx.compose.material.icons.filled.CreditCard
import androidx.compose.material.icons.filled.Email
import androidx.compose.material.icons.filled.Gavel
import androidx.compose.material.icons.filled.HelpOutline
import androidx.compose.material.icons.filled.Info
import androidx.compose.material.icons.filled.Key
import androidx.compose.material.icons.filled.Groups
import androidx.compose.material.icons.filled.Language
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material.icons.filled.Newspaper
import androidx.compose.material.icons.filled.Notifications
import androidx.compose.material.icons.filled.People
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.PrivacyTip
import androidx.compose.material.icons.filled.Policy
import androidx.compose.material.icons.filled.Public
import androidx.compose.material.icons.filled.BarChart
import androidx.compose.material.icons.filled.QuestionAnswer
import androidx.compose.material.icons.filled.RequestQuote
import androidx.compose.material.icons.filled.SupportAgent
import androidx.compose.material.icons.filled.Shield
import androidx.compose.material.icons.filled.VolunteerActivism
import androidx.compose.material.icons.filled.Work
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
 * are listed. See SettingsRepository's KDoc for the full breakdown of
 * what's covered vs. still deferred.
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
 * Team Management routes to TeamScreen - unlike web, which hides its
 * Sidebar link entirely for a non-Business/Enterprise account
 * (features?.teamManagement), this row is always shown; TeamScreen
 * itself carries the real GET /api/team 403 into a dedicated "why"
 * body, the same shape CreatorScreen's own ineligible state already
 * uses. Uses the website's own real translated "nav.teamManagement"
 * string (nav_team_management) for its label.
 *
 * API Keys routes to ApiKeysScreen - the same always-shown-row,
 * screen-gates-itself shape as Team Management above, for the same
 * real reason (web hides its own Sidebar link for a non-Business/
 * Enterprise account via features?.apiAccess; this row doesn't).
 *
 * Admin routes to AdminDashboardScreen (the native surface onto
 * /admin) - only rendered when isStaff is true (the caller's role is
 * ADMIN or MODERATOR, resolved from the real signed-in session; see
 * ZrpNavHost's own isStaff). A normal user never sees this row at all,
 * matching the master directive's "normal users must NOT see admin
 * controls" - though every admin API call is still independently
 * enforced server-side (requireStaff/requireAdmin) regardless of what
 * this client shows, so that check is the actual authorization
 * boundary, not this one.
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
    onOpenNotifications: () -> Unit,
    onOpenCreator: () -> Unit,
    onOpenJournalist: () -> Unit,
    onOpenTeam: () -> Unit,
    onOpenApiKeys: () -> Unit,
    onOpenSupport: () -> Unit,
    onOpenTerms: () -> Unit,
    onOpenPrivacyPolicy: () -> Unit,
    onOpenGuidelines: () -> Unit,
    onOpenHelp: () -> Unit,
    onOpenContact: () -> Unit,
    onOpenAbout: () -> Unit,
    onOpenCareers: () -> Unit,
    onOpenCharity: () -> Unit,
    onOpenPress: () -> Unit,
    onOpenInvestors: () -> Unit,
    onOpenTransparency: () -> Unit,
    onOpenAmbassadors: () -> Unit,
    onOpenFaq: () -> Unit,
    onOpenCommunityCode: () -> Unit,
    isStaff: Boolean = false,
    onOpenAdmin: () -> Unit = {},
) {
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
                text = stringResource(R.string.settings_title),
                style = MaterialTheme.typography.titleMedium,
                modifier = Modifier.padding(start = 4.dp),
            )
        }
        HorizontalDivider()

        // Real bug, confirmed on a physical device: this list is 12 rows
        // plus a Legal section header plus 5 more Legal rows (17+ rows
        // total, more still for staff), rendered inside the app's
        // persistent bottom-nav Scaffold - on real screen heights that
        // overflows the visible viewport. Without a scroll container here,
        // Compose lays the overflow out below the visible bounds with no
        // way to reach it - not a rendering glitch, the rows past Terms of
        // Service (Privacy Policy, Guidelines, Help, Contact, Admin for
        // staff) were genuinely unreachable, not just visually cut off.
        Column(modifier = Modifier.verticalScroll(rememberScrollState())) {
            SettingsRow(icon = Icons.Filled.AccountCircle, label = stringResource(R.string.settings_account), onClick = onOpenAccount)
            SettingsRow(icon = Icons.Filled.Person, label = stringResource(R.string.settings_profile_category), onClick = onOpenProfile)
            SettingsRow(icon = Icons.Filled.Lock, label = stringResource(R.string.settings_security), onClick = onOpenSecurity)
            SettingsRow(icon = Icons.Filled.Shield, label = stringResource(R.string.settings_privacy_safety), onClick = onOpenPrivacy)
            SettingsRow(icon = Icons.Filled.Language, label = stringResource(R.string.nav_language), onClick = onOpenLanguage)
            SettingsRow(icon = Icons.Filled.Notifications, label = stringResource(R.string.nav_notifications), onClick = onOpenNotifications)
            // "Monetization" stays English-only - see this file's own KDoc.
            SettingsRow(icon = Icons.Filled.CreditCard, label = "Monetization", onClick = onOpenCreator)
            SettingsRow(icon = Icons.Filled.Newspaper, label = stringResource(R.string.nav_journalist), onClick = onOpenJournalist)
            SettingsRow(icon = Icons.Filled.People, label = stringResource(R.string.nav_team_management), onClick = onOpenTeam)
            SettingsRow(icon = Icons.Filled.Key, label = stringResource(R.string.nav_api_keys), onClick = onOpenApiKeys)
            SettingsRow(icon = Icons.Filled.SupportAgent, label = stringResource(R.string.support_tickets_page_title), onClick = onOpenSupport)

            SettingsGroupHeading(stringResource(R.string.settings_group_company))
            SettingsRow(icon = Icons.Filled.Info, label = stringResource(R.string.legal_about), onClick = onOpenAbout)
            SettingsRow(icon = Icons.Filled.Work, label = stringResource(R.string.legal_careers), onClick = onOpenCareers)
            SettingsRow(icon = Icons.Filled.VolunteerActivism, label = stringResource(R.string.legal_charity), onClick = onOpenCharity)
            SettingsRow(icon = Icons.Filled.BarChart, label = stringResource(R.string.transparency_title), onClick = onOpenTransparency)
            SettingsRow(icon = Icons.Filled.Public, label = stringResource(R.string.ambassadors_nav_label), onClick = onOpenAmbassadors)
            SettingsRow(icon = Icons.Filled.Article, label = stringResource(R.string.legal_press), onClick = onOpenPress)
            SettingsRow(icon = Icons.Filled.RequestQuote, label = stringResource(R.string.legal_investors), onClick = onOpenInvestors)

            SettingsGroupHeading(stringResource(R.string.settings_group_support))
            SettingsRow(icon = Icons.Filled.HelpOutline, label = stringResource(R.string.legal_help), onClick = onOpenHelp)
            SettingsRow(icon = Icons.Filled.QuestionAnswer, label = stringResource(R.string.legal_faq), onClick = onOpenFaq)
            SettingsRow(icon = Icons.Filled.Email, label = stringResource(R.string.legal_contact), onClick = onOpenContact)

            SettingsGroupHeading(stringResource(R.string.settings_group_legal))
            SettingsRow(icon = Icons.Filled.Gavel, label = stringResource(R.string.legal_terms), onClick = onOpenTerms)
            SettingsRow(icon = Icons.Filled.PrivacyTip, label = stringResource(R.string.legal_privacy), onClick = onOpenPrivacyPolicy)
            SettingsRow(icon = Icons.Filled.Groups, label = stringResource(R.string.legal_guidelines), onClick = onOpenGuidelines)
            SettingsRow(icon = Icons.Filled.Policy, label = stringResource(R.string.legal_community_code), onClick = onOpenCommunityCode)

            if (isStaff) {
                SettingsRow(icon = Icons.Filled.AdminPanelSettings, label = stringResource(R.string.admin_nav_label), onClick = onOpenAdmin)
            }

            // Trailing space so the last row isn't flush against the
            // bottom-nav Scaffold's own edge once scrolled all the way
            // down - same bottom-content-padding fix already applied to
            // Home's and Profile's feed lists this session.
            Spacer(modifier = Modifier.height(Spacing.xxl))
        }
    }
}

@Composable
private fun SettingsGroupHeading(text: String) {
    Text(
        text = text,
        style = MaterialTheme.typography.labelMedium,
        color = MaterialTheme.colorScheme.onSurfaceVariant,
        modifier = Modifier.padding(start = Spacing.lg, top = Spacing.lg, bottom = Spacing.xs),
    )
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
