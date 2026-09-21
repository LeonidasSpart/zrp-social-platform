import SwiftUI

/// The empty-list presentation shared by the admin screens.
///
/// Deliberately its own tiny view rather than reusing
/// `TimelineStateView.empty(systemImage:title:subtitle:)`: that helper
/// takes an `L10nKey`, and the admin console's copy is English-only (see
/// `AdminHomeView`'s doc comment on why) - reusing an existing key here
/// would mean either fabricating a translation this file never actually
/// has, or borrowing a key whose real meaning is a different screen's
/// empty state entirely.
struct AdminEmptyState: View {

    let systemImage: String
    let title: String
    var subtitle: String? = nil

    var body: some View {
        VStack(spacing: ZrpSpacing.md) {
            Image(systemName: systemImage)
                .font(.largeTitle)
                .foregroundStyle(ZrpColor.onSurfaceMuted)
            Text(verbatim: title)
                .font(.headline)
                .foregroundStyle(ZrpColor.onSurface)
            if let subtitle {
                Text(verbatim: subtitle)
                    .font(.subheadline)
                    .foregroundStyle(ZrpColor.onSurfaceMuted)
                    .multilineTextAlignment(.center)
            }
        }
        .padding(ZrpSpacing.xl)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
}
