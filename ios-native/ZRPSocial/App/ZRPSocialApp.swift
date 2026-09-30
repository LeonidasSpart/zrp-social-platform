import SwiftUI

@main
struct ZRPSocialApp: App {

    /// Bridges the Apple callbacks pure SwiftUI has no hook for (APNs,
    /// notification taps, PushKit/CallKit - see `AppDelegate`'s own doc
    /// comment). Constructed by SwiftUI itself; `.task` below attaches
    /// this struct's own `@StateObject`s to it once they exist.
    @UIApplicationDelegateAdaptor(AppDelegate.self) private var appDelegate

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

    /// Holds an incoming universal link until there is a signed-in shell
    /// to open it in - a link can arrive at launch, mid-restore, or with
    /// nobody signed in at all.
    @StateObject private var deepLinks = DeepLinkInbox()
    @StateObject private var presence = PresenceStore()

    /// Owned here now, not by `MainTabView` - a call arrives while you
    /// are anywhere in the app (matching the Android sibling's
    /// Activity-scoped instance and the website's app-root
    /// `CallContext`), and now also needs to be reachable the moment a
    /// PushKit VoIP push wakes this app, which can happen before
    /// `MainTabView` has ever been built. `MainTabView`'s own `.task`/
    /// `.onDisappear` still own connecting/disconnecting the signaling
    /// socket - only WHERE this object lives moved, not its lifecycle.
    @StateObject private var calls = CallViewModel()

    var body: some Scene {
        WindowGroup {
            RootView()
                .environmentObject(session)
                .environmentObject(interactions)
                .environmentObject(musicPlayer)
                .environmentObject(musicLikes)
                .environmentObject(language)
                .environmentObject(feedVideos)
                .environmentObject(deepLinks)
                .environmentObject(presence)
                .environmentObject(calls)
                .environmentObject(appDelegate.pushCoordinator)
                .onOpenURL { url in deepLinks.receive(url) }
                // Wires this struct's own @StateObjects into the two
                // AppDelegate-owned coordinators, which were constructed
                // before any of these existed (see AppDelegate's own doc
                // comment). Runs once per launch; safe to call every time
                // regardless, both attach() methods are idempotent.
                .task {
                    appDelegate.pushCoordinator.attach(
                        deepLinks: deepLinks,
                        isSignedIn: { session.currentUser != nil }
                    )
                    appDelegate.voipPushCoordinator.attach(
                        callViewModel: calls,
                        isSignedIn: { session.currentUser != nil },
                        connectSocket: { calls.connectSignaling() }
                    )
                    session.unregisterPushTokens = {
                        await appDelegate.pushCoordinator.unregisterCurrentToken()
                        await appDelegate.voipPushCoordinator.unregisterCurrentToken()
                    }
                }
                .onChange(of: session.currentUser?.id) { _, newValue in
                    guard newValue != nil else { return }
                    // A token that arrived before sign-in, or a fresh
                    // sign-in on a device that already had one, both
                    // reach the backend from here.
                    Task { await appDelegate.pushCoordinator.registerPendingTokenIfNeeded() }
                    Task { await appDelegate.voipPushCoordinator.registerPendingTokenIfNeeded() }
                }
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
