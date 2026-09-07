import SwiftUI

/// The unfurled card for a link in a post.
///
/// Renders nothing at all until the route answers, and nothing ever if
/// it answers with no title and no image: the link itself is already
/// tappable in the post text, and an empty card would only look broken.
/// That is the website's rule too.
struct LinkPreviewCard: View {

    let url: String

    @State private var preview: LinkPreview?
    @Environment(\.openURL) private var openURL

    private let repository = LinkPreviewRepository()

    var body: some View {
        Group {
            if let preview, preview.isRenderable {
                card(preview)
            }
        }
        // Keyed on the URL so a recycled row in a lazy stack unfurls its
        // own link rather than keeping the previous row's card.
        .task(id: url) {
            preview = nil
            preview = try? await repository.preview(for: url)
        }
    }

    private func card(_ preview: LinkPreview) -> some View {
        Button {
            // Opened in the browser rather than an in-app web view, so
            // the address stays visible to the reader.
            if let target = URL(string: preview.url) { openURL(target) }
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
