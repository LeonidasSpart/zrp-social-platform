import SwiftUI

/// Everywhere the app can navigate to.
///
/// A single value type rather than scattered `NavigationLink`
/// destinations, because most pushes originate from places that cannot
/// hold a link: a hashtag inside an attributed string, a menu action, a
/// tap on a follower row. One enum means one `navigationDestination` and
/// one place to add a screen.
enum Route: Hashable {
    /// The post is carried along when the caller already has it - opening
    /// a post from a timeline then renders immediately and refreshes
    /// underneath, instead of showing a spinner over data the app is
    /// already holding. `nil` when arriving from somewhere that only
    /// knows the id, such as a deep link.
    case postDetail(postId: String, preloaded: Post?)
    case profile(username: String)
    case hashtag(tag: String)
    case userList(UserListSource)
    /// The posts that quote one post. Its own screen rather than a
    /// tab, because a post can be quoted from anywhere and the list
    /// is reached from the post itself.
    case postQuotes(postId: String)
    case messages
    case conversation(partner: PostAuthor)
    case notifications
    case search
    case music
    case musicDiscover
    case musicArtists
    case musicAlbums
    case musicPlaylists
    case musicArtist(id: String)
    case musicAlbum(id: String)
    case musicPlaylist(id: String)
    case musicLiked
    case musicHistory
    case musicQueue
    case musicStudio
    case marketplace
    case listingDetail(id: String)
    case listingCompose(listingId: String?)
    case myListings
    case listingFavorites
    /// A conversation opened from a listing, carrying the pre-filled
    /// opening message. Separate from `conversation` because the draft is
    /// part of what identifies this destination - pushing the same
    /// partner from a listing and from the inbox are different screens.
    case listingConversation(partner: PostAuthor, draft: String)
    case settings
    case privacySettings
    case changePassword
    case blockedUsers
    case mutedUsers
    case dataExport
    case deleteAccount
    case languagePicker
    case editProfile
    case accountSettings
    case emailPreferences
}

/// Owns the navigation stack's path.
///
/// Injected rather than passed down, so a view nested several levels deep
/// (a post card inside a profile inside a follower list) can push without
/// every intermediate view forwarding a closure it does not care about.
@MainActor
final class Navigator: ObservableObject {

    @Published var path = NavigationPath()

    func push(_ route: Route) {
        path.append(route)
    }

    /// Goes back one screen. Used where an action removes the thing the
    /// current screen is showing - deleting a listing, for instance -
    /// and staying on it would leave a view of something gone.
    func pop() {
        guard !path.isEmpty else { return }
        path.removeLast()
    }

    func popToRoot() {
        path = NavigationPath()
    }
}
