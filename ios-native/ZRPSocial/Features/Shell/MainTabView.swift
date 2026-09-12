import SwiftUI

/// The signed-in app.
///
/// Three pieces of chrome around four independent navigation stacks:
/// the navigation menu on the leading edge, a menu button and (on Home)
/// the ZRP mark and notifications bell along the top, and the five-item
/// bar along the bottom.
///
/// The bottom bar is drawn by `ZrpTabBar` rather than by `TabView`,
/// because Create is a button and not a tab - it opens the composer and
/// hands the current screen straight back - and the reference design
/// raises it into a red circle that a `tabItem` cannot produce. The
/// `TabView` underneath is kept for everything it is genuinely good at:
/// mounting each tab lazily, keeping four scroll positions and four back
/// stacks alive, and restoring them instantly.
struct MainTabView: View {

    @EnvironmentObject private var player: MusicPlayer
    @EnvironmentObject private var deepLinks: DeepLinkInbox
    @Environment(\.openURL) private var openURL

    @StateObject private var router = AppRouter()
    /// Lives here rather than in Home so the notifications and messages
    /// badges are the same two numbers wherever they are shown - the
    /// bell, the menu, the bar - refreshed once for the whole shell.
    @StateObject private var unread = UnreadBadgeViewModel()

    /// Also at shell level, and for the same reason: a call arrives
    /// while you are anywhere in the app, so a responder owned by the
    /// conversation view would only answer while you happened to be
    /// reading that one thread.
    @StateObject private var calls = IncomingCallResponder()

    @StateObject private var drawer = DrawerState()

    /// Presence is app-wide state, so the store is provided at the app
    /// root; the shell only starts and stops listening with the signed-in
    /// session.
    @EnvironmentObject private var presence: PresenceStore

    var body: some View {
        DrawerContainer {
            tabs
                .safeAreaInset(edge: .bottom, spacing: 0) {
                    VStack(spacing: 0) {
                        // Above the bar, below the content, and drawing
                        // nothing at all until something is playing. One
                        // instance for the whole shell rather than one
                        // per tab, so the controls do not rebuild on
                        // every tab change.
                        MiniPlayerView()
                        ZrpTabBar()
                    }
                }
        }
        .environmentObject(router)
        .environmentObject(unread)
        .environmentObject(drawer)
        .fullScreenCover(isPresented: $player.isExpanded) {
            NowPlayingView()
        }
        .incomingCallNotice(calls)
        .task {
            calls.start()
            presence.start()
            await unread.refresh()
            // A link that arrived before anyone was signed in has been
            // waiting; this is the first moment it has somewhere to go.
            consumePendingLink()
        }
        .onChange(of: deepLinks.pending) { _, url in
            guard url != nil else { return }
            consumePendingLink()
        }
        // Coming back to Messages is the moment its badge is most likely
        // to be wrong, so the counts are refetched then rather than only
        // at launch. Notifications does the same from its own screen.
        .onChange(of: router.selectedTab) { _, tab in
            guard tab == .messages else { return }
            Task { await unread.refresh() }
        }
        .onDisappear {
            calls.stop()
            presence.stop()
        }
    }

    private var tabs: some View {
        TabView(selection: $router.selectedTab) {
            ForEach(MainTab.allCases, id: \.self) { tab in
                content(for: tab)
                    // The system bar is replaced, not decorated: hiding
                    // it is what leaves room for `ZrpTabBar` and stops
                    // the two of them stacking.
                    .toolbar(.hidden, for: .tabBar)
                    .tag(tab)
            }
        }
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

    @ViewBuilder
    private func content(for tab: MainTab) -> some View {
        switch tab {
        case .home:
            tabStack(tab) {
                HomeView().zrpRootChrome(wordmark: true, bell: true)
            }
        case .search:
            tabStack(tab) { SearchView().zrpRootChrome() }
        case .create:
            // Never displayed: `ZrpTabBar` turns a tap on Create into a
            // compose request and never selects this tag. Deliberately
            // empty rather than a second copy of Home, which would put
            // two navigation stacks on one path.
            Color.clear
        case .messages:
            tabStack(tab) { MessagesListView().zrpRootChrome() }
        case .profile:
            tabStack(tab) { CurrentUserProfileView().zrpRootChrome() }
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
