import Foundation
import UniformTypeIdentifiers

/// A file picked from Files, copied somewhere the app controls.
///
/// `fileImporter` hands back a security-scoped URL that is only valid
/// inside a `startAccessingSecurityScopedResource()` pair and may live in
/// another process's container. An upload reads it later, on a different
/// task, so it has to read a copy.
struct PickedDocument: Equatable {

    let url: URL
    let fileName: String
    let mimeType: String
    let byteCount: Int64

    init(copying source: URL) throws {
        let scoped = source.startAccessingSecurityScopedResource()
        defer { if scoped { source.stopAccessingSecurityScopedResource() } }

        let destination = FileManager.default.temporaryDirectory
            .appendingPathComponent("zrp-doc-\(UUID().uuidString)")
            .appendingPathExtension(source.pathExtension)

        try FileManager.default.copyItem(at: source, to: destination)

        url = destination
        fileName = source.lastPathComponent
        // The router accepts pdf, text and blob. An unknown extension
        // resolves to `application/octet-stream`, which is the blob
        // category - which is why arbitrary files work at all.
        mimeType = UTType(filenameExtension: source.pathExtension)?.preferredMIMEType
            ?? "application/octet-stream"

        let attributes = try? FileManager.default.attributesOfItem(atPath: destination.path)
        byteCount = (attributes?[.size] as? NSNumber)?.int64Value ?? 0
    }

    func asUploadCandidate() -> UploadCandidate {
        UploadCandidate(
            fileURL: url,
            fileName: fileName,
            mimeType: mimeType,
            byteCount: byteCount,
            lastModifiedMilliseconds: Int64(Date().timeIntervalSince1970 * 1000)
        )
    }

    func discard() {
        try? FileManager.default.removeItem(at: url)
    }
}

/// Something chosen in the composer that is about to become a message.
///
/// Each case maps to its own UploadThing router entry, because each has
/// its own server-side size cap: 4MB for a chat image, 32MB for a video,
/// 8MB for audio, 8MB for a document. Sending everything through one
/// slug would apply the wrong limit and be refused by the server.
enum PendingChatAttachment {
    case video(PickedMedia)
    case document(PickedDocument)
    case voice(url: URL, fileName: String, seconds: Int)

    var slug: UploadThingClient.Slug {
        switch self {
        case .video: return .chatVideo
        case .document: return .chatFile
        case .voice: return .chatAudio
        }
    }

    /// The message body this attachment must be sent with.
    ///
    /// **Not cosmetic.** `Message` has no type column, so this marker is
    /// the only thing telling every other client what the `imageUrl`
    /// actually is - see `ChatAttachment.swift`. A typed caption is
    /// deliberately not merged in: it would push the marker off the
    /// front of the string and the attachment would render as a broken
    /// image everywhere, including here. Web behaves the same way, which
    /// is why an attachment sends immediately rather than waiting in the
    /// composer beside a caption.
    var messageContent: String {
        switch self {
        case .video:
            return ChatAttachmentMarker.videoContent
        case .document(let document):
            return ChatAttachmentMarker.documentContent(fileName: document.fileName)
        case .voice(_, _, let seconds):
            return ChatAttachmentMarker.voiceContent(seconds: seconds)
        }
    }

    func asUploadCandidate() -> UploadCandidate {
        switch self {
        case .video(let media):
            return media.asUploadCandidate()
        case .document(let document):
            return document.asUploadCandidate()
        case .voice(let url, let fileName, _):
            let attributes = try? FileManager.default.attributesOfItem(atPath: url.path)
            return UploadCandidate(
                fileURL: url,
                fileName: fileName,
                // AAC in an MP4 container. The router's `audio` category
                // matches on the `audio/` prefix, and this is the mime
                // type a browser's `<audio>` element expects for an .m4a.
                mimeType: "audio/mp4",
                byteCount: (attributes?[.size] as? NSNumber)?.int64Value ?? 0,
                lastModifiedMilliseconds: Int64(Date().timeIntervalSince1970 * 1000)
            )
        }
    }

    /// Deletes the app's temporary copy once the upload is done with it.
    func discard() {
        switch self {
        case .video(let media): media.discard()
        case .document(let document): document.discard()
        case .voice(let url, _, _): try? FileManager.default.removeItem(at: url)
        }
    }
}
