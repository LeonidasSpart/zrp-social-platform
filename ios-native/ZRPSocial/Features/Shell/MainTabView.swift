import SwiftUI

/// The signed-in app's root: a real tab bar over six independent
/// navigation stacks.
///
/// Before this existed the app rendered Home and nothing else, and every
/// other screen was reachable only through a toolbar overflow menu -
/// forty routes behind one avatar button. The tab bar is the primary
/// navigation now; the Home toolbar keeps only what has no tab of its own
/// (Music, Marketplace, Bookmarks, Settings).
struct MainTabView: View {

    @EnvironmentObject private var player: MusicPlayer
    @EnvironmentObject private var deepLinks: DeepLinkInbox
    @Environment(\.openURL) private var openURL

    @StateObject private var router = AppRouter()
    /// Lives here rather than in Home so the Notifications and Messages
    /// badges are the same two numbers wherever they are shown, refreshed
    /// once for the whole shell.
    @StateObject private var unread = UnreadBadgeViewModel()

    /// Also at shell level, and for the same reason: a call arrives
    /// while you are anywhere in the app, so a responder owned by the
    /// conversation view would only answer while you happened to be
    /// reading that one thread.
    @StateObject private var calls = IncomingCallResponder()

    var body: some View {
        TabView(selection: tabSelection) {
            ForEach(MainTab.allCases, id: \.self) { tab in
                content(for: tab)
                    .tabItem {
                        Label {
                            Text(tab.titleKey)
                        } icon: {
                            Image(systemName: tab.systemImage)
                        }
                    }
                    .badge(badgeCount(for: tab))
                    .tag(tab)
            }
        }
        .environmentObject(router)
        .environmentObject(unread)
        .fullScreenCover(isPresented: $player.isExpanded) {
            NowPlayingView()
        }
        .incomingCallNotice(calls)
        .task {
            calls.start()
            await unread.refresh()
            // A link that arrived before anyone was signed in has been
            // waiting; this is the first moment it has somewhere to go.
            consumePendingLink()
        }
        .onChange(of: deepLinks.pending) { _, url in
            guard url != nil else { return }
            consumePendingLink()
        }
        // Coming back to Messages or Notifications is the moment the
        // badge is most likely to be wrong, so the counts are refetched
        // then rather than only at launch.
        .onChange(of: router.selectedTab) { _, tab in
            guard tab == .messages || tab == .notifications else { return }
            Task { await unread.refresh() }
        }
        .onDisappear { calls.stop() }
    }

    /// Opens whatever link is waiting.
    ///
    /// A ZRP link the app has no screen for is handed to the system
    /// rather than swallowed: a page this app has not built yet should
    /// open on the web, not silently do nothing.
    private func consumePendingLink() {
        guard let url = deepLinks.take() else { return }
        if let target = DeepLink.target(for: url) {
            router.open(target)
        } else {
            openURL(url)
        }
    }

    /// Intercepts selection so Create can act as a button, and so tapping
    /// the current tab returns to the top of it - both standard iOS
    /// behaviours a plain `$selection` binding does not give.
    private var tabSelection: Binding<MainTab> {
        Binding(
            get: { router.selectedTab },
            set: { tapped in
                if tapped == .create {
                    router.requestCompose()
                } else if tapped == router.selectedTab {
                    router.popToRoot(tapped)
                } else {
                    router.selectedTab = tapped
                }
            }
        )
    }

    /// `0` renders no badge at all, which is what the tabs without counts
    /// want and what an all-read inbox wants too.
    private func badgeCount(for tab: MainTab) -> Int {
        switch tab {
        case .notifications: return unread.notificationCount
        case .messages: return unread.messageCount
        default: return 0
        }
    }

    @ViewBuilder
    private func content(for tab: MainTab) -> some View {
        switch tab {
        case .home:
            tabStack(tab) { HomeView() }
        case .search:
            tabStack(tab) { SearchView() }
        case .create:
            // Never displayed: the selection binding turns a tap on
            // Create into a compose request and keeps the current tab.
            // Deliberately empty rather than a second copy of Home,
            // which would put two navigation stacks on one path.
            Color.clear
        case .notifications:
            tabStack(tab) { NotificationsView() }
        case .messages:
            tabStack(tab) { MessagesListView() }
        case .profile:
            tabStack(tab) { CurrentUserProfileView() }
        }
    }

    private func tabStack<Content: View>(
        _ tab: MainTab,
        @ViewBuilder content: () -> Content
    ) -> some View {
        TabNavigationStack(navigator: router.navigator(for: tab), content: content())
    }
}

/// One tab's navigation stack.
///
/// Split out because the stack has to *observe* its navigator to redraw
/// when the path changes, and `@ObservedObject` needs a stored property.
private struct TabNavigationStack<Content: View>: View {

    @ObservedObject var navigator: Navigator

    let content: Content

    var body: some View {
        NavigationStack(path: $navigator.path) {
            content
                .navigationDestination(for: Route.self) { route in
                    RouteDestinationView(route: route)
                }
        }
        // Inside the stack, above the tab bar: the mini-player then
        // persists across every push within the tab, and sits clear of
        // both the tab bar and the home indicator. It draws nothing at
        // all until something is playing.
        .safeAreaInset(edge: .bottom, spacing: 0) {
            MiniPlayerView()
        }
        .environmentObject(navigator)
    }
}

/// The Profile tab: the signed-in viewer's own profile.
///
/// `ProfileView` is addressed by username, which the shell only has once
/// the session has resolved - this waits for it rather than pushing a
/// profile for an empty name.
private struct CurrentUserProfileView: View {

    @EnvironmentObject private var session: SessionController

    var body: some View {
        if let username = session.currentUser?.username {
            ProfileView(username: username)
        } else {
            TimelineStateView.loading()
                .background(ZrpColor.background.ignoresSafeArea())
        }
    }
}
