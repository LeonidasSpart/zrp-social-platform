import ImageIO
import SwiftUI
import UIKit

/// Loads and downsamples a remote image, with a decoded-image cache.
///
/// `AsyncImage` is fine for one picture on a page, and wrong for a
/// scrolling feed. It decodes at the image's **full** resolution and
/// keeps no decoded cache, so a 4032x3024 listing photo shown in a
/// 200pt card costs roughly 48MB of memory every time the row scrolls
/// back into view. ZRP's uploads reach 4MB for images, and a feed shows
/// many at once.
///
/// This does three things `AsyncImage` does not:
///
/// 1. **Downsamples during decode** with ImageIO, so only the pixels the
///    view will actually draw are ever allocated - the same technique
///    the composer already uses for local attachments.
/// 2. **Caches the decoded result**, keyed by URL *and* target size, so
///    scrolling back is free and the same photo at two sizes does not
///    fight over one entry.
/// 3. **Gives the byte cache a realistic budget.** The shared URLCache
///    default is far too small for an image-heavy app, so a dedicated
///    session gets its own.
///
/// Deliberately not used for the full-screen viewer, which must show the
/// real image at full resolution, or the GIF picker, whose images are
/// animated.
@MainActor
final class RemoteImageLoader {

    static let shared = RemoteImageLoader()

    private let cache: NSCache<NSString, UIImage> = {
        let cache = NSCache<NSString, UIImage>()
        // Counted in bytes via `totalCostLimit`, so the limit means what
        // it says regardless of how many images are held.
        cache.totalCostLimit = 64 * 1024 * 1024
        return cache
    }()

    private let session: URLSession = {
        let configuration = URLSessionConfiguration.default
        configuration.urlCache = URLCache(
            memoryCapacity: 32 * 1024 * 1024,
            diskCapacity: 256 * 1024 * 1024,
            diskPath: "zrp-images"
        )
        configuration.requestCachePolicy = .returnCacheDataElseLoad
        // Images live on UploadThing's CDN, never on zrp.one, so the
        // session cookie must not travel with them.
        configuration.httpCookieAcceptPolicy = .never
        configuration.httpShouldSetCookies = false
        return URLSession(configuration: configuration)
    }()

    private init() {}

    func cached(_ url: URL, maxPixelSize: Int) -> UIImage? {
        cache.object(forKey: Self.key(url, maxPixelSize) as NSString)
    }

    func image(for url: URL, maxPixelSize: Int) async -> UIImage? {
        let key = Self.key(url, maxPixelSize) as NSString
        if let cached = cache.object(forKey: key) { return cached }

        guard let (data, _) = try? await session.data(from: url) else { return nil }
        guard let image = Self.downsample(data, maxPixelSize: maxPixelSize) else { return nil }

        // 4 bytes per pixel is the decoded footprint, which is what the
        // budget is actually protecting - not the compressed size.
        let cost = Int(image.size.width * image.size.height * image.scale * image.scale * 4)
        cache.setObject(image, forKey: key, cost: cost)
        return image
    }

    private static func key(_ url: URL, _ maxPixelSize: Int) -> String {
        "\(url.absoluteString)|\(maxPixelSize)"
    }

    /// Decodes straight to the needed size. `ShouldCacheImmediately`
    /// forces the decode here rather than during the first frame that
    /// draws it.
    private nonisolated static func downsample(_ data: Data, maxPixelSize: Int) -> UIImage? {
        let sourceOptions = [kCGImageSourceShouldCache: false] as CFDictionary
        guard let source = CGImageSourceCreateWithData(data as CFData, sourceOptions) else {
            return nil
        }
        let options = [
            kCGImageSourceCreateThumbnailFromImageAlways: true,
            kCGImageSourceCreateThumbnailWithTransform: true,
            kCGImageSourceShouldCacheImmediately: true,
            kCGImageSourceThumbnailMaxPixelSize: maxPixelSize,
        ] as CFDictionary
        guard let thumbnail = CGImageSourceCreateThumbnailAtIndex(source, 0, options) else {
            return nil
        }
        return UIImage(cgImage: thumbnail)
    }
}

/// A remote image sized for where it is shown.
///
/// `targetSize` is in points; the pixel budget is derived from it and the
/// screen scale, which is what makes the downsampling correct on a 3x
/// device without over-allocating on a 2x one.
struct RemoteImage<Placeholder: View>: View {

    private let url: URL?
    private let targetSize: CGFloat
    private let placeholder: () -> Placeholder

    @State private var image: UIImage?

    /// The environment's scale rather than `UIScreen.main.scale`: the
    /// latter assumes one screen, and is the API Apple has been steering
    /// away from. This also tracks correctly when a window moves between
    /// displays.
    @Environment(\.displayScale) private var displayScale

    init(
        url: String?,
        targetSize: CGFloat,
        @ViewBuilder placeholder: @escaping () -> Placeholder
    ) {
        self.url = url.flatMap { $0.isEmpty ? nil : URL(string: $0) }
        self.targetSize = targetSize
        self.placeholder = placeholder
    }

    private var maxPixelSize: Int {
        Int(targetSize * displayScale)
    }

    var body: some View {
        Group {
            if let image {
                Image(uiImage: image)
                    .resizable()
            } else {
                placeholder()
            }
        }
        .task(id: url) { await load() }
    }

    private func load() async {
        guard let url else { return }
        // A cache hit renders on this frame rather than flashing the
        // placeholder for one runloop turn on every scroll.
        if let hit = RemoteImageLoader.shared.cached(url, maxPixelSize: maxPixelSize) {
            image = hit
            return
        }
        let loaded = await RemoteImageLoader.shared.image(for: url, maxPixelSize: maxPixelSize)
        guard !Task.isCancelled else { return }
        image = loaded
    }
}
