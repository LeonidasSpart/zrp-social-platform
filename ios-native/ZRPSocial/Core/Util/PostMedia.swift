import Foundation

/// Decides whether a post's media is a video, a GIF, or a still image.
///
/// Ported field-for-field from the web app's own `PostCard.tsx` rather
/// than guessed, so a post that plays as a video on the website plays as
/// one here too. The heuristic has to combine `mediaType`, the file
/// extension, *and* URL path patterns because ZRP's storage/CDN URLs
/// frequently carry no extension at all.
enum PostMedia {

    private static let imageExtensions: Set<String> = [
        "jpg", "jpeg", "png", "gif", "webp", "svg", "avif",
        "bmp", "tif", "tiff", "heic", "heif",
    ]

    private static let videoExtensions: Set<String> = [
        "mp4", "webm", "mov", "avi", "mkv", "m4v",
        "3gp", "3g2", "ogv", "mpeg", "mpg", "m2v", "ts",
    ]

    private static let videoPathMarkers = [
        "/video/", "/videos/", "/media/video/", "/uploads/video/", "video=true",
    ]

    /// Strips the query and fragment, so `.../clip.mp4?token=x` still
    /// matches on its real extension.
    private static func mediaPath(_ url: String?) -> String {
        guard let url, !url.isEmpty else { return "" }
        return url.lowercased()
            .components(separatedBy: "?")[0]
            .components(separatedBy: "#")[0]
    }

    private static func normalized(_ mediaType: String?) -> String {
        (mediaType ?? "")
            .trimmingCharacters(in: .whitespacesAndNewlines)
            .lowercased()
            .components(separatedBy: .whitespacesAndNewlines)
            .joined()
    }

    /// A GIF is just an image-typed URL as far as the API is concerned -
    /// the composer attaches one via `imageUrls` + `mediaType: "image"` -
    /// so it is recognised on read-back from the real `.gif` extension.
    static func isGif(url: String?, mediaType: String?) -> Bool {
        let type = normalized(mediaType)
        return mediaPath(url).hasSuffix(".gif") || type == "gif" || type == "image/gif"
    }

    private static func isExplicitVideoType(_ mediaType: String?) -> Bool {
        let type = normalized(mediaType)
        return type == "video" || type == "videos" || type == "movie"
            || type.hasPrefix("video/")
    }

    private static func isExplicitImageType(_ mediaType: String?) -> Bool {
        let type = normalized(mediaType)
        return type == "image" || type == "images" || type == "photo"
            || type == "picture" || type.hasPrefix("image/")
    }

    static func isVideo(_ post: Post) -> Bool {
        isVideo(
            imageUrl: post.imageUrl,
            imageUrls: post.imageUrls,
            mediaType: post.mediaType
        )
    }

    static func isVideo(_ quoted: QuotedPost) -> Bool {
        isVideo(
            imageUrl: quoted.imageUrl,
            imageUrls: quoted.imageUrls,
            mediaType: quoted.mediaType
        )
    }

    static func isVideo(imageUrl: String?, imageUrls: [String]?, mediaType: String?) -> Bool {
        let url = imageUrl ?? ""
        let path = mediaPath(url)
        let ext = path.components(separatedBy: ".").last ?? ""

        // A multi-image post is a gallery by definition, and a GIF is an
        // image - neither is ever treated as video, whatever the URL says.
        guard !isGif(url: imageUrl, mediaType: mediaType),
              (imageUrls?.count ?? 0) <= 1,
              !isExplicitImageType(mediaType)
        else {
            return false
        }

        if isExplicitVideoType(mediaType) { return true }
        if videoExtensions.contains(ext) { return true }

        // Only fall back to path sniffing when the URL carries no
        // recognisable image extension - otherwise a legitimate
        // ".../videos/thumb.jpg" would be misread as a video.
        guard !imageExtensions.contains(ext) else { return false }
        return videoPathMarkers.contains { url.contains($0) }
    }
}
