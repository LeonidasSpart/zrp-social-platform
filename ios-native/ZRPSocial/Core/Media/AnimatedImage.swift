import ImageIO
import SwiftUI
import UIKit
import UniformTypeIdentifiers

/// A GIF, actually animating.
///
/// SwiftUI's `Image` draws only the first frame of an animated `UIImage`;
/// `UIImageView` is the one thing in UIKit that plays one. So this wraps
/// it rather than reimplementing a timer-driven frame swap, which would
/// burn a display link per GIF in a scrolling feed.
///
/// A GIF that fails to load, or is not animated at all, falls back to the
/// still image path - a single-frame GIF is a perfectly ordinary picture.
struct AnimatedImage: View {

    let url: String
    let fallbackTargetSize: CGFloat

    @State private var animated: UIImage?
    @State private var didTry = false

    var body: some View {
        Group {
            if let animated {
                AnimatedImageRepresentable(image: animated)
            } else if didTry {
                // Not animated, or unreadable: the ordinary downsampling
                // loader handles it, cache and all.
                RemoteImage(url: url, targetSize: fallbackTargetSize) {
                    Rectangle().fill(ZrpColor.surfaceHighest)
                }
                .scaledToFill()
            } else {
                Rectangle().fill(ZrpColor.surfaceHighest)
            }
        }
        .task(id: url) {
            didTry = false
            animated = await AnimatedImageLoader.shared.image(for: url)
            didTry = true
        }
    }
}

/// The `UIImageView` that plays it.
///
/// `contentMode` matches the still path's `scaledToFill` so a GIF and a
/// photo in the same gallery are framed identically.
private struct AnimatedImageRepresentable: UIViewRepresentable {

    let image: UIImage

    func makeUIView(context: Context) -> UIImageView {
        let view = UIImageView()
        view.contentMode = .scaleAspectFill
        view.clipsToBounds = true
        // Without these the view refuses to shrink inside a SwiftUI
        // frame and pushes the card wider than the screen.
        view.setContentCompressionResistancePriority(.defaultLow, for: .horizontal)
        view.setContentCompressionResistancePriority(.defaultLow, for: .vertical)
        view.setContentHuggingPriority(.defaultLow, for: .horizontal)
        view.setContentHuggingPriority(.defaultLow, for: .vertical)
        return view
    }

    func updateUIView(_ view: UIImageView, context: Context) {
        guard view.image !== image else { return }
        view.image = image
        view.startAnimating()
    }
}

/// Builds animated `UIImage`s from GIF data, and caches them.
///
/// Separate from `RemoteImageLoader` because the two want opposite
/// things: that one downsamples to a target size and caches per size,
/// while a GIF must keep every frame at its own size and is cached once.
@MainActor
final class AnimatedImageLoader {

    static let shared = AnimatedImageLoader()

    /// Modest by design. An animated GIF holds every frame decoded, so a
    /// handful of large ones is a lot of memory - and unlike photos, a
    /// feed rarely shows many at once.
    private let cache: NSCache<NSString, UIImage> = {
        let cache = NSCache<NSString, UIImage>()
        cache.totalCostLimit = 32 * 1024 * 1024
        return cache
    }()

    private let session: URLSession = {
        let configuration = URLSessionConfiguration.default
        configuration.urlCache = URLCache(
            memoryCapacity: 8 * 1024 * 1024,
            diskCapacity: 64 * 1024 * 1024,
            diskPath: "zrp-gifs"
        )
        configuration.requestCachePolicy = .returnCacheDataElseLoad
        // GIFs come from Giphy or UploadThing, never from zrp.one, so the
        // session cookie must not travel with them.
        configuration.httpCookieAcceptPolicy = .never
        configuration.httpShouldSetCookies = false
        return URLSession(configuration: configuration)
    }()

    private init() {}

    /// `nil` when the data is not an animated image - the caller then
    /// shows it as a still, which is what a one-frame GIF is.
    func image(for urlString: String) async -> UIImage? {
        let key = urlString as NSString
        if let cached = cache.object(forKey: key) { return cached }
        guard let url = URL(string: urlString) else { return nil }
        guard let (data, _) = try? await session.data(from: url) else { return nil }
        guard let image = Self.animated(from: data) else { return nil }

        let frames = image.images?.count ?? 1
        let cost = Int(image.size.width * image.size.height * 4) * frames
        cache.setObject(image, forKey: key, cost: cost)
        return image
    }

    /// Decodes every frame and reproduces the GIF's own timing.
    ///
    /// `UIImage.animatedImage(with:duration:)` gives every frame the same
    /// share of the total, but a GIF's frames each carry their own delay.
    /// Frames are therefore repeated in proportion to their delay against
    /// the shortest one, which is the standard way to express variable
    /// timing through that API - a 200ms frame beside a 50ms frame
    /// appears four times.
    private nonisolated static func animated(from data: Data) -> UIImage? {
        guard let source = CGImageSourceCreateWithData(data as CFData, nil) else { return nil }
        let count = CGImageSourceGetCount(source)
        guard count > 1 else { return nil }

        var frames: [(image: CGImage, delay: Double)] = []
        for index in 0..<count {
            guard let cgImage = CGImageSourceCreateImageAtIndex(source, index, nil) else { continue }
            frames.append((cgImage, delay(of: source, at: index)))
        }
        guard frames.count > 1 else { return nil }

        let shortest = frames.map(\.delay).min() ?? Self.minimumDelay
        guard shortest > 0 else { return nil }

        var expanded: [UIImage] = []
        var total: Double = 0
        for frame in frames {
            // At least one copy, so a frame is never dropped by rounding.
            let repeats = max(1, Int((frame.delay / shortest).rounded()))
            // A pathological GIF - one frame 100x longer than another -
            // must not expand into thousands of entries.
            let bounded = min(repeats, 40)
            expanded.append(contentsOf: Array(repeating: UIImage(cgImage: frame.image), count: bounded))
            total += Double(bounded) * shortest
        }
        guard !expanded.isEmpty else { return nil }
        return UIImage.animatedImage(with: expanded, duration: total)
    }

    /// What browsers use for a delay of zero or an absent one. A GIF
    /// asking for 0s is asking to run as fast as the machine can, which
    /// no renderer actually honours.
    private nonisolated static let minimumDelay = 0.1

    private nonisolated static func delay(of source: CGImageSource, at index: Int) -> Double {
        guard
            let properties = CGImageSourceCopyPropertiesAtIndex(source, index, nil)
                as? [CFString: Any],
            let gif = properties[kCGImagePropertyGIFDictionary] as? [CFString: Any]
        else {
            return minimumDelay
        }
        // Unclamped first: it is the delay the file actually asks for.
        // `kCGImagePropertyGIFDelayTime` is already clamped by the
        // decoder and loses very fast animations.
        let unclamped = gif[kCGImagePropertyGIFUnclampedDelayTime] as? Double
        let clamped = gif[kCGImagePropertyGIFDelayTime] as? Double
        let value = unclamped ?? clamped ?? minimumDelay
        return value < 0.011 ? minimumDelay : value
    }
}
