import SwiftUI

/// A group's avatar, falling back to its initials.
///
/// Separate from `AvatarView` because the fallback differs in a way that
/// matters: a person's placeholder is derived from a name that always
/// exists, while a group's name is nullable in the schema and its
/// avatar is optional. This renders a neutral group glyph rather than a
/// letter when there is nothing to take initials from - a lone "?" in a
/// circle reads as an error, not as a group.
struct GroupAvatarView: View {

    let url: String?
    let name: String?
    var size: CGFloat = ZrpMetrics.avatarMedium

    var body: some View {
        // `RemoteImage` resolves a nil or empty URL to its placeholder
        // itself, so there is one path here rather than an outer branch.
        RemoteImage(url: url, targetSize: size) { placeholder }
            .aspectRatio(contentMode: .fill)
            .frame(width: size, height: size)
            .clipShape(Circle())
            // The image carries no information the row does not already
            // state in text, so it is not announced twice.
            .accessibilityHidden(true)
    }

    private var placeholder: some View {
        Circle()
            .fill(ZrpColor.surfaceElevated)
            .overlay {
                if let initials, !initials.isEmpty {
                    Text(verbatim: initials)
                        .font(.system(size: size * 0.4, weight: .semibold))
                        .foregroundStyle(ZrpColor.onSurfaceMuted)
                } else {
                    Image(systemName: "person.2.fill")
                        .font(.system(size: size * 0.4))
                        .foregroundStyle(ZrpColor.onSurfaceMuted)
                }
            }
    }

    /// Up to two initials from the group's name.
    ///
    /// Built from `Character`s rather than `String` slicing so a name
    /// starting with an emoji or a combining mark - both common in group
    /// names - yields one whole grapheme instead of half of one.
    private var initials: String? {
        guard let name = name?.trimmingCharacters(in: .whitespacesAndNewlines),
              !name.isEmpty
        else { return nil }
        let words = name.split(separator: " ").prefix(2)
        let letters = words.compactMap { $0.first }
        return letters.isEmpty ? nil : String(letters).uppercased()
    }
}
