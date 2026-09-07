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
    case followList(username: String, kind: FollowListKind)
    case messages
    case conversation(partner: PostAuthor)
    case notifications
    case search
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

    func popToRoot() {
        path = NavigationPath()
    }
}
