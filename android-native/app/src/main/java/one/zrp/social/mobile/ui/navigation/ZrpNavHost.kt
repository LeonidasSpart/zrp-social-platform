package one.zrp.social.mobile.ui.navigation

import android.net.Uri
import androidx.compose.animation.core.Spring
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.spring
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Badge
import androidx.compose.material3.BadgedBox
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.NavigationBarItemDefaults
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.scale
import androidx.compose.ui.res.stringResource
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.navigation.NavDestination.Companion.hierarchy
import androidx.navigation.NavGraph.Companion.findStartDestination
import androidx.navigation.NavType
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.rememberNavController
import androidx.navigation.compose.composable
import androidx.navigation.navArgument
import androidx.navigation.navDeepLink
import one.zrp.social.mobile.R
import one.zrp.social.mobile.data.MessagesRepository
import one.zrp.social.mobile.data.NotificationsRepository
import one.zrp.social.mobile.network.MobileUser
import one.zrp.social.mobile.ui.admin.AdminDashboardScreen
import one.zrp.social.mobile.ui.admin.AdminPostsScreen
import one.zrp.social.mobile.ui.admin.AdminReportsScreen
import one.zrp.social.mobile.ui.admin.AdminUsersScreen
import one.zrp.social.mobile.ui.legal.LegalWebViewScreen
import one.zrp.social.mobile.ui.bookmarks.BookmarksScreen
import one.zrp.social.mobile.ui.comments.CommentsScreen
import one.zrp.social.mobile.ui.create.CreatePostScreen
import one.zrp.social.mobile.ui.followlist.FollowListMode
import one.zrp.social.mobile.ui.followlist.FollowListScreen
import one.zrp.social.mobile.ui.hashtag.HashtagScreen
import one.zrp.social.mobile.ui.home.HomeScreen
import one.zrp.social.mobile.ui.marketplace.ListingDetailScreen
import one.zrp.social.mobile.ui.marketplace.ListingFavoritesScreen
import one.zrp.social.mobile.ui.marketplace.ListingFormScreen
import one.zrp.social.mobile.ui.marketplace.MarketplaceScreen
import one.zrp.social.mobile.ui.marketplace.MyListingsScreen
import one.zrp.social.mobile.ui.messages.ConversationScreen
import one.zrp.social.mobile.ui.messages.MessagesScreen
import one.zrp.social.mobile.ui.moderation.ModerationListMode
import one.zrp.social.mobile.ui.moderation.ModerationListScreen
import one.zrp.social.mobile.data.MusicRepository
import one.zrp.social.mobile.ui.music.AlbumDetailScreen
import one.zrp.social.mobile.ui.music.AlbumsScreen
import one.zrp.social.mobile.ui.music.ArtistDetailScreen
import one.zrp.social.mobile.ui.music.ArtistsScreen
import one.zrp.social.mobile.ui.music.DiscoverScreen
import one.zrp.social.mobile.ui.music.HistoryScreen
import one.zrp.social.mobile.ui.music.LikedScreen
import one.zrp.social.mobile.ui.music.MusicPlayerViewModel
import one.zrp.social.mobile.ui.music.StudioScreen
import one.zrp.social.mobile.ui.music.MusicPlayerViewModelFactory
import one.zrp.social.mobile.ui.music.MusicQueueScreen
import one.zrp.social.mobile.ui.music.MusicScreen
import one.zrp.social.mobile.ui.music.PlaylistDetailScreen
import one.zrp.social.mobile.ui.music.PlaylistsScreen
import one.zrp.social.mobile.ui.notifications.NotificationsScreen
import one.zrp.social.mobile.ui.aid.AidDetailScreen
import one.zrp.social.mobile.ui.aid.AidFormScreen
import one.zrp.social.mobile.ui.aid.AidOffersScreen
import one.zrp.social.mobile.ui.aid.AidScreen
import one.zrp.social.mobile.ui.aid.MyAidCampaignsScreen
import one.zrp.social.mobile.ui.opportunity.MyApplicationsScreen
import one.zrp.social.mobile.ui.opportunity.MyOpportunityListingsScreen
import one.zrp.social.mobile.ui.opportunity.OpportunityApplicantsScreen
import one.zrp.social.mobile.ui.opportunity.OpportunityDetailScreen
import one.zrp.social.mobile.ui.opportunity.OpportunityFormScreen
import one.zrp.social.mobile.ui.opportunity.OpportunityScreen
import one.zrp.social.mobile.ui.news.NewsArticleScreen
import one.zrp.social.mobile.ui.news.NewsScreen
import one.zrp.social.mobile.ui.shorts.ShortsScreen
import one.zrp.social.mobile.ui.play.PlayAchievementsScreen
import one.zrp.social.mobile.ui.play.PlayChallengeScreen
import one.zrp.social.mobile.ui.play.PlayCreateChallengeScreen
import one.zrp.social.mobile.ui.play.PlayDuelDetailScreen
import one.zrp.social.mobile.ui.play.PlayDuelsScreen
import one.zrp.social.mobile.ui.play.PlayLeaderboardScreen
import one.zrp.social.mobile.ui.play.PlayProfileScreen
import one.zrp.social.mobile.ui.play.PlayScreen
import one.zrp.social.mobile.ui.profile.ProfileScreen
import one.zrp.social.mobile.ui.quotes.QuotesScreen
import one.zrp.social.mobile.ui.reposts.RepostsScreen
import one.zrp.social.mobile.ui.search.ExplorePeopleScreen
import one.zrp.social.mobile.ui.search.ExploreTrendingScreen
import one.zrp.social.mobile.ui.search.SearchScreen
import one.zrp.social.mobile.ui.ai.AiChatScreen
import one.zrp.social.mobile.ui.creator.CreatorScreen
import one.zrp.social.mobile.ui.journalist.ArticleEditorScreen
import one.zrp.social.mobile.ui.journalist.JournalistDashboardScreen
import one.zrp.social.mobile.ui.support.NewTicketScreen
import one.zrp.social.mobile.ui.support.SupportTicketsScreen
import one.zrp.social.mobile.ui.support.TicketDetailScreen
import one.zrp.social.mobile.ui.trust.TrustPassportScreen
import one.zrp.social.mobile.ui.settings.AccountSettingsScreen
import one.zrp.social.mobile.ui.settings.DeleteAccountScreen
import one.zrp.social.mobile.ui.settings.LanguageSettingsScreen
import one.zrp.social.mobile.ui.settings.NotificationSettingsScreen
import one.zrp.social.mobile.ui.settings.PrivacySettingsScreen
import one.zrp.social.mobile.ui.settings.ProfileEditScreen
import one.zrp.social.mobile.ui.settings.SecuritySettingsScreen
import one.zrp.social.mobile.ui.settings.SettingsScreen
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
fun ZrpNavHost(onLogout: () -> Unit, currentUser: MobileUser?) {
    val navController = rememberNavController()
    val isStaff = currentUser?.role == "ADMIN" || currentUser?.role == "MODERATOR"
    val isAdminRole = currentUser?.role == "ADMIN"
    val goToProfile: (String) -> Unit = { username -> navController.navigate("profile/$username") }
    val goToTrustPassport: (String) -> Unit = { username -> navController.navigate("trust/$username") }
    val goToConversation: (partnerId: String, partnerUsername: String) -> Unit = { partnerId, partnerUsername ->
        navController.navigate("messages/$partnerId/$partnerUsername")
    }
    val goToComments: (String) -> Unit = { postId -> navController.navigate("post/$postId/comments") }
    val goToStoryViewer: (String) -> Unit = { userId -> navController.navigate("stories/$userId") }
    val goToCreateStory: () -> Unit = { navController.navigate("create-story") }
    val goToMusic: () -> Unit = { navController.navigate("music") }
    val goToMusicQueue: () -> Unit = { navController.navigate("music/queue") }
    val goToMusicArtists: () -> Unit = { navController.navigate("music/artists") }
    val goToMusicArtist: (String) -> Unit = { id -> navController.navigate("music/artists/$id") }
    val goToMusicAlbums: () -> Unit = { navController.navigate("music/albums") }
    val goToMusicAlbum: (String) -> Unit = { id -> navController.navigate("music/albums/$id") }
    val goToMusicPlaylists: () -> Unit = { navController.navigate("music/playlists") }
    val goToMusicPlaylist: (String) -> Unit = { id -> navController.navigate("music/playlists/$id") }
    val goToMusicDiscover: (String?) -> Unit = { genre ->
        navController.navigate(if (genre != null) "music/discover?genre=${Uri.encode(genre)}" else "music/discover")
    }
    val goToMusicLiked: () -> Unit = { navController.navigate("music/liked") }
    val goToMusicHistory: () -> Unit = { navController.navigate("music/history") }
    val goToMusicStudio: () -> Unit = { navController.navigate("music/studio") }
    val goToMarketplace: () -> Unit = { navController.navigate("marketplace") }
    val goToListing: (String) -> Unit = { id -> navController.navigate("marketplace/listing/$id") }
    val goToMarketplaceFavorites: () -> Unit = { navController.navigate("marketplace/favorites") }
    val goToNewListing: () -> Unit = { navController.navigate("marketplace/new") }
    val goToEditListing: (String) -> Unit = { id -> navController.navigate("marketplace/edit/$id") }
    val goToMyListings: () -> Unit = { navController.navigate("marketplace/my-listings") }
    val goToOpportunity: () -> Unit = { navController.navigate("opportunity") }
    val goToOpportunityListing: (String) -> Unit = { id -> navController.navigate("opportunity/listing/$id") }
    val goToNewOpportunity: () -> Unit = { navController.navigate("opportunity/new") }
    val goToEditOpportunity: (String) -> Unit = { id -> navController.navigate("opportunity/edit/$id") }
    val goToMyOpportunityListings: () -> Unit = { navController.navigate("opportunity/my-listings") }
    val goToOpportunityApplicants: (String) -> Unit = { id -> navController.navigate("opportunity/listing/$id/applicants") }
    val goToMyApplications: () -> Unit = { navController.navigate("opportunity/my-applications") }
    val goToAid: () -> Unit = { navController.navigate("aid") }
    val goToAidCampaign: (String) -> Unit = { id -> navController.navigate("aid/campaign/$id") }
    val goToNewCampaign: () -> Unit = { navController.navigate("aid/new") }
    val goToMyCampaigns: () -> Unit = { navController.navigate("aid/my-campaigns") }
    val goToAidOffers: (String) -> Unit = { id -> navController.navigate("aid/campaign/$id/offers") }
    val goToPlay: () -> Unit = { navController.navigate("play") }
    val goToPlayChallenge: (String) -> Unit = { id -> navController.navigate("play/challenge/$id") }
    val goToPlayDuels: () -> Unit = { navController.navigate("play/duels") }
    val goToPlayDuel: (String) -> Unit = { id -> navController.navigate("play/duel/$id") }
    val goToPlayLeaderboard: () -> Unit = { navController.navigate("play/leaderboard") }
    val goToPlayAchievements: () -> Unit = { navController.navigate("play/achievements") }
    val goToPlayProfile: (String) -> Unit = { username -> navController.navigate("play/profile/${Uri.encode(username)}") }
    val goToPlayCreateChallenge: () -> Unit = { navController.navigate("play/create") }
    val goToNews: () -> Unit = { navController.navigate("news") }
    val goToNewsArticle: (String) -> Unit = { slug -> navController.navigate("news/article/${Uri.encode(slug)}") }
    val goToShorts: () -> Unit = { navController.navigate("shorts") }
    // Matches PostCard.tsx's own video-tap behavior: opens the same
    // full-screen swipeable video feed as the Shorts tab, starting at
    // this exact post (VideoFeedViewer's own startPostId prop).
    val goToVideoViewer: (String) -> Unit = { postId -> navController.navigate("shorts/$postId") }
    val goToBookmarks: () -> Unit = { navController.navigate("bookmarks") }
    // "See all" destinations for Search's Discover state - the real
    // website's own /explore/trending and /explore/people pages.
    val goToTrending: () -> Unit = { navController.navigate("explore/trending") }
    val goToExplorePeople: () -> Unit = { navController.navigate("explore/people") }
    val goToFollowers: (String) -> Unit = { username -> navController.navigate("profile/$username/followers") }
    val goToFollowing: (String) -> Unit = { username -> navController.navigate("profile/$username/following") }
    val goToBlockedUsers: () -> Unit = { navController.navigate("blocked-users") }
    val goToMutedUsers: () -> Unit = { navController.navigate("muted-users") }
    val goToSettings: () -> Unit = { navController.navigate("settings") }
    val goToSettingsAccount: () -> Unit = { navController.navigate("settings/account") }
    val goToSettingsProfile: () -> Unit = { navController.navigate("settings/profile") }
    val goToSettingsSecurity: () -> Unit = { navController.navigate("settings/security") }
    val goToSettingsPrivacy: () -> Unit = { navController.navigate("settings/privacy") }
    val goToSettingsLanguage: () -> Unit = { navController.navigate("settings/language") }
    val goToSettingsNotifications: () -> Unit = { navController.navigate("settings/notifications") }
    val goToDeleteAccount: () -> Unit = { navController.navigate("settings/delete-account") }
    val goToCreator: () -> Unit = { navController.navigate("creator") }
    val goToJournalist: () -> Unit = { navController.navigate("journalist") }
    val goToNewArticle: () -> Unit = { navController.navigate("journalist/new") }
    val goToEditArticle: (String) -> Unit = { id -> navController.navigate("journalist/edit/$id") }
    val goToAi: () -> Unit = { navController.navigate("ai") }
    val goToSupportTickets: () -> Unit = { navController.navigate("support/tickets") }
    val goToNewTicket: () -> Unit = { navController.navigate("support/new") }
    val goToTicketDetail: (String) -> Unit = { id -> navController.navigate("support/tickets/$id") }
    val goToAdmin: () -> Unit = { navController.navigate("admin") }
    val goToAdminReports: () -> Unit = { navController.navigate("admin/reports") }
    val goToAdminUsers: () -> Unit = { navController.navigate("admin/users") }
    val goToAdminPosts: () -> Unit = { navController.navigate("admin/posts") }
    val goToTerms: () -> Unit = { navController.navigate("legal/terms") }
    val goToPrivacyPolicy: () -> Unit = { navController.navigate("legal/privacy") }
    val goToGuidelines: () -> Unit = { navController.navigate("legal/guidelines") }
    val goToQuotePost: (String) -> Unit = { postId -> navController.navigate("post/$postId/quote") }
    val goToReposts: (String) -> Unit = { postId -> navController.navigate("post/$postId/reposts") }
    val goToQuotes: (String) -> Unit = { postId -> navController.navigate("post/$postId/quotes") }
    // Hashtags only ever match \w+ (see LinkifiedText's regex, the same
    // one the website's own parseContent uses) - no spaces or reserved
    // path characters, so this never needs URL-encoding.
    val goToHashtag: (String) -> Unit = { tag -> navController.navigate("hashtag/$tag") }
    // Deliberately no saveState/restoreState here (see ZrpBottomBar's own
    // onClick, which has the identical fix and KDoc explaining why) -
    // this app's NavHost is one flat graph of ~86 sibling destinations,
    // not per-tab nested graphs, so that Google-sample pattern's
    // save/restore keys off whatever entry happened to be on top of the
    // stack rather than a tab-scoped back stack. Concretely: post from
    // Create after having drilled Home -> Search -> Profile would
    // restore *Profile*, not the feed, because Profile (not Home) was
    // the last entry saved under the graph's start-destination id. A
    // clean popUpTo(inclusive = false) always lands on the real Home
    // feed, which is what "go home after posting" means.
    val goHome: () -> Unit = {
        navController.navigate(ZrpDestination.Home.route) {
            popUpTo(navController.graph.findStartDestination().id) { inclusive = false }
            launchSingleTop = true
        }
    }

    // Hoisted above the NavHost, not created inside NotificationsScreen's
    // own composable, so the badge survives navigating away from the
    // Notifications tab instead of resetting every time that screen
    // leaves composition.
    val unreadBadgeViewModel: UnreadBadgeViewModel = viewModel(
        factory = remember { UnreadBadgeViewModelFactory(NotificationsRepository()) },
    )
    val unreadCount by unreadBadgeViewModel.unreadCount.collectAsState()

    // Same hoisting rationale as unreadBadgeViewModel above, for the
    // Messages tab's own unread badge (GET /messages/unread) - the
    // real cross-conversation total, distinct from each conversation
    // row's own per-conversation unreadCount already shown inside
    // MessagesScreen's own list.
    val unreadMessagesBadgeViewModel: UnreadMessagesBadgeViewModel = viewModel(
        factory = remember { UnreadMessagesBadgeViewModelFactory(MessagesRepository()) },
    )
    val unreadMessageCount by unreadMessagesBadgeViewModel.unreadCount.collectAsState()

    // Hoisted the same way as unreadBadgeViewModel above - playback and
    // the play queue need to survive navigating between Music screens
    // (Home, Queue, and later Artist/Album/Playlist/Discover/Liked/
    // History), the native equivalent of the website's own
    // MusicPlayerProvider React context wrapping every /music/* page.
    val musicPlayerViewModel: MusicPlayerViewModel = viewModel(
        factory = remember { MusicPlayerViewModelFactory(MusicRepository()) },
    )

    Scaffold(
        bottomBar = {
            ZrpBottomBar(
                navController = navController,
                unreadCount = unreadCount,
                unreadMessageCount = unreadMessageCount,
                onNotificationsSelected = { unreadBadgeViewModel.clear() },
                onOtherTabSelected = {
                    unreadBadgeViewModel.refresh()
                    unreadMessagesBadgeViewModel.refresh()
                },
            )
        },
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
                    onOpenQuotePost = goToQuotePost,
                    onOpenReposts = goToReposts,
                    onOpenQuotes = goToQuotes,
                    onOpenHashtag = goToHashtag,
                    onOpenVideoViewer = goToVideoViewer,
                )
            }
            composable(
                route = ZrpDestination.Search.route,
                deepLinks = listOf(navDeepLink { uriPattern = "https://zrp.one/search" }),
            ) {
                SearchScreen(
                    onAuthorClick = goToProfile,
                    onOpenMusic = goToMusic,
                    onOpenMarketplace = goToMarketplace,
                    onOpenOpportunity = goToOpportunity,
                    onOpenAid = goToAid,
                    onOpenPlay = goToPlay,
                    onOpenNews = goToNews,
                    onOpenShorts = goToShorts,
                    onOpenAi = goToAi,
                    onOpenComments = goToComments,
                    onOpenQuotePost = goToQuotePost,
                    onOpenReposts = goToReposts,
                    onOpenQuotes = goToQuotes,
                    onOpenHashtag = goToHashtag,
                    onOpenVideoViewer = goToVideoViewer,
                    onOpenTrending = goToTrending,
                    onOpenExplorePeople = goToExplorePeople,
                )
            }
            composable("explore/trending") {
                ExploreTrendingScreen(
                    onBack = { navController.popBackStack() },
                    onOpenHashtag = goToHashtag,
                )
            }
            composable("explore/people") {
                ExplorePeopleScreen(
                    onBack = { navController.popBackStack() },
                    onAuthorClick = goToProfile,
                )
            }
            composable(ZrpDestination.Create.route) { CreatePostScreen(onPosted = goHome) }
            composable(
                route = ZrpDestination.Notifications.route,
                deepLinks = listOf(navDeepLink { uriPattern = "https://zrp.one/notifications" }),
            ) {
                NotificationsScreen(
                    onAuthorClick = goToProfile,
                    onOpenComments = goToComments,
                    onOpenMessage = goToConversation,
                )
            }
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
                    onOpenSettings = goToSettings,
                    onOpenQuotePost = goToQuotePost,
                    onOpenReposts = goToReposts,
                    onOpenQuotes = goToQuotes,
                    onOpenHashtag = goToHashtag,
                    onOpenTrustPassport = goToTrustPassport,
                    onOpenVideoViewer = goToVideoViewer,
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
                    onOpenQuotePost = goToQuotePost,
                    onOpenReposts = goToReposts,
                    onOpenQuotes = goToQuotes,
                    onOpenHashtag = goToHashtag,
                    onOpenTrustPassport = goToTrustPassport,
                    onOpenVideoViewer = goToVideoViewer,
                )
            }
            composable(
                route = "trust/{username}",
                arguments = listOf(navArgument("username") { type = NavType.StringType }),
                deepLinks = listOf(navDeepLink { uriPattern = "https://zrp.one/trust/{username}" }),
            ) { backStackEntry ->
                val username = backStackEntry.arguments?.getString("username")
                if (username != null) {
                    TrustPassportScreen(
                        username = username,
                        onBack = { navController.popBackStack() },
                        onOpenProfile = { navController.popBackStack() },
                    )
                }
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
                        onOpenProfile = { goToProfile(username) },
                    )
                }
            }
            composable(
                route = "stories/{userId}",
                arguments = listOf(navArgument("userId") { type = NavType.StringType }),
            ) { backStackEntry ->
                val userId = backStackEntry.arguments?.getString("userId")
                if (userId != null) {
                    StoryViewerScreen(
                        userId = userId,
                        onClose = { navController.popBackStack() },
                        onAddStory = goToCreateStory,
                    )
                }
            }
            composable("create-story") {
                CreateStoryScreen(onPosted = { navController.popBackStack() })
            }
            composable("music") {
                MusicScreen(
                    player = musicPlayerViewModel,
                    onBack = { navController.popBackStack() },
                    onOpenQueue = goToMusicQueue,
                    onOpenArtists = goToMusicArtists,
                    onOpenAlbums = goToMusicAlbums,
                    onOpenPlaylists = goToMusicPlaylists,
                    onOpenDiscover = { goToMusicDiscover(null) },
                    onOpenLiked = goToMusicLiked,
                    onOpenHistory = goToMusicHistory,
                    onOpenStudio = goToMusicStudio,
                    onArtistClick = goToMusicArtist,
                    onAlbumClick = goToMusicAlbum,
                    onPlaylistClick = goToMusicPlaylist,
                    onGenreClick = goToMusicDiscover,
                )
            }
            composable("music/queue") {
                MusicQueueScreen(player = musicPlayerViewModel, onBack = { navController.popBackStack() })
            }
            composable("music/artists") {
                ArtistsScreen(onBack = { navController.popBackStack() }, onArtistClick = goToMusicArtist)
            }
            composable("music/albums") {
                AlbumsScreen(onBack = { navController.popBackStack() }, onAlbumClick = goToMusicAlbum)
            }
            composable("music/playlists") {
                PlaylistsScreen(onBack = { navController.popBackStack() }, onPlaylistClick = goToMusicPlaylist)
            }
            composable("music/studio") {
                StudioScreen(onBack = { navController.popBackStack() })
            }
            composable(
                route = "music/discover?genre={genre}",
                arguments = listOf(navArgument("genre") { type = NavType.StringType; nullable = true; defaultValue = null }),
            ) { backStackEntry ->
                DiscoverScreen(
                    player = musicPlayerViewModel,
                    initialGenre = backStackEntry.arguments?.getString("genre"),
                    onBack = { navController.popBackStack() },
                )
            }
            composable("music/liked") {
                LikedScreen(player = musicPlayerViewModel, onBack = { navController.popBackStack() })
            }
            composable("music/history") {
                HistoryScreen(player = musicPlayerViewModel, onBack = { navController.popBackStack() })
            }
            composable(
                route = "music/playlists/{id}",
                arguments = listOf(navArgument("id") { type = NavType.StringType }),
            ) { backStackEntry ->
                val id = backStackEntry.arguments?.getString("id")
                if (id != null) {
                    PlaylistDetailScreen(
                        playlistId = id,
                        player = musicPlayerViewModel,
                        onBack = { navController.popBackStack() },
                    )
                }
            }
            composable(
                route = "music/artists/{id}",
                arguments = listOf(navArgument("id") { type = NavType.StringType }),
            ) { backStackEntry ->
                val id = backStackEntry.arguments?.getString("id")
                if (id != null) {
                    ArtistDetailScreen(
                        artistId = id,
                        player = musicPlayerViewModel,
                        onBack = { navController.popBackStack() },
                        onAlbumClick = goToMusicAlbum,
                    )
                }
            }
            composable(
                route = "music/albums/{id}",
                arguments = listOf(navArgument("id") { type = NavType.StringType }),
            ) { backStackEntry ->
                val id = backStackEntry.arguments?.getString("id")
                if (id != null) {
                    AlbumDetailScreen(
                        albumId = id,
                        player = musicPlayerViewModel,
                        onBack = { navController.popBackStack() },
                        onArtistClick = goToMusicArtist,
                    )
                }
            }
            composable("marketplace") {
                MarketplaceScreen(
                    onBack = { navController.popBackStack() },
                    onListingClick = goToListing,
                    onOpenFavorites = goToMarketplaceFavorites,
                    onOpenMyListings = goToMyListings,
                    onCreateListing = goToNewListing,
                )
            }
            composable(
                route = "marketplace/listing/{id}",
                arguments = listOf(navArgument("id") { type = NavType.StringType }),
            ) { backStackEntry ->
                val id = backStackEntry.arguments?.getString("id")
                if (id != null) {
                    ListingDetailScreen(
                        listingId = id,
                        onBack = { navController.popBackStack() },
                        onOpenSeller = goToProfile,
                        onMessageSeller = goToConversation,
                        onEditListing = goToEditListing,
                    )
                }
            }
            composable("marketplace/favorites") {
                ListingFavoritesScreen(
                    onBack = { navController.popBackStack() },
                    onListingClick = goToListing,
                )
            }
            composable("marketplace/new") {
                ListingFormScreen(
                    listingId = null,
                    onBack = { navController.popBackStack() },
                    onSaved = { id ->
                        navController.navigate("marketplace/listing/$id") {
                            popUpTo("marketplace") { inclusive = false }
                        }
                    },
                )
            }
            composable(
                route = "marketplace/edit/{id}",
                arguments = listOf(navArgument("id") { type = NavType.StringType }),
            ) { backStackEntry ->
                val id = backStackEntry.arguments?.getString("id")
                if (id != null) {
                    ListingFormScreen(
                        listingId = id,
                        onBack = { navController.popBackStack() },
                        onSaved = { savedId -> navController.navigate("marketplace/listing/$savedId") { popUpTo("marketplace") { inclusive = false } } },
                    )
                }
            }
            composable("marketplace/my-listings") {
                MyListingsScreen(
                    onBack = { navController.popBackStack() },
                    onOpenListing = goToListing,
                    onCreateListing = goToNewListing,
                    onEditListing = goToEditListing,
                )
            }
            composable("opportunity") {
                OpportunityScreen(
                    onBack = { navController.popBackStack() },
                    onListingClick = goToOpportunityListing,
                    onPostOpportunity = goToNewOpportunity,
                    onOpenMyListings = goToMyOpportunityListings,
                    onOpenMyApplications = goToMyApplications,
                )
            }
            composable(
                route = "opportunity/listing/{id}",
                arguments = listOf(navArgument("id") { type = NavType.StringType }),
            ) { backStackEntry ->
                val id = backStackEntry.arguments?.getString("id")
                if (id != null) {
                    OpportunityDetailScreen(
                        listingId = id,
                        onBack = { navController.popBackStack() },
                        onOpenPoster = goToProfile,
                        onEditListing = goToEditOpportunity,
                        onOpenApplicants = goToOpportunityApplicants,
                    )
                }
            }
            composable(
                route = "opportunity/listing/{id}/applicants",
                arguments = listOf(navArgument("id") { type = NavType.StringType }),
            ) { backStackEntry ->
                val id = backStackEntry.arguments?.getString("id")
                if (id != null) {
                    OpportunityApplicantsScreen(
                        listingId = id,
                        onBack = { navController.popBackStack() },
                        onOpenApplicant = goToProfile,
                    )
                }
            }
            composable("opportunity/my-applications") {
                MyApplicationsScreen(
                    onBack = { navController.popBackStack() },
                    onOpenListing = goToOpportunityListing,
                )
            }
            composable("aid") {
                AidScreen(
                    onBack = { navController.popBackStack() },
                    onCampaignClick = goToAidCampaign,
                    onCreateCampaign = goToNewCampaign,
                    onOpenMyCampaigns = goToMyCampaigns,
                )
            }
            composable(
                route = "aid/campaign/{id}",
                arguments = listOf(navArgument("id") { type = NavType.StringType }),
            ) { backStackEntry ->
                val id = backStackEntry.arguments?.getString("id")
                if (id != null) {
                    AidDetailScreen(
                        campaignId = id,
                        onBack = { navController.popBackStack() },
                        onOpenOrganizer = goToProfile,
                        onOpenOffers = { goToAidOffers(id) },
                    )
                }
            }
            composable(
                route = "aid/campaign/{id}/offers",
                arguments = listOf(navArgument("id") { type = NavType.StringType }),
            ) { backStackEntry ->
                val id = backStackEntry.arguments?.getString("id")
                if (id != null) {
                    AidOffersScreen(
                        campaignId = id,
                        onBack = { navController.popBackStack() },
                        onOpenOfferer = goToProfile,
                    )
                }
            }
            composable("aid/new") {
                AidFormScreen(
                    onBack = { navController.popBackStack() },
                    onSaved = { campaignId ->
                        navController.popBackStack()
                        goToAidCampaign(campaignId)
                    },
                )
            }
            composable("aid/my-campaigns") {
                MyAidCampaignsScreen(
                    onBack = { navController.popBackStack() },
                    onOpenCampaign = goToAidCampaign,
                )
            }
            composable("play") {
                PlayScreen(
                    onBack = { navController.popBackStack() },
                    onChallengeClick = goToPlayChallenge,
                    onOpenDuel = goToPlayDuel,
                    onOpenDuels = goToPlayDuels,
                    onOpenLeaderboard = goToPlayLeaderboard,
                    onOpenAchievements = goToPlayAchievements,
                    onOpenProfile = goToPlayProfile,
                    onOpenCreateChallenge = goToPlayCreateChallenge,
                )
            }
            composable("play/create") {
                PlayCreateChallengeScreen(
                    onBack = { navController.popBackStack() },
                    onCreated = { id ->
                        navController.navigate("play/challenge/$id") {
                            popUpTo("play") { inclusive = false }
                        }
                    },
                )
            }
            composable("play/leaderboard") {
                PlayLeaderboardScreen(
                    onBack = { navController.popBackStack() },
                    onOpenProfile = goToPlayProfile,
                )
            }
            composable("play/achievements") {
                PlayAchievementsScreen(onBack = { navController.popBackStack() })
            }
            composable(
                route = "play/profile/{username}",
                arguments = listOf(navArgument("username") { type = NavType.StringType }),
            ) { backStackEntry ->
                val username = backStackEntry.arguments?.getString("username")
                if (username != null) {
                    PlayProfileScreen(
                        username = username,
                        onBack = { navController.popBackStack() },
                        onOpenChallenge = goToPlayChallenge,
                    )
                }
            }
            composable(
                route = "play/challenge/{id}?duelId={duelId}",
                arguments = listOf(
                    navArgument("id") { type = NavType.StringType },
                    navArgument("duelId") { type = NavType.StringType; nullable = true; defaultValue = null },
                ),
            ) { backStackEntry ->
                val id = backStackEntry.arguments?.getString("id")
                val duelId = backStackEntry.arguments?.getString("duelId")
                if (id != null) {
                    PlayChallengeScreen(
                        challengeId = id,
                        duelId = duelId,
                        onBack = { navController.popBackStack() },
                        onViewDuels = goToPlayDuels,
                    )
                }
            }
            composable("play/duels") {
                PlayDuelsScreen(
                    onBack = { navController.popBackStack() },
                    onOpenDuel = goToPlayDuel,
                )
            }
            composable(
                route = "play/duel/{id}",
                arguments = listOf(navArgument("id") { type = NavType.StringType }),
            ) { backStackEntry ->
                val id = backStackEntry.arguments?.getString("id")
                if (id != null) {
                    PlayDuelDetailScreen(
                        duelId = id,
                        onBack = { navController.popBackStack() },
                        onPlay = { challengeId, playDuelId -> navController.navigate("play/challenge/$challengeId?duelId=${Uri.encode(playDuelId)}") },
                    )
                }
            }
            composable("news") {
                NewsScreen(
                    onBack = { navController.popBackStack() },
                    onOpenArticle = goToNewsArticle,
                )
            }
            composable(
                route = "news/article/{slug}",
                arguments = listOf(navArgument("slug") { type = NavType.StringType }),
            ) { backStackEntry ->
                val slug = backStackEntry.arguments?.getString("slug")
                if (slug != null) {
                    NewsArticleScreen(slug = slug, onBack = { navController.popBackStack() })
                }
            }
            composable("shorts") {
                ShortsScreen(
                    onBack = { navController.popBackStack() },
                    onOpenComments = goToComments,
                    onAuthorClick = goToProfile,
                )
            }
            composable(
                route = "shorts/{postId}",
                arguments = listOf(navArgument("postId") { type = NavType.StringType }),
            ) { backStackEntry ->
                val postId = backStackEntry.arguments?.getString("postId")
                ShortsScreen(
                    onBack = { navController.popBackStack() },
                    onOpenComments = goToComments,
                    onAuthorClick = goToProfile,
                    startPostId = postId,
                )
            }
            composable("opportunity/new") {
                OpportunityFormScreen(
                    listingId = null,
                    onBack = { navController.popBackStack() },
                    onSaved = { id ->
                        navController.navigate("opportunity/listing/$id") {
                            popUpTo("opportunity") { inclusive = false }
                        }
                    },
                )
            }
            composable(
                route = "opportunity/edit/{id}",
                arguments = listOf(navArgument("id") { type = NavType.StringType }),
            ) { backStackEntry ->
                val id = backStackEntry.arguments?.getString("id")
                if (id != null) {
                    OpportunityFormScreen(
                        listingId = id,
                        onBack = { navController.popBackStack() },
                        onSaved = { savedId -> navController.navigate("opportunity/listing/$savedId") { popUpTo("opportunity") { inclusive = false } } },
                    )
                }
            }
            composable("opportunity/my-listings") {
                MyOpportunityListingsScreen(
                    onBack = { navController.popBackStack() },
                    onOpenListing = goToOpportunityListing,
                    onEditListing = goToEditOpportunity,
                    onOpenApplicants = goToOpportunityApplicants,
                )
            }
            composable("bookmarks") {
                BookmarksScreen(
                    onAuthorClick = goToProfile,
                    onOpenComments = goToComments,
                    onBack = { navController.popBackStack() },
                    onOpenQuotePost = goToQuotePost,
                    onOpenReposts = goToReposts,
                    onOpenQuotes = goToQuotes,
                    onOpenHashtag = goToHashtag,
                    onOpenVideoViewer = goToVideoViewer,
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
            composable("settings") {
                SettingsScreen(
                    onBack = { navController.popBackStack() },
                    onOpenAccount = goToSettingsAccount,
                    onOpenProfile = goToSettingsProfile,
                    onOpenSecurity = goToSettingsSecurity,
                    onOpenPrivacy = goToSettingsPrivacy,
                    onOpenLanguage = goToSettingsLanguage,
                    onOpenNotifications = goToSettingsNotifications,
                    onOpenCreator = goToCreator,
                    onOpenJournalist = goToJournalist,
                    onOpenSupport = goToSupportTickets,
                    isStaff = isStaff,
                    onOpenAdmin = goToAdmin,
                    onOpenTerms = goToTerms,
                    onOpenPrivacyPolicy = goToPrivacyPolicy,
                    onOpenGuidelines = goToGuidelines,
                )
            }
            composable("legal/terms") {
                LegalWebViewScreen(
                    url = "https://zrp.one/terms",
                    title = stringResource(R.string.legal_terms),
                    onBack = { navController.popBackStack() },
                )
            }
            composable("legal/privacy") {
                LegalWebViewScreen(
                    url = "https://zrp.one/privacy",
                    title = stringResource(R.string.legal_privacy),
                    onBack = { navController.popBackStack() },
                )
            }
            composable("legal/guidelines") {
                LegalWebViewScreen(
                    url = "https://zrp.one/guidelines",
                    title = stringResource(R.string.legal_guidelines),
                    onBack = { navController.popBackStack() },
                )
            }
            composable("admin") {
                AdminDashboardScreen(
                    onBack = { navController.popBackStack() },
                    onOpenUsers = goToAdminUsers,
                    onOpenPosts = goToAdminPosts,
                    onOpenReports = goToAdminReports,
                )
            }
            composable("admin/reports") {
                AdminReportsScreen(onBack = { navController.popBackStack() })
            }
            composable("admin/users") {
                AdminUsersScreen(isAdmin = isAdminRole, onBack = { navController.popBackStack() })
            }
            composable("admin/posts") {
                AdminPostsScreen(onBack = { navController.popBackStack() })
            }
            composable("creator") {
                CreatorScreen(
                    onBack = { navController.popBackStack() },
                    onOpenPost = goToComments,
                )
            }
            composable("journalist") {
                JournalistDashboardScreen(
                    onBack = { navController.popBackStack() },
                    onCreateArticle = goToNewArticle,
                    onEditArticle = goToEditArticle,
                    onViewArticle = goToNewsArticle,
                )
            }
            composable("ai") {
                AiChatScreen(onBack = { navController.popBackStack() })
            }
            composable("support/tickets") {
                SupportTicketsScreen(
                    onBack = { navController.popBackStack() },
                    onOpenTicket = goToTicketDetail,
                    onNewTicket = goToNewTicket,
                )
            }
            composable("support/new") {
                NewTicketScreen(
                    onBack = { navController.popBackStack() },
                    onSubmitted = { navController.popBackStack() },
                    onOpenMyTickets = { navController.popBackStack() },
                )
            }
            composable(
                route = "support/tickets/{id}",
                arguments = listOf(navArgument("id") { type = NavType.StringType }),
            ) { backStackEntry ->
                val id = backStackEntry.arguments?.getString("id")
                if (id != null) {
                    TicketDetailScreen(ticketId = id, onBack = { navController.popBackStack() })
                }
            }
            composable("journalist/new") {
                ArticleEditorScreen(
                    articleId = null,
                    onBack = { navController.popBackStack() },
                    onSaved = { navController.popBackStack() },
                )
            }
            composable(
                route = "journalist/edit/{id}",
                arguments = listOf(navArgument("id") { type = NavType.StringType }),
            ) { backStackEntry ->
                val id = backStackEntry.arguments?.getString("id")
                if (id != null) {
                    ArticleEditorScreen(
                        articleId = id,
                        onBack = { navController.popBackStack() },
                        onSaved = { navController.popBackStack() },
                    )
                }
            }
            composable("settings/language") {
                LanguageSettingsScreen(onBack = { navController.popBackStack() })
            }
            composable("settings/notifications") {
                NotificationSettingsScreen(onBack = { navController.popBackStack() })
            }
            composable("settings/account") {
                AccountSettingsScreen(
                    onBack = { navController.popBackStack() },
                    onOpenDeleteAccount = goToDeleteAccount,
                )
            }
            composable("settings/profile") {
                ProfileEditScreen(onBack = { navController.popBackStack() })
            }
            composable("settings/security") {
                SecuritySettingsScreen(onBack = { navController.popBackStack() })
            }
            composable("settings/privacy") {
                PrivacySettingsScreen(
                    onBack = { navController.popBackStack() },
                    onOpenBlockedUsers = goToBlockedUsers,
                    onOpenMutedUsers = goToMutedUsers,
                )
            }
            composable("settings/delete-account") {
                DeleteAccountScreen(
                    onBack = { navController.popBackStack() },
                    onAccountDeleted = onLogout,
                )
            }
            composable(
                route = "post/{postId}/comments",
                arguments = listOf(navArgument("postId") { type = NavType.StringType }),
            ) { backStackEntry ->
                val postId = backStackEntry.arguments?.getString("postId")
                if (postId != null) {
                    CommentsScreen(
                        postId = postId,
                        onBack = { navController.popBackStack() },
                        onAuthorClick = goToProfile,
                        onOpenHashtag = goToHashtag,
                    )
                }
            }
            composable(
                route = "post/{postId}/quote",
                arguments = listOf(navArgument("postId") { type = NavType.StringType }),
            ) { backStackEntry ->
                val postId = backStackEntry.arguments?.getString("postId")
                if (postId != null) {
                    CreatePostScreen(quotePostId = postId, onPosted = { navController.popBackStack() })
                }
            }
            composable(
                route = "post/{postId}/reposts",
                arguments = listOf(navArgument("postId") { type = NavType.StringType }),
            ) { backStackEntry ->
                val postId = backStackEntry.arguments?.getString("postId")
                if (postId != null) {
                    RepostsScreen(
                        postId = postId,
                        onAuthorClick = goToProfile,
                        onBack = { navController.popBackStack() },
                    )
                }
            }
            composable(
                route = "post/{postId}/quotes",
                arguments = listOf(navArgument("postId") { type = NavType.StringType }),
            ) { backStackEntry ->
                val postId = backStackEntry.arguments?.getString("postId")
                if (postId != null) {
                    QuotesScreen(
                        postId = postId,
                        onAuthorClick = goToProfile,
                        onOpenComments = goToComments,
                        onOpenQuotePost = goToQuotePost,
                        onOpenReposts = goToReposts,
                        onOpenQuotes = goToQuotes,
                        onOpenHashtag = goToHashtag,
                        onOpenVideoViewer = goToVideoViewer,
                        onBack = { navController.popBackStack() },
                    )
                }
            }
            composable(
                route = "hashtag/{tag}",
                arguments = listOf(navArgument("tag") { type = NavType.StringType }),
                deepLinks = listOf(navDeepLink { uriPattern = "https://zrp.one/hashtag/{tag}" }),
            ) { backStackEntry ->
                val tag = backStackEntry.arguments?.getString("tag")
                if (tag != null) {
                    HashtagScreen(
                        tag = tag,
                        onAuthorClick = goToProfile,
                        onOpenComments = goToComments,
                        onBack = { navController.popBackStack() },
                        onOpenQuotePost = goToQuotePost,
                        onOpenReposts = goToReposts,
                        onOpenQuotes = goToQuotes,
                        onOpenHashtag = goToHashtag,
                        onOpenVideoViewer = goToVideoViewer,
                    )
                }
            }
        }
    }
}

