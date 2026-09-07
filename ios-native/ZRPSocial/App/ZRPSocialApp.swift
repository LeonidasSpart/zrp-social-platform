import SwiftUI

@main
struct ZRPSocialApp: App {

    @StateObject private var session = SessionController()

    /// One app-wide record of the viewer's relationship to every post
    /// they have seen. Shared so a like in the Home feed shows as a like
    /// on the author's profile and in a hashtag timeline, without those
    /// screens knowing about each other.
    @StateObject private var interactions = PostInteractionStore()

    /// One audio engine for the whole app. Owned here rather than by a
    /// screen so playback survives navigation, and so the mini-player and
    /// the lock screen are driven by the same state.
    @StateObject private var musicPlayer = MusicPlayer()

    var body: some Scene {
        WindowGroup {
            RootView()
                .environmentObject(session)
                .environmentObject(interactions)
                .environmentObject(musicPlayer)
                // ZRP is a dark-first product on web and on Android. The
                // light palette is fully defined and correct, so the app
                // follows the system setting rather than forcing dark -
                // but every colour is defined for both, which is what
                // makes that safe.
                .tint(ZrpColor.red)
                // Layout direction is deliberately not forced here. iOS
                // already mirrors the interface for Arabic from the app's
                // active localization, and overriding it would fight that.
                // It becomes necessary only in Phase 17, when the in-app
                // language picker can select a language the system did not
                // - `L10n.isRightToLeft` exists for exactly that moment.
        }
    }
}
