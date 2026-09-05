package one.zrp.social.mobile.ui.navigation

import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.AddCircle
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.filled.MailOutline
import androidx.compose.material.icons.filled.Notifications
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.Search
import androidx.compose.ui.graphics.vector.ImageVector

/**
 * The six bottom-navigation destinations for the ZRP mobile app -
 * deliberately not a copy of the website's header/sidebar nav (which
 * also lists Explore, News, Marketplace, Music, Play, Opportunity,
 * Aid, Bookmarks as top-level items). A phone's bottom bar only has
 * room for the core social loop; everything else becomes reachable
 * from within these screens as the later phases build them out,
 * exactly as X/Instagram surface search/discovery inside "Search"
 * rather than as separate bottom-nav tabs.
 */
enum class ZrpDestination(val route: String, val label: String, val icon: ImageVector) {
    Home("home", "Home", Icons.Filled.Home),
    Search("search", "Search", Icons.Filled.Search),
    Create("create", "Post", Icons.Filled.AddCircle),
    Notifications("notifications", "Notifications", Icons.Filled.Notifications),
    Messages("messages", "Messages", Icons.Filled.MailOutline),
    Profile("profile", "Profile", Icons.Filled.Person),
}
