import Foundation
import SwiftUI

/// The app's single string-lookup entry point.
///
/// Every user-facing string resolves through here, never through a
/// literal in a view. Keys are the compiler-checked `L10nKey` cases
/// generated from ZRP's own web translation dictionary, so iOS copy and
/// web copy cannot drift and a renamed key breaks the build rather than
/// rendering a raw key on screen.
///
/// ### Placeholders
/// ZRP's shared copy uses web-style `{name}` tokens (`"{n} saved"`,
/// `"{name} liked your post"`), not `printf` specifiers. Those are
/// substituted here rather than converted at generation time: converting
/// them to `%@`/`%d` would silently break any language whose grammar
/// reorders the tokens, because a positional specifier means something
/// different from a named one. Named tokens survive reordering intact.
enum L10n {

    /// Overrides the bundle strings are read from.
    ///
    /// `nil` (the default) means "follow the system language", which is
    /// what iOS does natively. Phase 17 adds the in-app language picker
    /// ZRP has on web by pointing this at a specific `.lproj` bundle;
    /// everything else in the app already goes through this type, so
    /// that change lands in one place.
    nonisolated(unsafe) private static var overrideBundle: Bundle?

    /// The language actually being used for lookups right now.
    static var activeLanguageCode: String {
        overrideBundle?.preferredLocalizations.first
            ?? Bundle.main.preferredLocalizations.first
            ?? "en"
    }

    /// True when the active language reads right-to-left. Views that
    /// need directional treatment beyond what SwiftUI's automatic
    /// mirroring gives them consult this.
    static var isRightToLeft: Bool {
        L10nKey.rightToLeftLanguageCodes.contains(
            String(activeLanguageCode.prefix(2))
        )
    }

    /// The locale that dates, numbers and currencies should format in.
    ///
    /// Not `Locale.current`: once someone picks a language in the app,
    /// iOS still reports the *system* locale, so a Turkish-speaking
    /// person on an English phone would read Turkish copy next to
    /// English month names. Formatters call this instead. It follows the
    /// system whenever no language has been chosen, which is the default.
    static var activeLocale: Locale {
        overrideBundle == nil ? .autoupdatingCurrent : Locale(identifier: activeLanguageCode)
    }

    /// Point lookups at a specific language bundle, or pass `nil` to
    /// return to the system language. Returns `false` if that language
    /// is not bundled, leaving the previous selection untouched.
    @discardableResult
    static func setLanguageOverride(_ code: String?) -> Bool {
        guard let code else {
            overrideBundle = nil
            return true
        }
        guard
            let path = Bundle.main.path(forResource: code, ofType: "lproj"),
            let bundle = Bundle(path: path)
        else {
            return false
        }
        overrideBundle = bundle
        return true
    }

    /// Look up `key` in the active language.
    static func string(_ key: L10nKey) -> String {
        guard let overrideBundle else {
            // No explicit in-app language chosen: `Bundle.main` carries
            // every shipped .lproj at once, so Foundation's own
            // resolution already cascades a key missing from the
            // system language to the app's development language (en)
            // before ever falling back to the raw key - exactly the
            // "honest fallback" Tools/ios-extra-strings.json documents
            // for the ios.* keys that have no translation yet.
            return Bundle.main.localizedString(forKey: key.rawValue, value: key.rawValue, table: nil)
        }

        // An explicit override (the in-app language picker) points this
        // at ONE single-language Bundle(path:) - unlike Bundle.main, it
        // has no other .lproj to fall back to, so a key missing from
        // that language alone would otherwise surface as the literal
        // dotted key string on screen (e.g. "ios.a11y.postOptions"),
        // which is worse than English: it isn't even a real word. Look
        // up with `value: nil` first (Foundation's own contract: returns
        // the key itself when not found) so a genuine miss can be
        // detected and retried against `Bundle.main`, restoring the same
        // development-language fallback the no-override path gets for
        // free.
        let overridden = overrideBundle.localizedString(forKey: key.rawValue, value: nil, table: nil)
        if overridden != key.rawValue {
            return overridden
        }
        return Bundle.main.localizedString(forKey: key.rawValue, value: key.rawValue, table: nil)
    }

    /// Look up `key` and substitute `{token}` placeholders.
    ///
    /// Unknown tokens in `arguments` are ignored, and a token present in
    /// the copy but absent from `arguments` is left as-is - both are
    /// preferable to trapping in front of a user.
    static func string(_ key: L10nKey, _ arguments: [String: String]) -> String {
        var result = string(key)
        for (token, replacement) in arguments {
            result = result.replacingOccurrences(of: "{\(token)}", with: replacement)
        }
        return result
    }
}

extension Text {
    /// `Text(.authSignIn)` - the idiomatic way to render localized copy.
    init(_ key: L10nKey) {
        self.init(verbatim: L10n.string(key))
    }

    init(_ key: L10nKey, _ arguments: [String: String]) {
        self.init(verbatim: L10n.string(key, arguments))
    }
}
