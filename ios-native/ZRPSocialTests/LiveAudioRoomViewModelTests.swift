import XCTest
@testable import ZRPSocial

/// Pure-function coverage for `LiveAudioRoomViewModel`'s role/queue logic -
/// mirrors `src/lib/live-audio/room-service.ts`'s own `canPromoteSpeaker`/
/// `isRoomAuthority` checks, and the Android sibling's own identical test
/// file.
final class LiveAudioRoomViewModelTests: XCTestCase {

    func testHostModeratorAndSpeakerCanPublishAudio() {
        XCTAssertTrue(canPublishLiveAudio("HOST"))
        XCTAssertTrue(canPublishLiveAudio("MODERATOR"))
        XCTAssertTrue(canPublishLiveAudio("SPEAKER"))
    }

    func testListenerAndNilCannotPublishAudio() {
        XCTAssertFalse(canPublishLiveAudio("LISTENER"))
        XCTAssertFalse(canPublishLiveAudio(nil))
    }

    func testOnlyHostAndModeratorAreRoomAuthority() {
        XCTAssertTrue(isLiveAudioAuthority("HOST"))
        XCTAssertTrue(isLiveAudioAuthority("MODERATOR"))
        XCTAssertFalse(isLiveAudioAuthority("SPEAKER"))
        XCTAssertFalse(isLiveAudioAuthority("LISTENER"))
        XCTAssertFalse(isLiveAudioAuthority(nil))
    }

    func testAddPendingSpeakerRequestAppendsANewRequester() {
        XCTAssertEqual(addPendingSpeakerRequest(["u1"], "u2"), ["u1", "u2"])
    }

    func testAddPendingSpeakerRequestDoesNotDuplicateAnExistingRequester() {
        XCTAssertEqual(addPendingSpeakerRequest(["u1", "u2"], "u2"), ["u1", "u2"])
    }

    func testRemovePendingSpeakerRequestDropsOnlyTheResolvedRequester() {
        XCTAssertEqual(removePendingSpeakerRequest(["u1", "u2", "u3"], "u2"), ["u1", "u3"])
    }

    func testRemovePendingSpeakerRequestIsANoOpForAnUnknownId() {
        XCTAssertEqual(removePendingSpeakerRequest(["u1"], "u9"), ["u1"])
    }
}
