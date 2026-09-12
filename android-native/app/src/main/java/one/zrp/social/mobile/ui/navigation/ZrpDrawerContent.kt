package one.zrp.social.mobile.ui.navigation

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.AdminPanelSettings
import androidx.compose.material.icons.filled.Article
import androidx.compose.material.icons.filled.AutoAwesome
import androidx.compose.material.icons.filled.BookmarkBorder
import androidx.compose.material.icons.filled.Explore
import androidx.compose.material.icons.filled.Groups
import androidx.compose.material.icons.filled.HelpOutline
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.filled.Logout
import androidx.compose.material.icons.filled.MailOutline
import androidx.compose.material.icons.filled.MusicNote
import androidx.compose.material.icons.filled.Newspaper
import androidx.compose.material.icons.filled.Notifications
import androidx.compose.material.icons.filled.Public
import androidx.compose.material.icons.filled.RocketLaunch
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material.icons.filled.SportsEsports
import androidx.compose.material.icons.filled.Store
import androidx.compose.material.icons.filled.VideoLibrary
import androidx.compose.material.icons.filled.VolunteerActivism
import androidx.compose.material.icons.filled.Work
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalDrawerSheet
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import one.zrp.social.mobile.R
import one.zrp.social.mobile.network.MobileUser
import one.zrp.social.mobile.ui.components.Avatar
import one.zrp.social.mobile.ui.components.VerifiedBadge
import one.zrp.social.mobile.ui.theme.IconSize
import one.zrp.social.mobile.ui.theme.Spacing
import one.zrp.social.mobile.ui.theme.TouchTarget
import one.zrp.social.mobile.ui.theme.ZrpRed

/**
 * The left drawer's navigation targets, grouped exactly like the bottom
 * bar's own goTo* lambdas in ZrpNavHost - reusing those same lambdas
 * (not raw route strings) so a drawer tap and a deep link/other call
 * site can never disagree about how to reach a screen.
 */
data class ZrpDrawerActions(
    val goHome: () -> Unit,
    val goExplore: () -> Unit,
    val goNotifications: () -> Unit,
    val goMessages: () -> Unit,
    val goCommunities: () -> Unit,
    val goPlay: () -> Unit,
    val goNews: () -> Unit,
    val goShorts: () -> Unit,
    val goMusic: () -> Unit,
    val goMarketplace: () -> Unit,
    val goOpportunity: () -> Unit,
    val goAid: () -> Unit,
    val goAmbassadors: () -> Unit,
    val goAi: () -> Unit,
    val goCreatorStudio: () -> Unit,
    val goJournalist: () -> Unit,
    val goAdmin: () -> Unit,
    val goBookmarks: () -> Unit,
    val goSettings: () -> Unit,
    val goHelpCenter: () -> Unit,
    val goOwnProfile: () -> Unit,
    val onSignOut: () -> Unit,
)

private data class DrawerRow(
    val icon: ImageVector,
    val labelRes: Int,
    val badgeCount: Int = 0,
    val onClick: () -> Unit,
)

/**
 * The left-side navigation drawer - the secondary layer for everything
 * that doesn't fit the five-item bottom bar. Grouped into small labeled
 * sections rather than one flat 15-20-row list, per the senior-friendly
 * requirement: a reader can tell at a glance which of five short
 * clusters holds what they want, instead of scanning a long undivided
 * column. Every row is icon + text (never icon-only - several of these
 * destinations, like "Aid" or "Opportunity", have no universally obvious
 * glyph) and sized to at least TouchTarget.comfortable.
 *
 * Row content only - callers (ModalNavigationDrawer in ZrpNavHost) own
 * closing the drawer after a tap, since that's shared UI-state the
 * drawer's own content shouldn't need to know about.
 */
