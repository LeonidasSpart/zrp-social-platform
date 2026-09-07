import SwiftUI

/// The in-app language selection.
///
/// ZRP lets people choose a language on the web independently of their
/// browser, and this is the same control. It matters more on iOS than it
/// sounds: iOS otherwise offers only a per-app language in Settings, and
/// someone whose phone is in one language but who reads ZRP in another
/// has no way to say so from inside the app.
///
/// Changing the language has to rebuild the whole interface. Every string
/// resolves through `L10n`, which reads from a bundle chosen at call
/// time - so SwiftUI has no dependency to invalidate and would happily
/// keep showing the previous language until each view happened to
/// redraw. `RootView` keys its content on `rebuildToken`, which forces
/// one clean rebuild.
@MainActor
final class LanguageController: ObservableObject {

    /// The chosen language code, or `nil` for "follow the system".
    @Published private(set) var selection: String?

    /// Changes whenever the language does. Used as a view identity so the
    /// tree is rebuilt rather than partially refreshed.
    @Published private(set) var rebuildToken = UUID()

    /// Not in the Keychain: a language preference is not a secret, and
    /// it must be readable before any session exists so the sign-in
    /// screen is already in the right language.
    private static let defaultsKey = "zrp.language.override"

    private let defaults: UserDefaults

    init(defaults: UserDefaults = .standard) {
        self.defaults = defaults
        let stored = defaults.string(forKey: Self.defaultsKey)
        // Applied before the first view is built. A stored code that is
        // no longer bundled - a language removed from the web
        // dictionary, say - fails here and silently falls back to the
        // system language rather than leaving the app half-translated.
        if let stored, L10n.setLanguageOverride(stored) {
            selection = stored
        } else {
            if stored != nil { defaults.removeObject(forKey: Self.defaultsKey) }
            L10n.setLanguageOverride(nil)
            selection = nil
        }
    }

    /// The language currently in effect, whether chosen or inherited.
    var effectiveCode: String {
        selection ?? String(L10n.activeLanguageCode.prefix(2))
    }

    var isRightToLeft: Bool { L10n.isRightToLeft }

    /// Locale for `.environment(\.locale, …)`, so SwiftUI's own
    /// formatting agrees with what `L10n` reports.
    var locale: Locale { L10n.activeLocale }

    var layoutDirection: LayoutDirection { isRightToLeft ? .rightToLeft : .leftToRight }

    func select(_ code: String?) {
        guard code != selection else { return }
        guard L10n.setLanguageOverride(code) else { return }

        selection = code
        if let code {
            defaults.set(code, forKey: Self.defaultsKey)
        } else {
            defaults.removeObject(forKey: Self.defaultsKey)
        }
        rebuildToken = UUID()
    }
}
