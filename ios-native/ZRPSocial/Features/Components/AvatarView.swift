import SwiftUI

/// A user's avatar, with a real initials fallback for accounts that have
/// none - the same treatment the web app gives them.
struct AvatarView: View {

    let url: String?
    let displayName: String
    var size: CGFloat = ZrpMetrics.avatarMedium

    var body: some View {
        // `RemoteImage` resolves a nil or empty URL to its placeholder
        // itself, so there is no outer branch here - one path, one
        // fallback, and initials whether the URL is missing or broken.
        RemoteImage(url: url, targetSize: size) { initials }
            .scaledToFill()
            .frame(width: size, height: size)
            .clipShape(Circle())
            .overlay(Circle().strokeBorder(ZrpColor.outline, lineWidth: 0.5))
            .accessibilityLabel(Text(.iosA11yAvatarOf, ["name": displayName]))
    }

    private var initials: some View {
        ZStack {
            ZrpColor.surfaceHighest
            Text(verbatim: initialsText)
                .font(.system(size: size * 0.4, weight: .semibold))
                .foregroundStyle(ZrpColor.onSurfaceMuted)
        }
    }

    private var initialsText: String {
        let parts = displayName
            .split(separator: " ")
            .prefix(2)
            .compactMap { $0.first }
        return parts.isEmpty ? "?" : String(parts).uppercased()
    }
}
