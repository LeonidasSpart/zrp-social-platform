import SwiftUI

/// A user's avatar, with a real initials fallback for accounts that have
/// none - the same treatment the web app gives them.
struct AvatarView: View {

    let url: String?
    let displayName: String
    var size: CGFloat = ZrpMetrics.avatarMedium

    var body: some View {
        Group {
            if let url, let parsed = URL(string: url), !url.isEmpty {
                AsyncImage(url: parsed) { phase in
                    switch phase {
                    case .success(let image):
                        image.resizable().scaledToFill()
                    case .failure:
                        // A broken avatar URL falls back to initials
                        // rather than an empty grey box.
                        initials
                    case .empty:
                        ZrpColor.surfaceHighest
                    @unknown default:
                        initials
                    }
                }
            } else {
                initials
            }
        }
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
