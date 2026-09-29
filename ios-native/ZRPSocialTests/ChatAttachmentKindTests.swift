import XCTest
@testable import ZRPSocial

/// `ChatContactSheet`'s "Shared media" grid used to filter on `imageUrl`
/// presence alone, which also matches voice notes, documents, and videos
/// (all three share that same field - see `ChatAttachmentKind`'s own
/// doc comment) and rendered a broken tile for each instead of the
/// actual photos the heading promises. The fix (Task #5, iOS parity
/// audit) filters on `ChatAttachmentKind.of(_:) == .image`, the same
/// classifier already used elsewhere (`GroupConversationView`); this
/// covers that classifier directly for every marker the wire format
/// defines.
final class ChatAttachmentKindTests: XCTestCase {

    func testAPlainCaptionIsAnImage() {
        XCTAssertEqual(ChatAttachmentKind.of("Check this out"), .image)
    }

    func testAnEmptyCaptionIsAnImage() {
        XCTAssertEqual(ChatAttachmentKind.of(""), .image)
    }

    func testANilContentIsAnImage() {
        XCTAssertEqual(ChatAttachmentKind.of(nil), .image)
    }

    func testAVideoMarkerIsClassifiedAsVideoNotImage() {
        XCTAssertEqual(ChatAttachmentKind.of("🎬 Video"), .video)
    }

    func testAVoiceMarkerIsClassifiedAsVoiceNotImage() {
        XCTAssertEqual(ChatAttachmentKind.of("🎤 Voice message (0:07)"), .voice)
    }

    func testADocumentMarkerIsClassifiedAsDocumentNotImage() {
        XCTAssertEqual(ChatAttachmentKind.of("📎 quarterly-report.pdf"), .document)
    }

    /// The concrete regression: filtering a mixed thread's messages down
    /// to "real photos only" for the shared-media grid.
    func testFilteringAMixedThreadKeepsOnlyRealImages() {
        let messageContents = [
            "Check this out",            // image (plain caption)
            "🎬 Video",                   // video - must be excluded
            "🎤 Voice message (0:12)",    // voice - must be excluded
            "📎 report.pdf",              // document - must be excluded
            "",                            // image (blank caption)
        ]
        let imagesOnly = messageContents.filter { ChatAttachmentKind.of($0) == .image }
        XCTAssertEqual(imagesOnly, ["Check this out", ""])
    }
}
