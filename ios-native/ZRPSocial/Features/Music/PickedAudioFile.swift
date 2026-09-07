import AVFoundation
import Foundation
import UniformTypeIdentifiers

/// An audio file chosen from Files, copied into app-owned storage.
///
/// `fileImporter` hands back a **security-scoped** URL that belongs to
/// another process's sandbox - an iCloud Drive container, or a
/// third-party provider like Dropbox or Google Drive. Access to it is
/// only valid between `startAccessingSecurityScopedResource()` and its
/// stop, and the provider may not even hold the bytes locally yet. An
/// upload that streams from that URL minutes later is exactly the case
/// that fails, so the file is copied through `NSFileCoordinator` up
/// front: coordinating the read is what makes the provider materialise a
/// not-yet-downloaded file instead of handing back a zero-byte
/// placeholder.
///
/// This is the iOS counterpart of the website's `verifyFileReadable`
/// pre-flight, and it exists for the same reason its comment gives: a
/// cloud-backed file that cannot actually be read must fail visibly at
/// pick time, not silently mid-upload.
struct PickedAudioFile: Identifiable, Equatable {

    let id = UUID()
    let url: URL
    let fileName: String
    let mimeType: String
    let byteCount: Int64

    /// The real decoded length, from `AVURLAsset`. `nil` when the format
    /// cannot be inspected - publishing continues without it, exactly as
    /// on web, because `POST /api/music/tracks/play` backfills a missing
    /// duration from the first listener anyway.
    let durationSec: Int?

    enum PickError: Error {
        case accessDenied
        case unreadable
        case empty
    }

    /// Audio types the ZRP uploader accepts, matching `AUDIO_EXTENSIONS`
    /// in `src/lib/uploadthing.ts`. Declared as UTTypes so the Files
    /// browser greys out anything the server would reject, rather than
    /// letting someone pick a file that fails after a long upload.
    static let allowedContentTypes: [UTType] = {
        let extensions = ["mp3", "wav", "m4a", "aac", "aiff", "aif", "flac", "ogg", "oga", "opus", "wma"]
        var types = extensions.compactMap { UTType(filenameExtension: $0) }
        // `.audio` catches system-declared audio types whose extension
        // lookup fails on some providers; the server re-validates by
        // extension regardless.
        types.append(.audio)
        return types
    }()

    init(pickedAt source: URL) async throws {
        // A URL from `fileImporter` needs its scope opened before it can
        // be read, and closed exactly once afterwards. A URL the app
        // already owns returns false here, which is not a failure.
        let scoped = source.startAccessingSecurityScopedResource()
        defer { if scoped { source.stopAccessingSecurityScopedResource() } }

        let destination = FileManager.default.temporaryDirectory
            .appendingPathComponent("zrp-audio-\(UUID().uuidString)")
            .appendingPathExtension(source.pathExtension)

        var coordinatorError: NSError?
        var copyError: Error?
        NSFileCoordinator().coordinate(
            readingItemAt: source,
            options: .forUploading,
            error: &coordinatorError
        ) { readable in
            do {
                try FileManager.default.copyItem(at: readable, to: destination)
            } catch {
                copyError = error
            }
        }

        if coordinatorError != nil || copyError != nil {
            throw PickError.unreadable
        }

        let attributes = try? FileManager.default.attributesOfItem(atPath: destination.path)
        let size = (attributes?[.size] as? NSNumber)?.int64Value ?? 0
        guard size > 0 else {
            try? FileManager.default.removeItem(at: destination)
            throw PickError.empty
        }

        url = destination
        byteCount = size
        fileName = source.lastPathComponent

        // UploadThing's `musicTrack` route accepts a generic type
        // because iOS reports one for several audio formats; sending the
        // real type when it is known is still better, and the server
        // falls back to the filename extension either way.
        mimeType = UTType(filenameExtension: source.pathExtension)?.preferredMIMEType
            ?? "application/octet-stream"

        durationSec = await Self.probeDuration(of: destination)
    }

    /// Reads the track's real length. Returns `nil` rather than throwing:
    /// a duration that cannot be read must never block publishing.
    private static func probeDuration(of url: URL) async -> Int? {
        let asset = AVURLAsset(url: url)
        guard let duration = try? await asset.load(.duration) else { return nil }
        let seconds = CMTimeGetSeconds(duration)
        guard seconds.isFinite, seconds > 0 else { return nil }
        return Int(seconds.rounded())
    }

    var lastModifiedMilliseconds: Int64 {
        let attributes = try? FileManager.default.attributesOfItem(atPath: url.path)
        let date = (attributes?[.modificationDate] as? Date) ?? Date()
        return Int64(date.timeIntervalSince1970 * 1000)
    }

    func asUploadCandidate() -> UploadCandidate {
        UploadCandidate(
            fileURL: url,
            fileName: fileName,
            mimeType: mimeType,
            byteCount: byteCount,
            lastModifiedMilliseconds: lastModifiedMilliseconds
        )
    }

    /// Deletes the app's copy - a discarded 200MB track must not sit in
    /// temporary storage waiting for iOS to purge it.
    func discard() {
        try? FileManager.default.removeItem(at: url)
    }

    static func == (lhs: PickedAudioFile, rhs: PickedAudioFile) -> Bool {
        lhs.id == rhs.id
    }
}
