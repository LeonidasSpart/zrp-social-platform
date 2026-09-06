package one.zrp.social.mobile.ui.navigation

import androidx.compose.animation.core.Spring
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.spring
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.NavigationBarItemDefaults
import androidx.compose.material3.Scaffold
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.scale
import androidx.navigation.NavDestination.Companion.hierarchy
import androidx.navigation.NavGraph.Companion.findStartDestination
import androidx.navigation.NavType
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.rememberNavController
import androidx.navigation.compose.composable
import androidx.navigation.navArgument
import androidx.navigation.navDeepLink
import one.zrp.social.mobile.ui.bookmarks.BookmarksScreen
import one.zrp.social.mobile.ui.comments.CommentsScreen
import one.zrp.social.mobile.ui.create.CreatePostScreen
import one.zrp.social.mobile.ui.followlist.FollowListMode
import one.zrp.social.mobile.ui.followlist.FollowListScreen
import one.zrp.social.mobile.ui.home.HomeScreen
import one.zrp.social.mobile.ui.messages.ConversationScreen
import one.zrp.social.mobile.ui.messages.MessagesScreen
import one.zrp.social.mobile.ui.moderation.ModerationListMode
import one.zrp.social.mobile.ui.moderation.ModerationListScreen
import one.zrp.social.mobile.ui.music.MusicScreen
import one.zrp.social.mobile.ui.notifications.NotificationsScreen
import one.zrp.social.mobile.ui.profile.ProfileScreen
import one.zrp.social.mobile.ui.search.SearchScreen
import one.zrp.social.mobile.ui.stories.CreateStoryScreen
import one.zrp.social.mobile.ui.stories.StoryViewerScreen
import one.zrp.social.mobile.ui.theme.ZrpRed

/**
 * Real zrp.one URLs (see the deepLinks on the routes below and
 * AndroidManifest.xml's matching intent-filter) open directly into the
 * matching native screen when this NavHost is already in composition -
 * i.e. the app is already signed in and running. A link arriving
 * before login completes isn't preserved past the login screen yet
 * (MainActivity only creates this NavHost once AuthUiState is
 * LoggedIn); handling that needs holding the pending destination
 * across the auth gate, a distinctly separate piece of work from the
 * routes themselves.
 */