@Composable
fun ZrpDrawerContent(
    currentUser: MobileUser?,
    unreadNotifications: Int,
    unreadMessages: Int,
    actions: ZrpDrawerActions,
    onItemSelected: () -> Unit,
) {
    val isStaff = currentUser?.role == "ADMIN" || currentUser?.role == "MODERATOR"
    val isJournalist = currentUser?.role == "JOURNALIST"

    fun select(action: () -> Unit): () -> Unit = {
        action()
        onItemSelected()
    }

    ModalDrawerSheet(
        drawerContainerColor = MaterialTheme.colorScheme.surface,
        modifier = Modifier.width(300.dp),
    ) {
        Column(Modifier.verticalScroll(rememberScrollState())) {
            DrawerUserHeader(currentUser, onClick = select(actions.goOwnProfile))

            DrawerSection(
                titleRes = R.string.drawer_section_core,
                rows = listOf(
                    DrawerRow(Icons.Filled.Home, R.string.nav_home, onClick = select(actions.goHome)),
                    DrawerRow(Icons.Filled.Explore, R.string.nav_explore, onClick = select(actions.goExplore)),
                    DrawerRow(
                        Icons.Filled.Notifications,
                        R.string.nav_notifications,
                        badgeCount = unreadNotifications,
                        onClick = select(actions.goNotifications),
                    ),
                    DrawerRow(
                        Icons.Filled.MailOutline,
                        R.string.nav_messages,
                        badgeCount = unreadMessages,
                        onClick = select(actions.goMessages),
                    ),
                ),
            )

            DrawerSection(
                titleRes = R.string.drawer_section_discover,
                rows = listOf(
                    DrawerRow(Icons.Filled.Groups, R.string.nav_communities, onClick = select(actions.goCommunities)),
                    DrawerRow(Icons.Filled.SportsEsports, R.string.nav_play, onClick = select(actions.goPlay)),
                    DrawerRow(Icons.Filled.Newspaper, R.string.nav_news, onClick = select(actions.goNews)),
                    DrawerRow(Icons.Filled.VideoLibrary, R.string.nav_shorts, onClick = select(actions.goShorts)),
                    DrawerRow(Icons.Filled.MusicNote, R.string.nav_music, onClick = select(actions.goMusic)),
                ),
            )

            DrawerSection(
                titleRes = R.string.drawer_section_services,
                rows = listOf(
                    DrawerRow(Icons.Filled.Store, R.string.nav_marketplace, onClick = select(actions.goMarketplace)),
                    DrawerRow(Icons.Filled.Work, R.string.nav_opportunity, onClick = select(actions.goOpportunity)),
                    DrawerRow(Icons.Filled.VolunteerActivism, R.string.nav_aid, onClick = select(actions.goAid)),
                    DrawerRow(Icons.Filled.Public, R.string.nav_ambassadors, onClick = select(actions.goAmbassadors)),
                ),
            )

            val toolsRows = buildList {
                add(DrawerRow(Icons.Filled.AutoAwesome, R.string.nav_ai, onClick = select(actions.goAi)))
                add(DrawerRow(Icons.Filled.RocketLaunch, R.string.nav_creator_studio, onClick = select(actions.goCreatorStudio)))
                if (isJournalist) {
                    add(DrawerRow(Icons.Filled.Article, R.string.nav_journalist, onClick = select(actions.goJournalist)))
                }
                if (isStaff) {
                    add(DrawerRow(Icons.Filled.AdminPanelSettings, R.string.nav_admin, onClick = select(actions.goAdmin)))
                }
            }
            DrawerSection(titleRes = R.string.drawer_section_creator_tools, rows = toolsRows)

            DrawerSection(
                titleRes = R.string.drawer_section_account,
                rows = listOf(
                    DrawerRow(Icons.Filled.BookmarkBorder, R.string.nav_bookmarks, onClick = select(actions.goBookmarks)),
                    DrawerRow(Icons.Filled.Settings, R.string.settings_title, onClick = select(actions.goSettings)),
                    DrawerRow(Icons.Filled.HelpOutline, R.string.nav_help_center, onClick = select(actions.goHelpCenter)),
                ),
                showDivider = false,
            )

            HorizontalDivider(modifier = Modifier.padding(vertical = Spacing.sm))

            DrawerItemRow(
                row = DrawerRow(Icons.Filled.Logout, R.string.nav_sign_out, onClick = actions.onSignOut),
                tint = MaterialTheme.colorScheme.error,
            )

            Spacer(Modifier.height(Spacing.lg))
        }
    }
}

@Composable
private fun DrawerUserHeader(currentUser: MobileUser?, onClick: () -> Unit) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onClick)
            .padding(horizontal = Spacing.lg, vertical = Spacing.lg),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Avatar(
            url = currentUser?.avatarUrl,
            name = currentUser?.name ?: currentUser?.username ?: "?",
            size = 52.dp,
        )
        Spacer(Modifier.width(Spacing.md))
        Column(Modifier.weight(1f)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(
                    text = currentUser?.name ?: currentUser?.username.orEmpty(),
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.Bold,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
                VerifiedBadge(badgeType = currentUser?.badgeType)
            }
            Text(
                text = "@${currentUser?.username.orEmpty()}",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
        }
    }
    HorizontalDivider()
}

@Composable
private fun DrawerSection(
    titleRes: Int,
    rows: List<DrawerRow>,
    showDivider: Boolean = true,
) {
    if (rows.isEmpty()) return

    Text(
        text = stringResource(titleRes),
        style = MaterialTheme.typography.labelMedium,
        color = ZrpRed,
        fontWeight = FontWeight.Bold,
        modifier = Modifier.padding(start = Spacing.lg, top = Spacing.lg, bottom = Spacing.xs),
    )
    rows.forEach { row -> DrawerItemRow(row) }
    if (showDivider) {
        HorizontalDivider(modifier = Modifier.padding(top = Spacing.sm))
    }
}

@Composable
private fun DrawerItemRow(
    row: DrawerRow,
    tint: Color = MaterialTheme.colorScheme.onSurface,
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .heightIn(min = TouchTarget.comfortable)
            .clickable(onClick = row.onClick)
            .padding(horizontal = Spacing.lg),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(
            imageVector = row.icon,
            contentDescription = null,
            tint = tint,
            modifier = Modifier.size(IconSize.md),
        )
        Spacer(Modifier.width(Spacing.lg))
        Text(
            text = stringResource(row.labelRes),
            style = MaterialTheme.typography.labelLarge,
            color = tint,
            modifier = Modifier.weight(1f),
        )
        if (row.badgeCount > 0) {
            Box(
                modifier = Modifier
                    .background(ZrpRed, CircleShape)
                    .padding(horizontal = Spacing.sm, vertical = 2.dp),
            ) {
                Text(
                    text = if (row.badgeCount > 99) "99+" else row.badgeCount.toString(),
                    style = MaterialTheme.typography.labelSmall,
                    color = Color.White,
                    fontWeight = FontWeight.Bold,
                )
            }
        }
    }
}
