import SwiftUI
import UIKit

/// The ZRP brand palette.
///
/// Mirrors the `zrp.*` values in the web app's `tailwind.config.js`
/// exactly. This is the single native source of truth for ZRP colour on
/// iOS, kept in sync by hand with the web values rather than generated -
/// there is no shared design-token pipeline between the frontends yet.
///
/// The dark values are the primary design target (ZRP's black/red brand
/// identity); light exists for users who prefer or default to system
/// light mode. Corrected from an earlier version of this comment that
/// claimed the web app *defaults* to dark - it doesn't: `ThemeContext.tsx`
/// defaults new visitors to light unless their OS reports
/// `prefers-color-scheme: dark`, with no server-side override. Every
/// semantic colour
/// below resolves through `UIColor(dynamicProvider:)` so a single
/// `Color` adapts to the trait collection - including inside sheets and
/// `UIKit`-hosted contexts where a SwiftUI `@Environment(\.colorScheme)`
/// check would not reach.
enum ZrpColor {

    // MARK: - Brand constants (identical in both appearances)

    static let red = Color(hex: 0xFF2D2D)
    static let darkRed = Color(hex: 0xB10000)
    static let blue = Color(hex: 0x3B82F6)
    static let blueDark = Color(hex: 0x1D4ED8)
    static let silver = Color(hex: 0xBDBDBD)

    /// Tailwind `green-500` - the website's repost/success accent
    /// (`PostCard.tsx` uses `text-green-500` for a reposted post). The one
    /// UI meaning ZRP's own palette does not already cover.
    static let green = Color(hex: 0x22C55E)

    /// Tailwind `yellow-500` - the website's "awaiting reply" state on a
    /// support ticket (`support/tickets/page.tsx` uses `text-yellow-500`).
    /// Same reasoning as `green`: a status colour the brand palette has no
    /// equivalent for, taken from the web rather than invented.
    static let amber = Color(hex: 0xEAB308)

    // MARK: - Semantic surfaces

    /// The page background behind everything.
    static let background = dynamic(light: 0xFFFFFF, dark: 0x050505)

    /// A card, row, or sheet sitting on `background`.
    static let surface = dynamic(light: 0xFFFFFF, dark: 0x0A0A0A)

    /// One elevation step above `surface` - menus, pressed states.
    static let surfaceElevated = dynamic(light: 0xF9FAFB, dark: 0x121212)

    /// Two steps up - the highest surface the app uses.
    static let surfaceHighest = dynamic(light: 0xF3F4F6, dark: 0x1A1A1A)

    /// Primary text.
    static let onSurface = dynamic(light: 0x0D0D0D, dark: 0xFFFFFF)

    /// Secondary text - handles, timestamps, counts.
    static let onSurfaceMuted = dynamic(light: 0x6B7280, dark: 0xBDBDBD)

    /// Hairline dividers and card borders.
    static let outline = dynamic(light: 0xE5E7EB, dark: 0x2E2E2E)

    /// A fainter divider, for separators inside an already-bordered card.
    static let outlineFaint = dynamic(light: 0xF3F4F6, dark: 0x1C1C1C)

    // MARK: -

    private static func dynamic(light: UInt32, dark: UInt32) -> Color {
        Color(uiColor: UIColor { traits in
            traits.userInterfaceStyle == .dark
                ? UIColor(rgb: dark)
                : UIColor(rgb: light)
        })
    }
}

extension Color {
    /// `Color(hex: 0xFF2D2D)` - opaque sRGB from a packed 24-bit value.
    init(hex: UInt32) {
        self.init(uiColor: UIColor(rgb: hex))
    }
}

extension UIColor {
    fileprivate convenience init(rgb: UInt32) {
        self.init(
            red: CGFloat((rgb >> 16) & 0xFF) / 255.0,
            green: CGFloat((rgb >> 8) & 0xFF) / 255.0,
            blue: CGFloat(rgb & 0xFF) / 255.0,
            alpha: 1.0
        )
    }
}
