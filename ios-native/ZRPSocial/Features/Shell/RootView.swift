import SwiftUI

/// Decides what the app shows: the launch state, sign-in, or the app
/// itself. The single place auth state turns into navigation.
struct RootView: View {

    @EnvironmentObject private var session: SessionController
    @EnvironmentObject private var interactions: PostInteractionStore
    @EnvironmentObject private var musicLikes: MusicLikeStore
    @EnvironmentObject private var player: MusicPlayer

    var body: some View {
        Group {
            switch session.state {
            case .restoring:
                launchState
            case .signedOut:
                LoginView()
                    .transition(.opacity)
            case .signedIn:
                // `onboardingCompleted` lives on the user row, so it
                // follows the account across devices and reinstalls
                // rather than being a local flag this app could get
                // wrong. Someone who finished onboarding on the web
                // never sees it here.
                if session.currentUser?.onboardingCompleted == false {
                    OnboardingView()
                        .transition(.opacity)
                } else {
                    SignedInView()
                        .transition(.opacity)
                }
            }
        }
        .animation(.easeInOut(duration: 0.2), value: session.state)
        // Signing out - or a session the server has revoked, which lands
        // in the same state - has to leave nothing of the previous viewer
        // behind for whoever signs in next on this device.
        .onChange(of: session.state) { _, newState in
            guard newState == .signedOut else { return }
            interactions.clear()
            musicLikes.clear()
            player.reset()
        }
        .task {
            // Runs once per launch. Verifies any stored token against the
            // real session endpoint before showing signed-in UI, so a
            // revoked or outlived session never produces an app that looks
            // authenticated and then fails every request.
            await session.restore()
        }
    }

    private var launchState: some View {
        ZStack {
            ZrpColor.background.ignoresSafeArea()
            Image("ZrpLogo")
                .resizable()
                .scaledToFit()
                .frame(width: 96, height: 96)
        }
        .accessibilityHidden(true)
    }
}

/// The signed-in app.
///
/// Home is the only destination that exists today, so this is
/// deliberately *not* a `TabView`. A tab bar whose Search, Notifications,
/// Messages, and Profile tabs all opened empty screens would be four dead
/// controls; those tabs appear in the phases that make them real (see
/// ios-native/PARITY.md).
struct SignedInView: View {

    @EnvironmentObject private var player: MusicPlayer

    var body: some View {
        HomeView()
            // The mini-player is anchored outside the navigation stack so
            // it persists across every push - that is what makes it a
            // *persistent* player rather than one screen's control. It
            // renders nothing at all until something is playing.
            .safeAreaInset(edge: .bottom, spacing: 0) {
                MiniPlayerView()
            }
            .fullScreenCover(isPresented: $player.isExpanded) {
                NowPlayingView()
            }
    }
}
