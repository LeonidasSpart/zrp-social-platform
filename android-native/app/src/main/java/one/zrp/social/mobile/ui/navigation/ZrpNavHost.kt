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
import androidx.compose.material3.windowsizeclass.ExperimentalMaterial3WindowSizeClassApi
import androidx.compose.material3.windowsizeclass.WindowSizeClass
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.scale
import androidx.compose.ui.platform.LocalContext
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
import kotlinx.coroutines.flow.MutableSharedFlow
import one.zrp.social.mobile.R
import one.zrp.social.mobile.data.MessagesRepository
import one.zrp.social.mobile.data.NotificationsRepository
import one.zrp.social.mobile.network.MobileUser
import one.zrp.social.mobile.ui.admin.AdminAdsScreen
import one.zrp.social.mobile.ui.admin.AdminAnalyticsScreen
import one.zrp.social.mobile.ui.admin.AdminAppealsScreen
import one.zrp.social.mobile.ui.admin.AdminAuditLogScreen
import one.zrp.social.mobile.ui.admin.AdminCharityDisbursementsScreen
import one.zrp.social.mobile.ui.admin.AdminDashboardScreen
import one.zrp.social.mobile.ui.admin.AdminHelpScreen
import one.zrp.social.mobile.ui.admin.AdminJournalistsScreen
import one.zrp.social.mobile.ui.admin.AdminMarketplaceScreen
import one.zrp.social.mobile.ui.admin.AdminMusicArtistsScreen
import one.zrp.social.mobile.ui.admin.AdminNewsNetworkScreen
import one.zrp.social.mobile.ui.admin.AdminNewsScreen
import one.zrp.social.mobile.ui.admin.AdminOpportunityScreen
import one.zrp.social.mobile.ui.admin.AdminPaymentsScreen
import one.zrp.social.mobile.ui.admin.AdminPostsScreen
import one.zrp.social.mobile.ui.admin.AdminReportsScreen
import one.zrp.social.mobile.ui.admin.AdminStorageScreen
import one.zrp.social.mobile.ui.admin.AdminSupportTicketDetailScreen
import one.zrp.social.mobile.ui.admin.AdminSupportTicketsScreen
import one.zrp.social.mobile.ui.admin.AdminUpgradeRequestsScreen
import one.zrp.social.mobile.ui.admin.AdminUsersScreen
import one.zrp.social.mobile.ui.admin.AdminWithdrawalsScreen
import one.zrp.social.mobile.ui.charity.CharityLedgerSection
import one.zrp.social.mobile.ui.transparency.TransparencyScreen
import one.zrp.social.mobile.ui.legal.LegalScreen
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
import one.zrp.social.mobile.ui.messages.GroupConversationScreen
import one.zrp.social.mobile.ui.messages.GroupCreateScreen
import one.zrp.social.mobile.ui.messages.GroupParticipantsScreen
import one.zrp.social.mobile.ui.messages.MessageDeepLinkScreen
import one.zrp.social.mobile.ui.messages.MessagesHomeScreen
import one.zrp.social.mobile.ui.messages.MessagesScreen
import one.zrp.social.mobile.ui.util.isTwoPane
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
import one.zrp.social.mobile.ui.settings.ApiKeysScreen
import one.zrp.social.mobile.ui.settings.AppealsScreen
import one.zrp.social.mobile.ui.settings.DeleteAccountScreen
import one.zrp.social.mobile.ui.settings.LanguageSettingsScreen
import one.zrp.social.mobile.ui.settings.NotificationSettingsScreen
import one.zrp.social.mobile.ui.settings.PrivacySettingsScreen
import one.zrp.social.mobile.ui.settings.ProfileEditScreen
import one.zrp.social.mobile.ui.settings.SecuritySettingsScreen
import one.zrp.social.mobile.ui.settings.SettingsScreen
import one.zrp.social.mobile.ui.settings.TeamScreen
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
@OptIn(ExperimentalMaterial3WindowSizeClassApi::class)
@Composable
fun ZrpNavHost(onLogout: () -> Unit, currentUser: MobileUser?, windowSizeClass: WindowSizeClass) {
    val navController = rememberNavController()
    val isStaff = currentUser?.role == "ADMIN" || currentUser?.role == "MODERATOR"
    val isAdminRole = currentUser?.role == "ADMIN"
    val currentUserId = currentUser?.id
    val goToProfile: (String) -> Unit = { username -> navController.navigate("profile/$username") }
    val goToTrustPassport: (String) -> Unit = { username -> navController.navigate("trust/$username") }
    val goToConversation: (partnerId: String, partnerUsername: String) -> Unit = { partnerId, partnerUsername ->
        navController.navigate("messages/$partnerId/$partnerUsername")
    }
    val goToGroup: (conversationId: String) -> Unit = { id -> navController.navigate("messages/group/$id") }
    val goToNewGroup: () -> Unit = { navController.navigate("messages/new-group") }
    val goToGroupInfo: (conversationId: String) -> Unit = { id -> navController.navigate("messages/group/$id/info") }
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
    val goToAppeals: () -> Unit = { navController.navigate("settings/appeals") }
    val goToDeleteAccount: () -> Unit = { navController.navigate("settings/delete-account") }
    val goToCreator: () -> Unit = { navController.navigate("creator") }
    val goToJournalist: () -> Unit = { navController.navigate("journalist") }
    val goToTeam: () -> Unit = { navController.navigate("settings/team") }
    val goToApiKeys: () -> Unit = { navController.navigate("settings/api-keys") }
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
    val goToAdminAppeals: () -> Unit = { navController.navigate("admin/appeals") }
    val goToAdminAds: () -> Unit = { navController.navigate("admin/ads") }
    val goToAdminMarketplace: () -> Unit = { navController.navigate("admin/marketplace") }
    val goToAdminOpportunity: () -> Unit = { navController.navigate("admin/opportunity") }
    val goToAdminHelp: () -> Unit = { navController.navigate("admin/help") }
    val goToAdminJournalists: () -> Unit = { navController.navigate("admin/journalists") }
    val goToAdminMusicArtists: () -> Unit = { navController.navigate("admin/music-artists") }
    val goToAdminNews: () -> Unit = { navController.navigate("admin/news") }
    val goToAdminSupport: () -> Unit = { navController.navigate("admin/support") }
    val goToAdminAnalytics: () -> Unit = { navController.navigate("admin/analytics") }
    val goToAdminAuditLog: () -> Unit = { navController.navigate("admin/audit-log") }
    val goToAdminStorage: () -> Unit = { navController.navigate("admin/storage") }
    val goToAdminCharityDisbursements: () -> Unit = { navController.navigate("admin/charity-disbursements") }
    val goToAdminSupportTicket: (String) -> Unit = { id -> navController.navigate("admin/support/$id") }
    val goToAdminPayments: () -> Unit = { navController.navigate("admin/payments") }
    val goToAdminWithdrawals: () -> Unit = { navController.navigate("admin/withdrawals") }
    val goToAdminUpgradeRequests: () -> Unit = { navController.navigate("admin/upgrade-requests") }
    val goToAdminNewsNetwork: () -> Unit = { navController.navigate("admin/news-network") }
    val goToTerms: () -> Unit = { navController.navigate("legal/terms") }
    val goToPrivacyPolicy: () -> Unit = { navController.navigate("legal/privacy") }
    val goToGuidelines: () -> Unit = { navController.navigate("legal/guidelines") }
    val goToHelpCenter: () -> Unit = { navController.navigate("legal/help") }
    val goToContact: () -> Unit = { navController.navigate("legal/contact") }
    val goToAbout: () -> Unit = { navController.navigate("legal/about") }
    val goToCareers: () -> Unit = { navController.navigate("legal/careers") }
    val goToCharity: () -> Unit = { navController.navigate("legal/charity") }
    val goToPress: () -> Unit = { navController.navigate("legal/press") }
    val goToInvestors: () -> Unit = { navController.navigate("legal/investors") }
    val goToTransparency: () -> Unit = { navController.navigate("transparency") }
    val goToFaq: () -> Unit = { navController.navigate("legal/faq") }
    val goToCommunityCode: () -> Unit = { navController.navigate("legal/communityCode") }
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

    // Tapping the Home tab while ALREADY on Home is a no-op as far as
    // navigation goes (launchSingleTop above means there's nowhere to
    // navigate to), so without this the feed just silently ignored the
    // tap instead of returning to the top the way X/TikTok's own Home
    // tab does. HomeScreen collects this and scrolls its active
    // LazyListState (whichever of For You/Following is currently
    // showing - HomeScreen only keeps one rememberLazyListState() live
    // at a time) to the top; buffering one event means a tap that lands
    // a beat before HomeScreen's collector starts still isn't lost.
    val homeScrollToTopEvents = remember { MutableSharedFlow<Unit>(extraBufferCapacity = 1) }

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
    val appContext = LocalContext.current.applicationContext
    val musicPlayerViewModel: MusicPlayerViewModel = viewModel(
        factory = remember { MusicPlayerViewModelFactory(MusicRepository(), appContext) },
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
                onHomeReselected = { homeScrollToTopEvents.tryEmit(Unit) },
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
                    onDiscoverCreators = goToExplorePeople,
                    onExploreMusic = goToMusic,
                    onExploreTopics = goToTrending,
                    scrollToTopEvents = homeScrollToTopEvents,
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
                    onOpenAppeals = goToAppeals,
                    onOpenMyListings = goToMyListings,
                )
            }
            composable(
                route = ZrpDestination.Messages.route,
                deepLinks = listOf(navDeepLink { uriPattern = "https://zrp.one/messages" }),
            ) {
                // Real WindowSizeClass-driven split (see WindowSize.kt's
                // own isTwoPane KDoc) - a tablet/large-screen window gets
                // the real two-pane list+thread layout in ONE screen
                // (MessagesHomeScreen), never pushing a second nav
                // destination for the thread; a phone-class window keeps
                // this exact same push-to-full-screen behavior the app
                // already had, unchanged.
                if (windowSizeClass.isTwoPane() && currentUserId != null) {
                    MessagesHomeScreen(
                        currentUserId = currentUserId,
                        onOpenProfile = goToProfile,
                        onOpenGroupInfo = goToGroupInfo,
                        onNewGroup = goToNewGroup,
                    )
                } else {
                    MessagesScreen(
                        onOpenConversation = goToConversation,
                        onOpenGroup = goToGroup,
                        onNewGroup = goToNewGroup,
                    )
                }
            }
            composable(
                route = "messages/group/{conversationId}",
                arguments = listOf(navArgument("conversationId") { type = NavType.StringType }),
                // Matches the real url a group-message push notification
                // carries (`/messages/group/{conversationId}` - see
                // POST .../conversations/{id}/messages's own
                // sendPushNotification call) - tapping that push lands
                // directly on the real thread, the group equivalent of
                // "messages/deeplink/{username}" for 1:1.
                deepLinks = listOf(navDeepLink { uriPattern = "https://zrp.one/messages/group/{conversationId}" }),
            ) { backStackEntry ->
                val conversationId = backStackEntry.arguments?.getString("conversationId")
                if (conversationId != null && currentUserId != null) {
                    GroupConversationScreen(
                        conversationId = conversationId,
                        currentUserId = currentUserId,
                        onBack = { navController.popBackStack() },
                        onOpenInfo = { goToGroupInfo(conversationId) },
                        onOpenProfile = goToProfile,
                    )
                }
            }
            composable("messages/new-group") {
                GroupCreateScreen(
                    onBack = { navController.popBackStack() },
                    onCreated = { conversationId ->
                        navController.navigate("messages/group/$conversationId") {
                            popUpTo(ZrpDestination.Messages.route) { inclusive = false }
                        }
                    },
                )
            }
            composable(
                route = "messages/group/{conversationId}/info",
                arguments = listOf(navArgument("conversationId") { type = NavType.StringType }),
            ) { backStackEntry ->
                val conversationId = backStackEntry.arguments?.getString("conversationId")
                if (conversationId != null && currentUserId != null) {
                    GroupParticipantsScreen(
                        conversationId = conversationId,
                        currentUserId = currentUserId,
                        onBack = { navController.popBackStack() },
                        onLeft = {
                            // Leaving pops all the way back to the
                            // conversation list - the group's own info/
                            // thread screens can no longer show anything
                            // real once membership is gone (see
                            // GroupParticipantsViewModel's own KDoc).
                            navController.popBackStack(ZrpDestination.Messages.route, inclusive = false)
                        },
                        onOpenProfile = goToProfile,
                    )
                }
            }
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
                // A distinct Kotlin route from "messages/{userId}/{username}"
                // above - Navigation Compose matches an incoming deep link
                // by its uriPattern, not by this route string, so the two
                // don't collide even though both ultimately show a
                // conversation. This one exists because a "New Message"
                // push notification's real url (sendPushNotification in
                // src/app/api/messages/route.ts) only ever carries a
                // username, never the partner's real id.
                route = "messages/deeplink/{username}",
                arguments = listOf(navArgument("username") { type = NavType.StringType }),
                deepLinks = listOf(navDeepLink { uriPattern = "https://zrp.one/messages/{username}" }),
            ) { backStackEntry ->
                val username = backStackEntry.arguments?.getString("username")
                if (username != null) {
                    MessageDeepLinkScreen(
                        username = username,
                        onBack = { navController.popBackStack() },
                        onOpenProfile = goToProfile,
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
                        onOpenProfile = goToProfile,
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
                    onOpenTeam = goToTeam,
                    onOpenApiKeys = goToApiKeys,
                    onOpenSupport = goToSupportTickets,
                    isStaff = isStaff,
                    onOpenAdmin = goToAdmin,
                    onOpenTerms = goToTerms,
                    onOpenPrivacyPolicy = goToPrivacyPolicy,
                    onOpenGuidelines = goToGuidelines,
                    onOpenHelp = goToHelpCenter,
                    onOpenContact = goToContact,
                    onOpenAbout = goToAbout,
                    onOpenCareers = goToCareers,
                    onOpenCharity = goToCharity,
                    onOpenPress = goToPress,
                    onOpenInvestors = goToInvestors,
                    onOpenTransparency = goToTransparency,
                    onOpenFaq = goToFaq,
                    onOpenCommunityCode = goToCommunityCode,
                )
            }
            composable("settings/team") {
                TeamScreen(onBack = { navController.popBackStack() })
            }
            composable("settings/api-keys") {
                ApiKeysScreen(onBack = { navController.popBackStack() })
            }
            composable("legal/terms") {
                LegalScreen(
                    page = "terms",
                    title = stringResource(R.string.legal_terms),
                    onBack = { navController.popBackStack() },
                )
            }
            composable("legal/privacy") {
                LegalScreen(
                    page = "privacy",
                    title = stringResource(R.string.legal_privacy),
                    onBack = { navController.popBackStack() },
                )
            }
            composable("legal/guidelines") {
                LegalScreen(
                    page = "guidelines",
                    title = stringResource(R.string.legal_guidelines),
                    onBack = { navController.popBackStack() },
                )
            }
            composable("legal/help") {
                LegalScreen(
                    page = "help",
                    title = stringResource(R.string.legal_help),
                    onBack = { navController.popBackStack() },
                )
            }
            composable("legal/contact") {
                LegalScreen(
                    page = "contact",
                    title = stringResource(R.string.legal_contact),
                    onBack = { navController.popBackStack() },
                )
            }
            composable("legal/about") {
                LegalScreen(
                    page = "about",
                    title = stringResource(R.string.legal_about),
                    onBack = { navController.popBackStack() },
                )
            }
            composable("legal/careers") {
                LegalScreen(
                    page = "careers",
                    title = stringResource(R.string.legal_careers),
                    onBack = { navController.popBackStack() },
                )
            }
            composable("legal/charity") {
                LegalScreen(
                    page = "charity",
                    title = stringResource(R.string.legal_charity),
                    onBack = { navController.popBackStack() },
                    trailingContent = { CharityLedgerSection() },
                )
            }
            composable("legal/press") {
                LegalScreen(
                    page = "press",
                    title = stringResource(R.string.legal_press),
                    onBack = { navController.popBackStack() },
                )
            }
            composable("legal/investors") {
                LegalScreen(
                    page = "investors",
                    title = stringResource(R.string.legal_investors),
                    onBack = { navController.popBackStack() },
                )
            }
            composable("transparency") {
                TransparencyScreen(onBack = { navController.popBackStack() })
            }
            composable("legal/faq") {
                LegalScreen(
                    page = "faq",
                    title = stringResource(R.string.legal_faq),
                    onBack = { navController.popBackStack() },
                )
            }
            composable("legal/communityCode") {
                LegalScreen(
                    page = "communityCode",
                    title = stringResource(R.string.legal_community_code),
                    onBack = { navController.popBackStack() },
                )
            }
            composable("admin") {
                AdminDashboardScreen(
                    onBack = { navController.popBackStack() },
                    onOpenUsers = goToAdminUsers,
                    onOpenPosts = goToAdminPosts,
                    onOpenReports = goToAdminReports,
                    onOpenAppeals = goToAdminAppeals,
                    onOpenAds = goToAdminAds,
                    onOpenMarketplace = goToAdminMarketplace,
                    onOpenOpportunity = goToAdminOpportunity,
                    onOpenHelp = goToAdminHelp,
                    onOpenJournalists = goToAdminJournalists,
                    onOpenMusicArtists = goToAdminMusicArtists,
                    onOpenNews = goToAdminNews,
                    // The support tools and the three financial queues
                    // are the admin sections the website itself gates
                    // on the real ADMIN role instead of staff (every
                    // /api/admin/support, /api/admin/payments,
                    // /api/admin/withdrawals and /api/upgrade-requests
                    // route is requireAdmin), so a MODERATOR never gets
                    // their quick actions or the screens below.
                    isAdmin = isAdminRole,
                    onOpenSupport = goToAdminSupport,
                    onOpenAnalytics = goToAdminAnalytics,
                    onOpenAuditLog = goToAdminAuditLog,
                    onOpenStorage = goToAdminStorage,
                    onOpenCharityDisbursements = goToAdminCharityDisbursements,
                    onOpenPayments = goToAdminPayments,
                    onOpenWithdrawals = goToAdminWithdrawals,
                    onOpenUpgradeRequests = goToAdminUpgradeRequests,
                    onOpenNewsNetwork = goToAdminNewsNetwork,
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
            // Every one of these is requireStaff server-side (see
            // AdminApi's own KDoc), the same level as reports/posts -
            // so, like those, they take no isAdmin flag: the entry
            // point is already gated at the Settings row and the real
            // boundary is the route itself.
            composable("admin/appeals") {
                AdminAppealsScreen(onBack = { navController.popBackStack() })
            }
            composable("admin/ads") {
                AdminAdsScreen(onBack = { navController.popBackStack() })
            }
            composable("admin/marketplace") {
                AdminMarketplaceScreen(onBack = { navController.popBackStack() })
            }
            composable("admin/opportunity") {
                AdminOpportunityScreen(onBack = { navController.popBackStack() })
            }
            composable("admin/help") {
                AdminHelpScreen(onBack = { navController.popBackStack() })
            }
            composable("admin/journalists") {
                AdminJournalistsScreen(onBack = { navController.popBackStack() })
            }
            composable("admin/music-artists") {
                AdminMusicArtistsScreen(onBack = { navController.popBackStack() })
            }
            // The four internal ops screens below are requireAdmin
            // server-side, exactly like the support tools - GET
            // /admin/analytics, /admin/audit-log,
            // /admin/cleanup-uploadthing and
            // /admin/charity-disbursements all call requireAdmin(), not
            // requireStaff(), so a MODERATOR never gets their quick
            // actions on the dashboard either.
            composable("admin/analytics") {
                AdminAnalyticsScreen(onBack = { navController.popBackStack() })
            }
            composable("admin/audit-log") {
                AdminAuditLogScreen(onBack = { navController.popBackStack() })
            }
            composable("admin/storage") {
                AdminStorageScreen(onBack = { navController.popBackStack() })
            }
            composable("admin/charity-disbursements") {
                AdminCharityDisbursementsScreen(onBack = { navController.popBackStack() })
            }
            // The ZRP News editorial desk - requireStaff server-side, so
            // no isAdmin flag, same as the review queues above. Viewing
            // an article opens the real native article screen.
            composable("admin/news") {
                AdminNewsScreen(
                    onBack = { navController.popBackStack() },
                    onViewArticle = goToNewsArticle,
                )
            }
            composable("admin/support") {
                AdminSupportTicketsScreen(
                    isAdmin = isAdminRole,
                    onBack = { navController.popBackStack() },
                    onOpenTicket = goToAdminSupportTicket,
                )
            }
            // The three financial queues, all requireAdmin server-side
            // (verifying a payment, paying a creator out and approving
            // a plan upgrade all move real money), so each takes the
            // same isAdmin flag the support tools do.
            composable("admin/payments") {
                AdminPaymentsScreen(isAdmin = isAdminRole, onBack = { navController.popBackStack() })
            }
            composable("admin/withdrawals") {
                AdminWithdrawalsScreen(isAdmin = isAdminRole, onBack = { navController.popBackStack() })
            }
            composable("admin/upgrade-requests") {
                AdminUpgradeRequestsScreen(isAdmin = isAdminRole, onBack = { navController.popBackStack() })
            }
            // The News Network console (the automated editorial
            // pipeline, not the /admin/news article CMS). Its five reads
            // are requireStaff but every action it offers - pausing,
            // running a cycle, provisioning feeds, enabling a source,
            // rejecting or correcting a story, removing a published post
            // - is requireAdmin, so it takes the same isAdmin flag the
            // financial queues do. A published post opens in the app's
            // own post view and a feed's account in its own profile:
            // nothing here hands off to a browser.
            composable("admin/news-network") {
                AdminNewsNetworkScreen(
                    isAdmin = isAdminRole,
                    onBack = { navController.popBackStack() },
                    onOpenPost = goToComments,
                    onOpenProfile = goToProfile,
                )
            }
            composable(
                route = "admin/support/{id}",
                arguments = listOf(navArgument("id") { type = NavType.StringType }),
            ) { backStackEntry ->
                val id = backStackEntry.arguments?.getString("id")
                if (id != null) {
                    AdminSupportTicketDetailScreen(
                        ticketId = id,
                        isAdmin = isAdminRole,
                        onBack = { navController.popBackStack() },
                    )
                }
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
                    onOpenAppeals = goToAppeals,
                )
            }
            composable("settings/appeals") {
                AppealsScreen(onBack = { navController.popBackStack() })
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
                // Matches the real "/post/{postId}" path
                // src/lib/push-notifications.ts's sendPushNotification
                // callers already send as the FCM `url` data field for a
                // like or comment notification (see
                // ZrpFirebaseMessagingService's own deep-link tap intent)
                // - this is the screen web's own /post/{postId} route
                // opens to, same as every other real goToComments call
                // elsewhere in this NavHost.
                deepLinks = listOf(navDeepLink { uriPattern = "https://zrp.one/post/{postId}" }),
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
    onHomeReselected: () -> Unit,
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
                    // Re-tapping the tab you're already on is a
                    // navigation no-op (see homeScrollToTopEvents' own
                    // comment) - for Home specifically, that's the
                    // signal to scroll the active feed back to the top
                    // instead of doing anything nav-related.
                    if (destination == ZrpDestination.Home && selected) {
                        onHomeReselected()
                        return@NavigationBarItem
                    }
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
