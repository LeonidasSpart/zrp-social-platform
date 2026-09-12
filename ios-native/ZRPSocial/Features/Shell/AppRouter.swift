import SwiftUI

/// The four primary tabs, with Create between them.
///
/// The same five controls, in the same order, as the ZRP design
/// reference and the Android bottom bar: Home, Search, Create, Messages,
/// Profile.
///
/// Notifications is deliberately not among them. It was the sixth tab,
/// which left no room for Create to be anything but a peer icon, and
/// meanwhile ten whole feature areas - Music, Marketplace, Play,
/// Opportunity, Aid, News, Shorts, AI, Creator Studio, Bookmarks - were
/// hidden behind an overflow menu in Home's toolbar. Notifications now
/// has the bell on Home and its own row in the navigation menu, which is
/// two obvious ways to reach it rather than one crowded one.
enum MainTab: String, CaseIterable, Hashable {
    case home
    case search
    case create
    case messages
    case profile

    /// Create is a control, not a place: selecting it opens the composer
    /// and hands the tab bar straight back. Every other tab owns a
    /// navigation stack of its own.
    var hostsNavigationStack: Bool { self != .create }

    var titleKey: L10nKey {
        switch self {
        case .home: return .navHome
        case .search: return .navSearch
        // Android labels this tab with the same `action.post` string;
        // there is no separate "create" entry in the shared dictionary.
        case .create: return .actionPost
        case .messages: return .navMessages
        case .profile: return .navProfile
        }
    }

    var systemImage: String {
        switch self {
        case .home: return "house"
        case .search: return "magnifyingglass"
        case .create: return "plus"
        case .messages: return "envelope"
        case .profile: return "person"
        }
    }

    /// The filled counterpart, drawn for the tab you are on.
    ///
    /// Weight and colour alone carry the selected state at 20 points
    /// about as well as a 1px hairline does - the filled glyph is what
    /// makes it legible at a glance, and it is what iOS itself does.
    var selectedSystemImage: String {
        switch self {
        case .home: return "house.fill"
        case .search: return "magnifyingglass"
        case .create: return "plus"
        case .messages: return "envelope.fill"
        case .profile: return "person.fill"
        }
    }
}

/// Owns tab selection and one navigation stack per tab.
///
/// Each tab keeps a `Navigator` of its own, so their back stacks are
/// genuinely independent: opening a profile from Messages and then
/// tapping Home lands on the timeline, not on whatever the other tab was
/// showing. (Android shares a single flat graph across its tabs and
/// therefore cannot do this - see the audit's Home-navigation finding.)
///
/// It is also the single place anything outside the view tree can ask for
/// navigation: a notification tap, a universal link, a route restored at
/// launch. Those callers name a destination; the router decides which tab
/// owns it and pushes there.
@MainActor
final class AppRouter: ObservableObject {

    @Published var selectedTab: MainTab = .home

    /// Set when something asks to compose - the Create tab, or a caller
    /// outside the tab bar. Home owns the composer sheet so a new post
    /// lands in the timeline it was written for; Android does the same by
    /// returning to Home after posting.
    @Published var isComposing = false

    private let navigators: [MainTab: Navigator]

    init() {
        var made: [MainTab: Navigator] = [:]
        for tab in MainTab.allCases where tab.hostsNavigationStack {
            made[tab] = Navigator()
        }
        navigators = made
    }

    func navigator(for tab: MainTab) -> Navigator {
        // Every tab that hosts a stack got one in `init`. The fallback
        // exists only to keep this non-optional at the call site; it can
        // only be reached by asking for Create's stack, which has none.
        navigators[tab] ?? Navigator()
    }

    /// Switches to `tab` and pushes `route` onto that tab's stack.
    ///
    /// Used by tab selection itself and, later, by deep links and
    /// notification taps - all of which need exactly this: land in the
    /// right tab, then open the right screen inside it.
    func open(_ route: Route, in tab: MainTab = .home) {
        selectedTab = tab
        navigator(for: tab).push(route)
    }

    /// Opens what a deep link, or a notification, names.
    ///
    /// The tab is selected first and then popped to its root, so a link
    /// always lands on the thing it names rather than on top of whatever
    /// that tab happened to be showing.
    func open(_ target: DeepLinkTarget) {
        selectedTab = target.tab
        let navigator = navigator(for: target.tab)
        navigator.popToRoot()
        if let route = target.route {
            navigator.push(route)
        }
    }

    /// The iOS convention: tapping the tab you are already on returns to
    /// the top of that tab.
    func popToRoot(_ tab: MainTab) {
        navigator(for: tab).popToRoot()
    }

    /// What the navigation menu does when a row naming a *tab* is tapped.
    ///
    /// Selecting the tab you are already on returns to the top of it -
    /// the same rule as tapping its icon in the bottom bar, so the two
    /// controls never behave differently for the same destination.
    func selectTab(_ tab: MainTab) {
        if selectedTab == tab {
            popToRoot(tab)
        } else {
            selectedTab = tab
        }
    }

    /// What the navigation menu does when a row naming a *screen* is
    /// tapped.
    ///
    /// Lands on Home's stack, cleared first. The clearing is the point:
    /// the menu is a way of jumping across the app, and without it,
    /// opening Music then News then Marketplace would bury three screens
    /// behind each other and make Back a long walk home.
    func openFromMenu(_ route: Route) {
        selectedTab = .home
        let navigator = navigator(for: .home)
        navigator.popToRoot()
        navigator.push(route)
    }

    func requestCompose() {
        selectedTab = .home
        // Home owns the composer sheet. Asking for it in the same update
        // that brings Home on screen can drop the presentation, so the
        // request lands on the next turn of the loop - by which point
        // Home is mounted whichever tab the tap came from.
        Task { isComposing = true }
    }
}
