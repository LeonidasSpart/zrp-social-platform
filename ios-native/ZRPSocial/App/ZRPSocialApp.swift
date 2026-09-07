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

    /// The music counterpart of `interactions`: which tracks the viewer
    /// has liked, shared across every screen that shows a track row.
    @StateObject private var musicLikes = MusicLikeStore()

    /// Owns the in-app language choice. Constructed before any view, so
    /// the very first screen - including sign-in - is already in the
    /// chosen language rather than flashing the system one.
    @StateObject private var language = LanguageController()

    /// Decides which video in a timeline plays, and owns the single
    /// player that plays it - see `FeedVideoCoordinator`. App-wide so
    /// scrolling from one timeline to another cannot leave two videos
    /// running.
    @StateObject private var feedVideos = FeedVideoCoordinator()

    var body: some Scene {
        WindowGroup {
            RootView()
                .environmentObject(session)
                .environmentObject(interactions)
                .environmentObject(musicPlayer)
                .environmentObject(musicLikes)
                .environmentObject(language)
                .environmentObject(feedVideos)
                // Rebuilt outright when the language changes. Strings
                // resolve through L10n at call time, so SwiftUI has no
                // dependency to invalidate and would otherwise keep
                // showing the previous language until each view happened
                // to redraw.
                .id(language.rebuildToken)
                // iOS mirrors the interface for a right-to-left *system*
                // language on its own, but not for one chosen inside the
                // app - so the direction is set explicitly, and the
                // locale with it so dates and numbers agree with the copy.
                .environment(\.locale, language.locale)
                .environment(\.layoutDirection, language.layoutDirection)
                // ZRP is a dark-first product on web and on Android. The
                // light palette is fully defined and correct, so the app
                // follows the system setting rather than forcing dark -
                // but every colour is defined for both, which is what
                // makes that safe.
                .tint(ZrpColor.red)

        }
    }
}
