import ImageIO
import SwiftUI
import UIKit
import UniformTypeIdentifiers

/// A small preview of a local attachment.
///
/// Decodes a downsampled thumbnail off the main thread rather than
/// calling `UIImage(contentsOfFile:)` inline. A photo from a modern
/// camera is tens of megapixels; decoding one at full size on the main
/// thread to draw it at 56 points would drop frames and hold far more
/// memory than the view needs - and a composer can hold several at once.
struct AttachmentThumbnail: View {

    let fileURL: URL?
    let remoteURL: String?
    let isVideo: Bool
    var side: CGFloat = 56

    @State private var image: UIImage?

    var body: some View {
        Group {
            if let remoteURL, let url = URL(string: remoteURL) {
                AsyncImage(url: url) { phase in
                    if case .success(let image) = phase {
                        image.resizable().scaledToFill()
                    } else {
                        placeholder
                    }
                }
            } else if let image {
                Image(uiImage: image).resizable().scaledToFill()
            } else {
                placeholder
            }
        }
        .frame(width: side, height: side)
        .clipped()
        .clipShape(RoundedRectangle(cornerRadius: ZrpRadius.sm, style: .continuous))
        .accessibilityHidden(true)
        .task(id: fileURL) { await loadThumbnail() }
    }

    private var placeholder: some View {
        ZStack {
            ZrpColor.surfaceHighest
            Image(systemName: isVideo ? "film" : "photo")
                .foregroundStyle(ZrpColor.onSurfaceMuted)
        }
    }

    private func loadThumbnail() async {
        guard image == nil, remoteURL == nil, let fileURL else { return }

        // Videos are left as the film placeholder: pulling a frame needs
        // AVAssetImageGenerator, which is a real decode of the movie for a
        // 56-point preview the composer does not depend on.
        guard !isVideo else { return }

        let pixelSize = Int(side * (UIScreen.main.scale))
        let decoded = await Task.detached(priority: .userInitiated) { () -> UIImage? in
            guard let source = CGImageSourceCreateWithURL(fileURL as CFURL, nil) else {
                return nil
            }
            let options: [CFString: Any] = [
                kCGImageSourceCreateThumbnailFromImageAlways: true,
                kCGImageSourceCreateThumbnailWithTransform: true,
                kCGImageSourceShouldCacheImmediately: true,
                kCGImageSourceThumbnailMaxPixelSize: pixelSize,
            ]
            guard
                let thumbnail = CGImageSourceCreateThumbnailAtIndex(
                    source, 0, options as CFDictionary
                )
            else {
                return nil
            }
            return UIImage(cgImage: thumbnail)
        }.value

        image = decoded
    }
}
