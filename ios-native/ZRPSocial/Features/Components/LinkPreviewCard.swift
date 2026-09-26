import SwiftUI

/// The unfurled card for a link in a post or a chat message.
///
/// Shows a greyed placeholder of the card's own shape while the route
/// answers, so the row does not jump when the preview lands, and nothing
/// at all if it answers with no title and no image: the link itself is
/// already tappable in the text, and an empty card would only look
/// broken. Both are the website's own `LinkPreviewCard.tsx` rules.
struct LinkPreviewCard: View {

    let url: String

    /// Called instead of opening the browser when the unfurled link is
    /// a zrp.one page this app has a screen for. Leaving the app to read
    /// a ZRP post in Safari - signed out - is not what anyone tapping a
    /// ZRP link inside ZRP wants. Hosts without a navigator pass
    /// nothing and every link opens externally.
    var onZrpLink: ((Route) -> Void)?

    @State private var phase: Phase = .loading
    @Environment(\.openURL) private var openURL

    private let repository = LinkPreviewRepository()

    private enum Phase: Equatable {
        case loading
        case loaded(LinkPreview)
        /// The route could not be reached, or read nothing worth
        /// showing. Draws nothing, as on the website.
        case failed
    }

    var body: some View {
        Group {
            switch phase {
            case .loading:
                skeleton
            case .loaded(let preview):
                card(preview)
            case .failed:
                EmptyView()
            }
        }
        // Keyed on the URL so a recycled row in a lazy stack unfurls its
        // own link rather than keeping the previous row's card.
        .task(id: url) {
            phase = .loading
            do {
                let preview = try await repository.preview(for: url)
                phase = preview.isRenderable ? .loaded(preview) : .failed
            } catch ApiError.cancelled {
                return
            } catch {
                phase = .failed
            }
        }
    }

    private func open(_ preview: LinkPreview) {
        guard let target = URL(string: preview.url) else { return }
        // A ZRP page opens in-app when the app has that screen; any
        // other link - including App Store links, which the system
        // hands to the App Store - opens outside, so the address stays
        // visible to the reader.
        if let onZrpLink, let route = DeepLink.target(for: target)?.route {
            onZrpLink(route)
            return
        }
        openURL(target)
    }

    /// The card's own proportions in grey. Announced as loading, not
    /// left as unlabelled shapes.
    private var skeleton: some View {
        VStack(alignment: .leading, spacing: ZrpSpacing.xs) {
            RoundedRectangle(cornerRadius: 4)
                .fill(ZrpColor.surfaceHighest)
                .frame(width: 96, height: 10)
            RoundedRectangle(cornerRadius: 4)
                .fill(ZrpColor.surfaceHighest)
                .frame(maxWidth: .infinity)
                .frame(height: 14)
            RoundedRectangle(cornerRadius: 4)
                .fill(ZrpColor.surfaceHighest)
                .frame(width: 180, height: 12)
        }
        .padding(ZrpSpacing.md)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(ZrpColor.surfaceElevated)
        .clipShape(RoundedRectangle(cornerRadius: ZrpRadius.md, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: ZrpRadius.md, style: .continuous)
                .strokeBorder(ZrpColor.outline, lineWidth: 1)
        )
        .accessibilityLabel(Text(.actionLoading))
    }

    private func card(_ preview: LinkPreview) -> some View {
        Button {
            open(preview)
        } label: {
            VStack(alignment: .leading, spacing: 0) {
                if let image = preview.image, !image.isEmpty {
                    RemoteImage(url: image, targetSize: 640) {
                        Rectangle().fill(ZrpColor.surfaceHighest)
                    }
                    .aspectRatio(contentMode: .fill)
                    .frame(maxWidth: .infinity)
                    .frame(height: 180)
                    .clipped()
                        .overlay(alignment: .center) {
                            if preview.isVideo {
                                Image(systemName: "play.circle.fill")
                                    .font(.largeTitle)
                                    .foregroundStyle(.white)
                                    .shadow(radius: 4)
                            }
                        }
                }

                VStack(alignment: .leading, spacing: ZrpSpacing.xs) {
                    if !preview.domain.isEmpty {
                        Text(verbatim: preview.domain)
                            .font(.caption)
                            .foregroundStyle(ZrpColor.onSurfaceMuted)
                    }
                    if let title = preview.title, !title.isEmpty {
                        Text(verbatim: title)
                            .font(.subheadline.weight(.semibold))
                            .foregroundStyle(ZrpColor.onSurface)
                            .lineLimit(2)
                            .multilineTextAlignment(.leading)
                    }
                    if let description = preview.description, !description.isEmpty {
                        Text(verbatim: description)
                            .font(.footnote)
                            .foregroundStyle(ZrpColor.onSurfaceMuted)
                            .lineLimit(2)
                            .multilineTextAlignment(.leading)
                    }
                }
                .padding(ZrpSpacing.md)
                .frame(maxWidth: .infinity, alignment: .leading)
            }
            .background(ZrpColor.surfaceHighest)
            .clipShape(RoundedRectangle(cornerRadius: ZrpRadius.md, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: ZrpRadius.md, style: .continuous)
                    .strokeBorder(ZrpColor.outline, lineWidth: 1)
            )
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityElement(children: .combine)
        .accessibilityAddTraits(.isLink)
    }
}
