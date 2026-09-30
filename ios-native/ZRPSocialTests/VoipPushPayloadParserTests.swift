import XCTest
@testable import ZRPSocial

/// Coverage for `VoipPushPayloadParser` - the exact payload
/// `sendApnsVoip` (`src/lib/apns.ts`) sends over PushKit's `voip` APNs
/// topic, decoded and validated before `VoipPushCoordinator` ever
/// reports a call to CXProvider. Pulled out as a pure function
/// specifically so this can be tested without constructing a real
/// `PKPushPayload`/`CXProvider`.
final class VoipPushPayloadParserTests: XCTestCase {

    func testValidPayloadDecodesFully() {
        let userInfo: [AnyHashable: Any] = [
            "callerId": "caller-1",
            "callId": "call-abc",
            "callerName": "Ada Lovelace",
            "callerUsername": "ada",
            "isVideo": true,
        ]
        XCTAssertEqual(
            VoipPushPayloadParser.parse(userInfo),
            VoipPushPayload(callerId: "caller-1", callId: "call-abc", callerName: "Ada Lovelace", isVideo: true)
        )
    }

    func testMissingCallerIdIsRejected() {
        let userInfo: [AnyHashable: Any] = ["callId": "call-abc", "callerName": "Ada"]
        XCTAssertNil(VoipPushPayloadParser.parse(userInfo))
    }

    func testMissingCallIdIsRejected() {
        let userInfo: [AnyHashable: Any] = ["callerId": "caller-1", "callerName": "Ada"]
        XCTAssertNil(VoipPushPayloadParser.parse(userInfo))
    }

    func testEmptyStringCallerIdOrCallIdIsRejected() {
        XCTAssertNil(VoipPushPayloadParser.parse(["callerId": "", "callId": "call-1"]))
        XCTAssertNil(VoipPushPayloadParser.parse(["callerId": "caller-1", "callId": ""]))
    }

    func testEmptyOrCompletelyEmptyPayloadIsRejected() {
        XCTAssertNil(VoipPushPayloadParser.parse([:]))
    }

    func testWrongTypeFieldsAreRejected() {
        // A malformed/unexpected payload (e.g. a future backend bug
        // sending numbers instead of strings) must never crash this -
        // it just fails to parse, exactly like a missing field.
        let userInfo: [AnyHashable: Any] = ["callerId": 12345, "callId": "call-1"]
        XCTAssertNil(VoipPushPayloadParser.parse(userInfo))
    }

    func testMissingCallerNameFallsBackToCallerId() {
        let userInfo: [AnyHashable: Any] = ["callerId": "caller-1", "callId": "call-1"]
        XCTAssertEqual(VoipPushPayloadParser.parse(userInfo)?.callerName, "caller-1")
    }

    func testEmptyCallerNameFallsBackToCallerId() {
        let userInfo: [AnyHashable: Any] = ["callerId": "caller-1", "callId": "call-1", "callerName": ""]
        XCTAssertEqual(VoipPushPayloadParser.parse(userInfo)?.callerName, "caller-1")
    }

    func testMissingIsVideoDefaultsFalse() {
        let userInfo: [AnyHashable: Any] = ["callerId": "caller-1", "callId": "call-1"]
        XCTAssertEqual(VoipPushPayloadParser.parse(userInfo)?.isVideo, false)
    }

    func testIsVideoTrueIsPreserved() {
        let userInfo: [AnyHashable: Any] = ["callerId": "caller-1", "callId": "call-1", "isVideo": true]
        XCTAssertEqual(VoipPushPayloadParser.parse(userInfo)?.isVideo, true)
    }
}
