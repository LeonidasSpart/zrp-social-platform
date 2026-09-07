import SwiftUI

/// Spacing, sizing, and layout constants.
///
/// Centralised so spacing stays consistent across every screen and so a
/// density change is one edit rather than a sweep through views.
enum ZrpSpacing {
    static let xs: CGFloat = 4
    static let sm: CGFloat = 8
    static let md: CGFloat = 12
    static let lg: CGFloat = 16
    static let xl: CGFloat = 24
    static let xxl: CGFloat = 32
}

enum ZrpRadius {
    static let sm: CGFloat = 8
    static let md: CGFloat = 12
    static let lg: CGFloat = 16
    static let pill: CGFloat = 999
}

enum ZrpMetrics {
    /// Apple's Human Interface Guidelines minimum hit target. Every tap
    /// target in the app is padded to at least this, even where the
    /// visible glyph is smaller.
    static let minTouchTarget: CGFloat = 44

    /// Avatar sizes used across the app.
    static let avatarSmall: CGFloat = 32
    static let avatarMedium: CGFloat = 44
    static let avatarLarge: CGFloat = 80

    /// Reading width cap for the timeline on iPad and large landscape
    /// layouts. Without it a post stretches the full width of a 12.9"
    /// display and becomes genuinely hard to read - this is the same
    /// reason the web app constrains its own centre column.
    static let contentMaxWidth: CGFloat = 640
}
