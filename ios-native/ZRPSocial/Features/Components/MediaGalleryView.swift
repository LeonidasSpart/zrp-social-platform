import SwiftUI

/// What the full-screen viewer was opened on.
struct MediaPresentation: Identifiable, Equatable {
    let id = UUID()
    let urls: [String]
    let isVideo: Bool
    let startIndex: Int
}

/// A post's attached media.
///
/// Handles the three real shapes the API produces: a single image, a
/// multi-image gallery (`imageUrls`), and a video. Which one a post is
/// comes from `PostMedia`, ported from the web app's own heuristic so the
/// two clients never disagree about whether something is a video.
struct MediaGalleryView: View {

    let imageURLs: [String]
    let isVideo: Bool

    /// Whether this post's media is a GIF. Decided by `PostMedia`, the
    /// same heuristic the website uses, and passed in rather than
    /// re-derived here so a gallery and its card never disagree.
    var isGif: Bool = false

    var cornerRadius: CGFloat = ZrpRadius.md

    @State private var page = 0
    @State private var presentation: MediaPresentation?

    var body: some View {
        content
            .fullScreenCover(item: $presentation) { item in
                FullScreenMediaView(
                    urls: item.urls,
                    isVideo: item.isVideo,
                    startIndex: item.startIndex
                )
            }
    }

    @ViewBuilder
    private var content: some View {
        if imageURLs.isEmpty {
            EmptyView()
        } else if isVideo, let first = imageURLs.first {
            videoPoster(url: first)
        } else if imageURLs.count == 1 {
            imageButton(url: imageURLs[0], index: 0)
        } else {
            gallery
        }
    }

    // MARK: -

    private var gallery: some View {
        VStack(spacing: ZrpSpacing.sm) {
            TabView(selection: $page) {
                ForEach(Array(imageURLs.enumerated()), id: \.offset) { index, url in
                    imageButton(url: url, index: index).tag(index)
                }
            }
            .tabViewStyle(.page(indexDisplayMode: .never))
            .aspectRatio(4.0 / 3.0, contentMode: .fit)

            // A custom indicator rather than the built-in dots, which sit
            // inside the image and vanish against a light photo.
            HStack(spacing: ZrpSpacing.xs) {
                ForEach(imageURLs.indices, id: \.self) { index in
                    Capsule()
                        .fill(index == page ? ZrpColor.red : ZrpColor.outline)
                        .frame(width: index == page ? 16 : 6, height: 6)
                }
            }
            .animation(.easeInOut(duration: 0.2), value: page)
            .accessibilityElement()
            .accessibilityLabel(
                Text(.iosA11yImageCount, [
                    "index": "\(page + 1)",
                    "total": "\(imageURLs.count)",
                ])
            )
        }
    }

    private func imageButton(url: String, index: Int) -> some View {
        Button {
            presentation = MediaPresentation(
                urls: imageURLs,
                isVideo: false,
                startIndex: index
            )
        } label: {
            // The feed's heaviest images. Downsampled to roughly the
            // card's own height rather than decoded at the 4032px the
            // camera produced - the single biggest memory saving in a
            // scrolling timeline.
            Group {
                if isGif {
                    // A GIF is decoded whole and played, not downsampled
                    // to a still - the animation IS the content.
                    AnimatedImage(url: url, fallbackTargetSize: 320)
                } else {
                    RemoteImage(url: url, targetSize: 320) {
                        placeholder(systemImage: "photo")
                    }
                    .scaledToFill()
                }
            }
            .frame(maxWidth: .infinity)
            .aspectRatio(4.0 / 3.0, contentMode: .fill)
            .clipped()
            .clipShape(RoundedRectangle(cornerRadius: cornerRadius, style: .continuous))
        }
        .buttonStyle(.plain)
    }

    private func videoPoster(url: String) -> some View {
        Button {
            presentation = MediaPresentation(urls: [url], isVideo: true, startIndex: 0)
        } label: {
            ZStack {
                ZrpColor.surfaceHighest
                Image(systemName: "play.circle.fill")
                    .font(.system(size: 56))
                    .foregroundStyle(.white.opacity(0.9))
                    .shadow(radius: 8)
            }
            .frame(maxWidth: .infinity)
            .aspectRatio(16.0 / 9.0, contentMode: .fit)
            .clipShape(RoundedRectangle(cornerRadius: cornerRadius, style: .continuous))
        }
        .buttonStyle(.plain)
        .accessibilityLabel(Text(.iosA11yPlayVideo))
    }

    private func placeholder(systemImage: String) -> some View {
        ZStack {
            ZrpColor.surfaceElevated
            Image(systemName: systemImage)
                .font(.title)
                .foregroundStyle(ZrpColor.onSurfaceMuted)
        }
    }
}
