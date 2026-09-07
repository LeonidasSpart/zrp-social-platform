import Foundation
import PhotosUI
import SwiftUI
import UniformTypeIdentifiers

/// A file chosen from the photo library, copied to app-owned temporary
/// storage.
///
/// The copy is not incidental. `PhotosPicker` hands over a URL inside a
/// system-owned sandbox that is deleted the moment the transfer closure
/// returns, so anything read later - which is exactly what an upload
/// does - must read from a copy the app controls.
struct PickedMedia: Transferable, Identifiable, Equatable {

    let id = UUID()
    let url: URL
    let fileName: String
    let mimeType: String
    let byteCount: Int64
    let isVideo: Bool

    var isGif: Bool { mimeType.lowercased() == "image/gif" }

    static var transferRepresentation: some TransferRepresentation {
        // Movies first: a video also conforms to `.item`, so a broader
        // representation listed earlier would swallow it and lose the
        // video classification.
        FileRepresentation(importedContentType: .movie) { received in
            try PickedMedia(copying: received.file, isVideo: true)
        }
        FileRepresentation(importedContentType: .image) { received in
            try PickedMedia(copying: received.file, isVideo: false)
        }
    }

    private init(copying source: URL, isVideo: Bool) throws {
        let destination = FileManager.default.temporaryDirectory
            .appendingPathComponent("zrp-picked-\(UUID().uuidString)")
            .appendingPathExtension(source.pathExtension)

        try FileManager.default.copyItem(at: source, to: destination)

        url = destination
        fileName = source.lastPathComponent
        self.isVideo = isVideo

        let type = UTType(filenameExtension: source.pathExtension)
        mimeType = type?.preferredMIMEType
            ?? (isVideo ? "video/mp4" : "image/jpeg")

        let attributes = try? FileManager.default.attributesOfItem(atPath: destination.path)
        byteCount = (attributes?[.size] as? NSNumber)?.int64Value ?? 0
    }

    /// Milliseconds since the epoch, matching what a browser's `File`
    /// reports - the upload protocol asks for it.
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

    /// Deletes the app's copy. The composer calls this when an
    /// attachment is removed or the draft is discarded, so a cancelled
    /// 2GB video does not sit in temporary storage until iOS purges it.
    func discard() {
        try? FileManager.default.removeItem(at: url)
    }

    static func == (lhs: PickedMedia, rhs: PickedMedia) -> Bool {
        lhs.id == rhs.id
    }
}
