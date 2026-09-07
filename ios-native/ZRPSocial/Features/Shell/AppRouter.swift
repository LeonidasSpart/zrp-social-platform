import SwiftUI

/// The five primary tabs, plus Create.
///
/// The same information architecture the web header and the Android
/// bottom bar already use, so a person moving between ZRP clients finds
/// the same six controls in the same order.
enum MainTab: String, CaseIterable, Hashable {
    case home
    case search
    case create
    case notifications
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
        case .notifications: return .navNotifications
        case .messages: return .navMessages
        case .profile: return .navProfile
        }
    }

    var systemImage: String {
        switch self {
        case .home: return "house"
        case .search: return "magnifyingglass"
        case .create: return "plus.circle.fill"
        case .notifications: return "bell"
        case .messages: return "bubble.left.and.bubble.right"
        case .profile: return "person"
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

    func requestCompose() {
        selectedTab = .home
        // Home owns the composer sheet. Asking for it in the same update
        // that brings Home on screen can drop the presentation, so the
        // request lands on the next turn of the loop - by which point
        // Home is mounted whichever tab the tap came from.
        Task { isComposing = true }
    }
}
