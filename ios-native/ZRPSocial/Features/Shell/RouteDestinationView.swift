import SwiftUI

/// Turns a `Route` into the screen it names.
///
/// One switch, used by every tab's navigation stack. When Home owned the
/// only stack this lived inside it; with six tabs it has to be shared, or
/// a destination would work in one tab and be missing in another.
struct RouteDestinationView: View {

    @EnvironmentObject private var session: SessionController

    let route: Route

    var body: some View {
        switch route {
        case .postDetail(let postId, let preloaded):
            PostDetailView(postId: postId, preloaded: preloaded)
        case .profile(let username):
            ProfileView(username: username)
        case .hashtag(let tag):
            HashtagView(tag: tag)
        case .userList(let source):
            UserListView(source: source)
        case .postQuotes(let postId):
            PostQuotesView(postId: postId)
        case .messages:
            MessagesListView()
        case .conversation(let partner):
            ConversationView(partner: partner, viewerId: session.currentUser?.id)
        case .notifications:
            NotificationsView()
        case .search:
            SearchView()
        case .music:
            MusicHomeView()
        case .musicDiscover:
            MusicDiscoverView()
        case .musicArtists:
            MusicArtistsView()
        case .musicAlbums:
            MusicAlbumsView()
        case .musicPlaylists:
            MusicPlaylistsView()
        case .musicArtist(let id):
            MusicArtistDetailView(artistId: id)
        case .musicAlbum(let id):
            MusicAlbumDetailView(albumId: id)
        case .musicPlaylist(let id):
            MusicPlaylistDetailView(playlistId: id)
        case .musicLiked:
            MusicLibraryListView(kind: .liked)
        case .musicHistory:
            MusicLibraryListView(kind: .history)
        case .musicQueue:
            MusicQueueView()
        case .musicStudio:
            MusicStudioView()
        case .marketplace:
            MarketplaceView()
        case .listingDetail(let id):
            ListingDetailView(listingId: id)
        case .listingCompose(let listingId):
            ListingComposerView(listingId: listingId)
        case .myListings:
            MyListingsView()
        case .listingFavorites:
            ListingFavoritesView()
        case .settings:
            SettingsView()
        case .privacySettings:
            PrivacySettingsView()
        case .changePassword:
            ChangePasswordView()
        case .blockedUsers:
            ModerationListView(kind: .blocked)
        case .mutedUsers:
            ModerationListView(kind: .muted)
        case .dataExport:
            DataExportView()
        case .deleteAccount:
            DeleteAccountView()
        case .languagePicker:
            LanguagePickerView()
        case .editProfile:
            EditProfileView()
        case .accountSettings:
            AccountSettingsView()
        case .emailPreferences:
            EmailPreferencesView()
        case .appeals:
            AppealsView()
        case .trustPassport(let username):
            TrustPassportView(username: username)
        case .bookmarks:
            BookmarksView()
        case .shorts(let startId):
            ShortsView(startId: startId)
        case .news:
            NewsView()
        case .newsArticle(let slug):
            NewsArticleView(slug: slug)
        case .explore:
            ExploreView()
        case .listingConversation(let partner, let draft):
            ConversationView(
                partner: partner,
                viewerId: session.currentUser?.id,
                initialDraft: draft
            )
        }
    }
}