@Composable
fun ZrpNavHost(onLogout: () -> Unit) {
    val navController = rememberNavController()
    val goToProfile: (String) -> Unit = { username -> navController.navigate("profile/$username") }
    val goToConversation: (partnerId: String, partnerUsername: String) -> Unit = { partnerId, partnerUsername ->
        navController.navigate("messages/$partnerId/$partnerUsername")
    }
    val goToComments: (String) -> Unit = { postId -> navController.navigate("post/$postId/comments") }
    val goToStoryViewer: (String) -> Unit = { userId -> navController.navigate("stories/$userId") }
    val goToCreateStory: () -> Unit = { navController.navigate("create-story") }
    val goToMusic: () -> Unit = { navController.navigate("music") }
    val goToBookmarks: () -> Unit = { navController.navigate("bookmarks") }
    val goToFollowers: (String) -> Unit = { username -> navController.navigate("profile/$username/followers") }
    val goToFollowing: (String) -> Unit = { username -> navController.navigate("profile/$username/following") }
    val goToBlockedUsers: () -> Unit = { navController.navigate("blocked-users") }
    val goToMutedUsers: () -> Unit = { navController.navigate("muted-users") }
    val goHome: () -> Unit = {
        navController.navigate(ZrpDestination.Home.route) {
            popUpTo(navController.graph.findStartDestination().id) { saveState = true }
            launchSingleTop = true
            restoreState = true
        }
    }

    Scaffold(
        bottomBar = { ZrpBottomBar(navController) },
    ) { innerPadding ->
        NavHost(
            navController = navController,
            startDestination = ZrpDestination.Home.route,
            modifier = androidx.compose.ui.Modifier.padding(innerPadding),
        ) {
            composable(
                route = ZrpDestination.Home.route,
                deepLinks = listOf(navDeepLink { uriPattern = "https://zrp.one/" }),
            ) {
                HomeScreen(
                    onAuthorClick = goToProfile,
                    onOpenComments = goToComments,
                    onOpenStoryViewer = goToStoryViewer,
                    onCreateStory = goToCreateStory,
                )
            }
            composable(
                route = ZrpDestination.Search.route,
                deepLinks = listOf(navDeepLink { uriPattern = "https://zrp.one/search" }),
            ) {
                SearchScreen(onAuthorClick = goToProfile, onOpenMusic = goToMusic, onOpenComments = goToComments)
            }
            composable(ZrpDestination.Create.route) { CreatePostScreen(onPosted = goHome) }
            composable(
                route = ZrpDestination.Notifications.route,
                deepLinks = listOf(navDeepLink { uriPattern = "https://zrp.one/notifications" }),
            ) { NotificationsScreen(onAuthorClick = goToProfile) }
            composable(
                route = ZrpDestination.Messages.route,
                deepLinks = listOf(navDeepLink { uriPattern = "https://zrp.one/messages" }),
            ) { MessagesScreen(onOpenConversation = goToConversation) }
            composable(ZrpDestination.Profile.route) {
                ProfileScreen(
                    username = null,
                    onLogout = onLogout,
                    onAuthorClick = goToProfile,
                    onMessageClick = goToConversation,
                    onOpenComments = goToComments,
                    onOpenBookmarks = goToBookmarks,
                    onOpenFollowers = goToFollowers,
                    onOpenFollowing = goToFollowing,
                    onOpenBlockedUsers = goToBlockedUsers,
                    onOpenMutedUsers = goToMutedUsers,
                )
            }
            composable(
                route = "profile/{username}",
                arguments = listOf(navArgument("username") { type = NavType.StringType }),
                deepLinks = listOf(navDeepLink { uriPattern = "https://zrp.one/profile/{username}" }),
            ) { backStackEntry ->
                val username = backStackEntry.arguments?.getString("username")
                ProfileScreen(
                    username = username,
                    onLogout = onLogout,
                    onAuthorClick = goToProfile,
                    onMessageClick = goToConversation,
                    onOpenComments = goToComments,
                    onOpenBookmarks = goToBookmarks,
                    onOpenFollowers = goToFollowers,
                    onOpenFollowing = goToFollowing,
                )
            }
            composable(
                route = "profile/{username}/followers",
                arguments = listOf(navArgument("username") { type = NavType.StringType }),
            ) { backStackEntry ->
                val username = backStackEntry.arguments?.getString("username")
                if (username != null) {
                    FollowListScreen(
                        username = username,
                        mode = FollowListMode.FOLLOWERS,
                        onAuthorClick = goToProfile,
                        onBack = { navController.popBackStack() },
                    )
                }
            }
            composable(
                route = "profile/{username}/following",
                arguments = listOf(navArgument("username") { type = NavType.StringType }),
            ) { backStackEntry ->
                val username = backStackEntry.arguments?.getString("username")
                if (username != null) {
                    FollowListScreen(
                        username = username,
                        mode = FollowListMode.FOLLOWING,
                        onAuthorClick = goToProfile,
                        onBack = { navController.popBackStack() },
                    )
                }
            }
            composable(
                route = "messages/{userId}/{username}",
                arguments = listOf(
                    navArgument("userId") { type = NavType.StringType },
                    navArgument("username") { type = NavType.StringType },
                ),
            ) { backStackEntry ->
                val userId = backStackEntry.arguments?.getString("userId")
                val username = backStackEntry.arguments?.getString("username")
                if (userId != null && username != null) {
                    ConversationScreen(
                        partnerId = userId,
                        partnerUsername = username,
                        onBack = { navController.popBackStack() },
                    )
                }
            }
            composable(
                route = "stories/{userId}",
                arguments = listOf(navArgument("userId") { type = NavType.StringType }),
            ) { backStackEntry ->
                val userId = backStackEntry.arguments?.getString("userId")
                if (userId != null) {
                    StoryViewerScreen(userId = userId, onClose = { navController.popBackStack() })
                }
            }
            composable("create-story") {
                CreateStoryScreen(onPosted = { navController.popBackStack() })
            }
            composable("music") {
                MusicScreen(onBack = { navController.popBackStack() })
            }
            composable("bookmarks") {
                BookmarksScreen(
                    onAuthorClick = goToProfile,
                    onOpenComments = goToComments,
                    onBack = { navController.popBackStack() },
                )
            }
            composable("blocked-users") {
                ModerationListScreen(
                    mode = ModerationListMode.BLOCKED,
                    onAuthorClick = goToProfile,
                    onBack = { navController.popBackStack() },
                )
            }
            composable("muted-users") {
                ModerationListScreen(
                    mode = ModerationListMode.MUTED,
                    onAuthorClick = goToProfile,
                    onBack = { navController.popBackStack() },
                )
            }
            composable(
                route = "post/{postId}/comments",
                arguments = listOf(navArgument("postId") { type = NavType.StringType }),
            ) { backStackEntry ->
                val postId = backStackEntry.arguments?.getString("postId")
                if (postId != null) {
                    CommentsScreen(postId = postId, onBack = { navController.popBackStack() })
                }
            }
        }
    }
}

@Composable
private fun ZrpBottomBar(navController: androidx.navigation.NavHostController) {
    val backStackEntry by navController.currentBackStackEntryAsState()
    val currentDestination = backStackEntry?.destination

    NavigationBar(containerColor = MaterialTheme.colorScheme.surfaceContainerLowest) {
        ZrpDestination.entries.forEach { destination ->
            val selected = currentDestination?.hierarchy?.any { it.route == destination.route } == true
            val iconScale by animateFloatAsState(
                targetValue = if (selected) 1f else 0.92f,
                animationSpec = spring(dampingRatio = Spring.DampingRatioMediumBouncy),
                label = "navIconScale",
            )

            NavigationBarItem(
                selected = selected,
                onClick = {
                    navController.navigate(destination.route) {
                        popUpTo(navController.graph.findStartDestination().id) {
                            saveState = true
                        }
                        launchSingleTop = true
                        restoreState = true
                    }
                },
                icon = {
                    Icon(
                        imageVector = if (selected) destination.selectedIcon else destination.unselectedIcon,
                        contentDescription = destination.label,
                        modifier = Modifier.scale(iconScale),
                    )
                },
                label = null,
                alwaysShowLabel = false,
                colors = NavigationBarItemDefaults.colors(
                    selectedIconColor = ZrpRed,
                    indicatorColor = ZrpRed.copy(alpha = 0.14f),
                    unselectedIconColor = MaterialTheme.colorScheme.onSurfaceVariant,
                ),
            )
        }
    }
}
