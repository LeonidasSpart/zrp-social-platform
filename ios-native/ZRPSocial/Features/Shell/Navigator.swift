import SwiftUI

/// Everywhere the app can navigate to.
///
/// A single value type rather than scattered `NavigationLink`
/// destinations, because most pushes originate from places that cannot
/// hold a link: a hashtag inside an attributed string, a menu action, a
/// tap on a follower row. One enum means one `navigationDestination` and
/// one place to add a screen.
enum Route: Hashable {
    case profile(username: String)
    case hashtag(tag: String)
    case followList(username: String, kind: FollowListKind)
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