@Composable
private fun ZrpBottomBar(
    navController: androidx.navigation.NavHostController,
    unreadCount: Int,
    unreadMessageCount: Int,
    onNotificationsSelected: () -> Unit,
    onOtherTabSelected: () -> Unit,
) {
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
                    if (destination == ZrpDestination.Notifications) {
                        onNotificationsSelected()
                    } else {
                        onOtherTabSelected()
                    }
                    // No saveState/restoreState: the Google sample this
                    // pattern comes from assumes each bottom-tab
                    // destination is its own NESTED navigation graph, so
                    // "save state on popUpTo the graph's start, restore
                    // it on the way back" scopes cleanly per tab. This
                    // NavHost is one FLAT graph instead - every screen
                    // (Profile, Messages, Settings, Music, all ~86 of
                    // them) is a sibling destination in the same graph,
                    // not nested under a tab. So saveState here doesn't
                    // save "this tab's back stack" - it saves whatever
                    // NavBackStackEntry happens to sit at the graph's
                    // start-destination position, which can be a screen
                    // reached from a completely different tab (e.g.
                    // Home -> Search -> Profile, then tapping Home: the
                    // saved/restored state is keyed to that position and
                    // can bring Profile back instead of the feed on a
                    // later restoreState=true navigate). A plain
                    // popUpTo(start){inclusive=false} always clears back
                    // to a real, fresh instance of the tapped tab -
                    // trading "remember scroll position across tab
                    // switches" for actually landing on the right screen,
                    // which this flat graph shape requires.
                    navController.navigate(destination.route) {
                        popUpTo(navController.graph.findStartDestination().id) {
                            inclusive = false
                        }
                        launchSingleTop = true
                    }
                },
                icon = {
                    val icon: @Composable () -> Unit = {
                        Icon(
                            imageVector = if (selected) destination.selectedIcon else destination.unselectedIcon,
                            contentDescription = stringResource(destination.labelRes),
                            modifier = Modifier.scale(iconScale),
                        )
                    }
                    val badgeCount = when (destination) {
                        ZrpDestination.Notifications -> unreadCount
                        ZrpDestination.Messages -> unreadMessageCount
                        else -> 0
                    }
                    if (badgeCount > 0) {
                        BadgedBox(
                            badge = {
                                Badge {
                                    Text(if (badgeCount > 99) "99+" else badgeCount.toString())
                                }
                            },
                        ) { icon() }
                    } else {
                        icon()
                    }
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
