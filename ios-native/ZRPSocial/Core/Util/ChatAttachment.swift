import Foundation

/// How ZRP says what kind of attachment a message carries.
///
/// `Message` has **one** media column, `imageUrl`, and **no** type
/// column. The kind is therefore encoded as a marker at the start of
/// `content`, and that marker is a wire format shared with web and
/// Android - not decoration, and not this app's to redesign:
///
/// ```
/// "🎬 Video"                     + imageUrl  -> a video
/// "🎤 Voice message (0:07)"      + imageUrl  -> a voice note
/// "📎 quarterly-report.pdf"      + imageUrl  -> a document
/// anything else                  + imageUrl  -> an image
/// ```
///
/// Both halves matter. Sending a voice note without the `🎤` prefix
/// would make every other client render it as a broken image; reading a
/// `🎤` message as an image would do the same here. The strings are
/// produced by `src/components/ChatInterface.tsx` and
/// `GroupChatInterface.tsx`, and are deliberately **not** localized
/// there - they are matched on, so translating them would break
/// interoperability between a French sender and an English reader.
enum ChatAttachmentKind: Equatable {
    case image
    case video
    case voice
    case document

    /// Classifies a message from its content marker.
    ///
    /// Only meaningful when the message actually has an `imageUrl`; a
    /// text message that happens to begin with a clapperboard emoji has
    /// no attachment to mis-render.
    static func of(content: String?) -> ChatAttachmentKind {
        guard let content else { return .image }
        if content.hasPrefix(ChatAttachmentMarker.video) { return .video }
        if content.hasPrefix(ChatAttachmentMarker.voice) { return .voice }
        if content.hasPrefix(ChatAttachmentMarker.document) { return .document }
        return .image
    }
}

/// The marker characters themselves, in one place.
enum ChatAttachmentMarker {
    static let video = "🎬"
    static let voice = "🎤"
    static let document = "📎"

    /// What web sends for a video. A fixed English string because it is
    /// matched on by every client, including this one.
    static let videoContent = "🎬 Video"

    /// `"🎤 Voice message (1:05)"`.
    ///
    /// The duration is rendered `m:ss` with the seconds zero-padded to
    /// two digits, which is exactly what `formatRecordingTime` produces
    /// in both web chat components. Minutes are not padded and not
    /// wrapped at 60 - a 75-second note reads "1:15" on every platform.
    static func voiceContent(seconds: Int) -> String {
        let safe = max(0, seconds)
        let minutes = safe / 60
        let remainder = safe % 60
        return "🎤 Voice message (\(minutes):\(String(format: "%02d", remainder)))"
    }

    static func documentContent(fileName: String) -> String {
        "📎 \(fileName)"
    }

    /// The file name back out of a document message.
    ///
    /// Mirrors web's `content.replace(/^📎\s*/, "")`. Returns nil rather
    /// than an empty string when there is nothing left, so the caller can
    /// fall back to the translated "Document" label instead of showing a
    /// blank file card.
    static func documentName(from content: String?) -> String? {
        guard let content, content.hasPrefix(document) else { return nil }
        let name = content
            .dropFirst(document.count)
            .trimmingCharacters(in: .whitespaces)
        return name.isEmpty ? nil : name
    }

    /// The duration text back out of a voice message, e.g. `"0:07"`.
    ///
    /// Read from the marker rather than from the audio file: the
    /// duration is known before the file is downloaded, so the bubble can
    /// show how long a note is without fetching it first. Returns nil for
    /// anything that does not match, which includes notes from a future
    /// client that words the marker differently - the player still works,
    /// it just shows no duration until it has loaded the file.
    static func voiceDuration(from content: String?) -> String? {
        guard let content, content.hasPrefix(voice) else { return nil }
        guard let open = content.lastIndex(of: "("),
              let close = content.lastIndex(of: ")"),
              open < close
        else { return nil }
        let inner = content[content.index(after: open)..<close]
        return inner.isEmpty ? nil : String(inner)
    }
}
