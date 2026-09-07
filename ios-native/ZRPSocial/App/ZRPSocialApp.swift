import SwiftUI

@main
struct ZRPSocialApp: App {

    @StateObject private var session = SessionController()

    var body: some Scene {
        WindowGroup {
            RootView()
                .environmentObject(session)
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
