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
                // The welcome screen, not the sign-in form. `LoginView`
                // and `RegisterView` are unchanged and still do all the
                // real work; this simply stops the app opening on an
                // empty password field.
                WelcomeView()
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

/// The signed-in app: the tab shell.
///
/// Rebuilt from scratch on each sign-in, which is what discards the
/// previous viewer's tab selection and navigation stacks along with their
/// data.
struct SignedInView: View {
    var body: some View {
        MainTabView()
    }
}
