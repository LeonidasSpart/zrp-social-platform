import SwiftUI

/// The badge shown next to a verified account's name.
///
/// The five badge kinds, their exact colours, and their labels are ported
/// verbatim from the web app's own `src/components/VerifiedBadge.tsx`, so
/// an account that reads as ZRP staff on the website reads as ZRP staff
/// here. An unrecognised `badgeType` renders nothing at all, exactly as
/// the web component returns `null` - a badge is a trust signal, and
/// inventing a style for an unknown value would be inventing trust.
struct VerifiedBadge: View {

    let badgeType: String?
    var size: CGFloat = 14

    private struct Style {
        let color: Color
        let systemImage: String
        let label: L10nKey
    }

    private var style: Style? {
        switch badgeType {
        case "verified":
            return Style(color: Color(hex: 0x3B82F6), systemImage: "checkmark.seal.fill", label: .iosBadgeVerified)
        case "organization":
            return Style(color: Color(hex: 0xFFD700), systemImage: "checkmark.seal.fill", label: .iosBadgeOrganization)
        case "government":
            return Style(color: Color(hex: 0x9CA3AF), systemImage: "checkmark.seal.fill", label: .iosBadgeGovernment)
        case "team":
            return Style(color: Color(hex: 0xEF4444), systemImage: "checkmark.seal.fill", label: .iosBadgeTeam)
        case "journalist":
            // ZRP brand red, but a distinct newspaper glyph so it is never
            // visually confused with the "team" staff badge - the same
            // reasoning the web component documents.
            return Style(color: Color(hex: 0xFF2D2D), systemImage: "newspaper.fill", label: .iosBadgeJournalist)
        default:
            return nil
        }
    }

    var body: some View {
        if let style {
            Image(systemName: style.systemImage)
                .font(.system(size: size))
                .foregroundStyle(style.color)
                .accessibilityLabel(Text(style.label))
        }
    }
}
